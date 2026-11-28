import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { existsSync, mkdtempSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import sharp from 'sharp'

function extractCookieValue(res: Response, name: string) {
  const cookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const raw of cookies) {
    const first = raw.split(';')[0]
    const eq = first.indexOf('=')
    if (eq > 0 && first.slice(0, eq) === name) {
      return first.slice(eq + 1)
    }
  }
  return ''
}

test('standalone Relight Studio isolates auth/users from main dashboard, enforces daily quota, and manages samples', async (t) => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'sibluudz-relight-'))
  process.env.DATA_DIRECTORY = tempRoot
  process.env.MAIL_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  process.env.NODE_ENV = 'test'

  const { db, setSetting } = await import('../server/db.js')
  const { createRelightAdminRouter, createRelightPublicRouter } = await import('../server/routes/relight.routes.js')

  const samplePng = await sharp({
    create: { width: 24, height: 24, channels: 3, background: { r: 140, g: 130, b: 120 } },
  })
    .png()
    .toBuffer()
  const sampleDataUri = `data:image/png;base64,${samplePng.toString('base64')}`

  let imageEditCalls = 0
  let capturedPrompt = ''

  const app = express()
  app.use(express.json({ limit: '16mb' }))
  const samplesDir = join(tempRoot, 'relight-samples')
  const historyDir = join(tempRoot, 'relight-history')

  app.use(
    '/api/relight',
    createRelightPublicRouter({
      samplesDir,
      historyDir,
      callImageEdit: async ({ prompt }) => {
        imageEditCalls += 1
        capturedPrompt = prompt
        return {
          image: sampleDataUri,
          model: 'ag/gemini-3.1-flash-image',
          output: { width: 24, height: 24, bytes: samplePng.length, format: 'png', requestedResolution: '2K', resolutionMatched: true },
        }
      },
    })
  )
  app.use(
    '/api/admin/relight',
    createRelightAdminRouter({
      samplesDir,
      callImageEdit: async ({ prompt }) => {
        imageEditCalls += 1
        capturedPrompt = prompt
        return {
          image: sampleDataUri,
          model: 'ag/gemini-3.1-flash-image',
          output: {
            width: 24,
            height: 24,
            bytes: samplePng.length,
            format: 'png',
            requestedResolution: '2K',
            resolutionMatched: true,
          },
        }
      },
    })
  )

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const addr = server.address()
  assert.ok(addr && typeof addr !== 'string')
  const origin = `http://127.0.0.1:${addr.port}`

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  // Seed main dashboard admin + regular user
  db.prepare('insert into users (id, email, name, role) values (?,?,?,?)').run(
    'main-admin',
    'admin@sibluudz.local',
    'Admin',
    'admin'
  )
  db.prepare('insert into users (id, email, name, role) values (?,?,?,?)').run(
    'main-user',
    'user@sibluudz.local',
    'Regular User',
    'user'
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?,?,?)').run(
    createHash('sha256').update('main-admin-tok').digest('hex'),
    'main-admin',
    Date.now() + 60_000
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?,?,?)').run(
    createHash('sha256').update('main-user-tok').digest('hex'),
    'main-user',
    Date.now() + 60_000
  )

  setSetting('ninerouter_api_key', 'test-9router-key')

  // Regular main-dashboard user cannot access Relight admin endpoints
  const nonAdminRes = await fetch(`${origin}/api/admin/relight/overview`, {
    headers: { Cookie: 'sibluudz_session=main-user-tok' },
  })
  assert.equal(nonAdminRes.status, 403)

  // Admin creates a Relight user with dailyLimit = 1
  const createRes = await fetch(`${origin}/api/admin/relight/users`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Studio Klien',
      username: 'klien_satu',
      email: 'klien@studio.test',
      password: 'secret123',
      dailyLimit: 1,
      note: 'Paket Trial',
    }),
  })
  assert.equal(createRes.status, 201)
  const { user: createdUser } = await createRes.json()
  assert.equal(createdUser.username, 'klien_satu')
  assert.equal(createdUser.dailyLimit, 1)

  // Cross-site Origin rejected, while mobile WebView omitted Origin with valid Referer succeeds
  const crossOriginLogin = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'secret123' }),
  })
  assert.equal(crossOriginLogin.status, 403)

  const refererOnlyLogin = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Referer: `${origin}/`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'secret123' }),
  })
  assert.equal(refererOnlyLogin.status, 200)

  // Wrong password rejected
  const badLogin = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'wrong' }),
  })
  assert.equal(badLogin.status, 401)

  // Login works with username
  const loginRes = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'secret123' }),
  })
  assert.equal(loginRes.status, 200)
  const relightToken = extractCookieValue(loginRes, 'relight_session')
  assert.ok(relightToken)

  // Relight session CANNOT access main dashboard admin API (role/table isolation)
  const crossAccess = await fetch(`${origin}/api/admin/relight/overview`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal(crossAccess.status, 401)

  // Admin uploads custom Before/After sample for strobist
  const sampleUpload = await fetch(`${origin}/api/admin/relight/samples/strobist`, {
    method: 'PUT',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ beforeImage: sampleDataUri, afterImage: sampleDataUri }),
  })
  assert.equal(sampleUpload.status, 200)

  const presetsRes = await fetch(`${origin}/api/relight/presets`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal(presetsRes.status, 200)
  const presetsJson = await presetsRes.json()
  const strobist = presetsJson.presets.find((p: { id: string }) => p.id === 'strobist')
  assert.equal(strobist.hasCustomBefore, true)
  assert.match(strobist.beforeUrl, /^\/api\/relight\/samples\/strobist\/before/)

  const fetchedSample = await fetch(`${origin}${strobist.beforeUrl}`)
  assert.equal(fetchedSample.status, 200)
  assert.equal(fetchedSample.headers.get('content-type'), 'image/jpeg')

  // Separate second browser login shares the exact same remaining quota & sees no-store cache headers
  const browser2Login = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'secret123' }),
  })
  assert.equal(browser2Login.status, 200)
  const relightToken2 = extractCookieValue(browser2Login, 'relight_session')
  assert.ok(relightToken2)

  // Process 1st relight photo in browser 1 -> consumes quota across ALL devices/browsers
  const proc1 = await fetch(`${origin}/api/relight/process`, {
    method: 'POST',
    headers: {
      Cookie: `relight_session=${relightToken}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceImage: sampleDataUri,
      sourceName: 'potret-studio.png',
      settings: { preset: 'softbox', intensity: 'strong', direction: 'left' },
      resolution: '2K',
    }),
  })
  assert.equal(proc1.status, 200)
  const proc1Json = await proc1.json()
  assert.equal(proc1Json.usage.usageToday, 1)
  assert.equal(proc1Json.usage.usageTotal, 1)
  assert.equal(proc1Json.usage.remaining, 0)
  assert.equal(imageEditCalls, 1)
  assert.match(capturedPrompt, /Softbox/i)
  assert.ok(proc1Json.historyItem?.id)
  assert.match(proc1Json.historyItem.beforeUrl, /^\/api\/relight\/history\/.+\/image\/before/)
  assert.match(proc1Json.historyItem.afterUrl, /^\/api\/relight\/history\/.+\/image\/after/)

  // History lists saved item and serves Before + After images exclusively to owner
  const histList1 = await fetch(`${origin}/api/relight/history`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal(histList1.status, 200)
  const histList1Json = await histList1.json()
  assert.equal(histList1Json.retentionDays, 14)
  assert.equal(histList1Json.items.length, 1)
  assert.equal(histList1Json.items[0].sourceName, 'potret-studio.png')
  assert.equal(histList1Json.items[0].preset, 'softbox')

  const beforeImgRes = await fetch(`${origin}${histList1Json.items[0].beforeUrl}`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal(beforeImgRes.status, 200)
  assert.equal(beforeImgRes.headers.get('content-type'), 'image/png')

  const afterImgRes = await fetch(`${origin}${histList1Json.items[0].afterUrl}`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal(afterImgRes.status, 200)
  assert.equal(afterImgRes.headers.get('content-type'), 'image/png')

  // Unauthenticated / another Relight user cannot see or delete user 1's history
  const anonHistRes = await fetch(`${origin}${histList1Json.items[0].afterUrl}`)
  assert.equal(anonHistRes.status, 401)

  const createOtherRes = await fetch(`${origin}/api/admin/relight/users`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Studio Lain',
      username: 'klien_dua',
      password: 'secret123',
      dailyLimit: 5,
    }),
  })
  assert.equal(createOtherRes.status, 201)
  const { user: otherUser } = await createOtherRes.json()
  const otherLogin = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_dua', password: 'secret123' }),
  })
  const otherToken = extractCookieValue(otherLogin, 'relight_session')
  const otherHistList = await fetch(`${origin}/api/relight/history`, {
    headers: { Cookie: `relight_session=${otherToken}` },
  })
  assert.deepEqual((await otherHistList.json()).items, [])
  const otherImgRes = await fetch(`${origin}${histList1Json.items[0].afterUrl}`, {
    headers: { Cookie: `relight_session=${otherToken}` },
  })
  assert.equal(otherImgRes.status, 404)
  const otherDelRes = await fetch(`${origin}/api/relight/history/${histList1Json.items[0].id}`, {
    method: 'DELETE',
    headers: { Cookie: `relight_session=${otherToken}`, Origin: origin },
  })
  assert.equal(otherDelRes.status, 404)
  await fetch(`${origin}/api/admin/relight/users/${otherUser.id}`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=main-admin-tok', Origin: origin },
  })

  const meBrowser2 = await fetch(`${origin}/api/relight/auth/me`, {
    headers: { Cookie: `relight_session=${relightToken2}` },
  })
  assert.match(meBrowser2.headers.get('cache-control') || '', /no-store/i)
  const meBrowser2Json = await meBrowser2.json()
  assert.equal(meBrowser2Json.authenticated, true)
  assert.equal(meBrowser2Json.user.remaining, 0)
  assert.equal(meBrowser2Json.user.usageTotal, 1)

  // 2nd relight photo -> blocked with 429 across browsers
  const proc2 = await fetch(`${origin}/api/relight/process`, {
    method: 'POST',
    headers: {
      Cookie: `relight_session=${relightToken2}`,
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sourceImage: sampleDataUri,
      settings: { preset: 'strobist' },
    }),
  })
  assert.equal(proc2.status, 429)

  // Persistent balance test: backfill usage log to 3 days ago -> still counts toward remaining!
  db.prepare(`update relight_usage_logs set created_at = datetime('now', '-3 days') where user_id = ?`).run(
    createdUser.id
  )
  const meAfterDays = await fetch(`${origin}/api/relight/auth/me`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  const meAfterDaysJson = await meAfterDays.json()
  assert.equal(meAfterDaysJson.user.usageTotal, 1)
  assert.equal(meAfterDaysJson.user.remaining, 0)

  // Admin can reset usage -> balance immediately restored
  const resetUsageRes = await fetch(`${origin}/api/admin/relight/users/${createdUser.id}/reset-usage`, {
    method: 'POST',
    headers: { Cookie: 'sibluudz_session=main-admin-tok', Origin: origin },
  })
  assert.equal(resetUsageRes.status, 200)
  const resetUsageJson = await resetUsageRes.json()
  assert.equal(resetUsageJson.user.usageTotal, 0)
  assert.equal(resetUsageJson.user.remaining, 1)

  // Admin disables user -> immediately revokes session and blocks login (403)
  const disableRes = await fetch(`${origin}/api/admin/relight/users/${createdUser.id}`, {
    method: 'PATCH',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isActive: false }),
  })
  assert.equal(disableRes.status, 200)

  const meAfterDisable = await fetch(`${origin}/api/relight/auth/me`, {
    headers: { Cookie: `relight_session=${relightToken}` },
  })
  assert.equal((await meAfterDisable.json()).authenticated, false)

  const disabledLogin = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien@studio.test', password: 'secret123' }),
  })
  assert.equal(disabledLogin.status, 403)

  // Admin re-enables and resets password -> login with new password succeeds
  await fetch(`${origin}/api/admin/relight/users/${createdUser.id}`, {
    method: 'PATCH',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ isActive: true, dailyLimit: 5 }),
  })
  const resetRes = await fetch(`${origin}/api/admin/relight/users/${createdUser.id}/reset-password`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: 'newpass456' }),
  })
  assert.equal(resetRes.status, 200)

  const reloginRes = await fetch(`${origin}/api/relight/auth/login`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'klien_satu', password: 'newpass456' }),
  })
  assert.equal(reloginRes.status, 200)
  const reloginToken = extractCookieValue(reloginRes, 'relight_session')

  // Seed an expired (15-day-old) history record and ensure GET /history and image fetch hide it immediately
  await writeFile(join(historyDir, 'expired-sample-after.png'), samplePng)
  db.prepare(
    `insert into relight_history (id, user_id, preset, after_filename, after_mime, created_at)
     values (?, ?, ?, ?, ?, datetime('now', '-15 days'))`
  ).run('hist-expired-15d', createdUser.id, 'strobist', 'expired-sample-after.png', 'image/png')

  const histAfter15d = await fetch(`${origin}/api/relight/history`, {
    headers: { Cookie: `relight_session=${reloginToken}` },
  })
  const histAfter15dJson = await histAfter15d.json()
  assert.equal(
    histAfter15dJson.items.some((item: { id: string }) => item.id === 'hist-expired-15d'),
    false
  )
  const expiredImgFetch = await fetch(`${origin}/api/relight/history/hist-expired-15d/image/after`, {
    headers: { Cookie: `relight_session=${reloginToken}` },
  })
  assert.equal(expiredImgFetch.status, 404)

  // Manual delete removes DB row & files on disk without erasing usage quota logs
  const usageBeforeDelete = db
    .prepare('select count(*) as cnt from relight_usage_logs where user_id = ?')
    .get(createdUser.id) as { cnt: number }
  const histIdToDelete = proc1Json.historyItem.id as string
  const delHistRes = await fetch(`${origin}/api/relight/history/${histIdToDelete}`, {
    method: 'DELETE',
    headers: { Cookie: `relight_session=${reloginToken}`, Origin: origin },
  })
  assert.equal(delHistRes.status, 204)
  assert.equal(existsSync(join(historyDir, `${histIdToDelete}-before.png`)), false)
  assert.equal(existsSync(join(historyDir, `${histIdToDelete}-after.png`)), false)

  const histAfterDelete = await fetch(`${origin}/api/relight/history`, {
    headers: { Cookie: `relight_session=${reloginToken}` },
  })
  assert.deepEqual((await histAfterDelete.json()).items, [])
  const usageAfterDelete = db
    .prepare('select count(*) as cnt from relight_usage_logs where user_id = ?')
    .get(createdUser.id) as { cnt: number }
  assert.equal(usageAfterDelete.cnt, usageBeforeDelete.cnt)

  // Admin deletes sample and user cleanly
  const delSample = await fetch(`${origin}/api/admin/relight/samples/strobist`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=main-admin-tok', Origin: origin },
  })
  assert.equal(delSample.status, 204)

  // Admin uploads 1 photo and auto-generates After sample for direct_flash
  const genSampleRes = await fetch(`${origin}/api/admin/relight/samples/direct_flash/generate`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sourceImage: sampleDataUri }),
  })
  assert.equal(genSampleRes.status, 200)
  const genSampleJson = await genSampleRes.json()
  assert.equal(genSampleJson.sample.hasCustomBefore, true)
  assert.equal(genSampleJson.sample.hasCustomAfter, true)
  assert.match(capturedPrompt, /Direct Flash/i)

  const afterFetch = await fetch(`${origin}${genSampleJson.sample.afterUrl}`)
  assert.equal(afterFetch.status, 200)
  assert.equal(afterFetch.headers.get('content-type'), 'image/jpeg')

  // Regenerate After from existing Before without re-uploading
  const regenSampleRes = await fetch(`${origin}/api/admin/relight/samples/direct_flash/generate`, {
    method: 'POST',
    headers: {
      Cookie: 'sibluudz_session=main-admin-tok',
      Origin: origin,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
  assert.equal(regenSampleRes.status, 200)

  // Public /auth/me exposes heroSample when custom sample exists
  const anonMe = await fetch(`${origin}/api/relight/auth/me`)
  const anonMeJson = await anonMe.json()
  assert.equal(anonMeJson.authenticated, false)
  assert.equal(anonMeJson.heroSample?.label, 'Direct Flash')
  assert.match(anonMeJson.heroSample?.afterUrl || '', /^\/api\/relight\/samples\/direct_flash\/after/)

  await fetch(`${origin}/api/admin/relight/samples/direct_flash`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=main-admin-tok', Origin: origin },
  })

  const delUser = await fetch(`${origin}/api/admin/relight/users/${createdUser.id}`, {
    method: 'DELETE',
    headers: { Cookie: 'sibluudz_session=main-admin-tok', Origin: origin },
  })
  assert.equal(delUser.status, 204)
})
