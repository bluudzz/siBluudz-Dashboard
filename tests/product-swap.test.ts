import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  buildProductSwapPrompt,
  defaultProductSwapSettings,
  normalizeProductSwapSettings,
} from '../shared/product-swap.js'

test('normalizeProductSwapSettings validates options and keeps defaults', () => {
  assert.deepEqual(normalizeProductSwapSettings({}), defaultProductSwapSettings)
  assert.throws(() => normalizeProductSwapSettings({ scenario: 'invalid' }), /Skenario/i)
  assert.throws(() => normalizeProductSwapSettings({ fidelity: 'loose' }), /kesetiaan/i)
  assert.throws(() => normalizeProductSwapSettings({ scale: 'huge' }), /skala/i)
  assert.throws(() => normalizeProductSwapSettings(null), /tidak valid/i)
})

test('buildProductSwapPrompt applies scenario, fidelity, scale, resolution, and instructions', () => {
  const prompt = buildProductSwapPrompt(
    { scenario: 'handheld', fidelity: 'strict', scale: 'prominent' },
    'Pastikan jari memegang bagian bawah botol.',
    '2K'
  )
  assert.match(prompt, /"mode": "handheld"/)
  assert.match(prompt, /finger occlusion/)
  assert.match(prompt, /Preserve 100% of Image 2 exact brand logo/)
  assert.match(prompt, /10-15%/)
  assert.match(prompt, /Native 2K/)
  assert.match(prompt, /Pastikan jari memegang bagian bawah botol\./)
  assert.throws(() => buildProductSwapPrompt({}, 'a'.repeat(4001)), /4\.000/)
})

test('image-edit route forwards product swap settings, resolution, and returns metadata', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-pswap-'))
  process.env.NINEROUTER_API_KEY = 'pswap-test-key'
  process.env.NODE_ENV = 'test'

  const calls: Array<Record<string, unknown>> = []
  const app = express()
  app.use(express.json({ limit: '10mb' }))
  let tinyPng = ''
  app.post('/mock/v1/images/generations', (req, res) => {
    calls.push(req.body)
    res.json({ data: [{ url: tinyPng }] })
  })

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  process.env.NINEROUTER_BASE_URL = `${origin}/mock/v1`

  const { db } = await import('../server/db.js')
  const { default: routes } = await import('../server/routes/ai.routes.js')
  const { default: sharp } = await import('sharp')
  tinyPng =
    'data:image/png;base64,' +
    (await sharp({ create: { width: 4, height: 5, channels: 3, background: '#555555' } }).png().toBuffer()).toString(
      'base64'
    )

  app.use('/api/ai', routes)

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id, email, name, role) values (?, ?, ?, ?)').run(
    'pswap-user',
    'pswap@example.test',
    'Swap Tester',
    'user'
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(
    createHash('sha256').update('pswap-token').digest('hex'),
    'pswap-user',
    Date.now() + 60000
  )

  const badRes = await fetch(`${origin}/api/ai/image-edit`, {
    method: 'POST',
    headers: { Cookie: 'sibluudz_session=pswap-token', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sceneImage: tinyPng,
      productImage: tinyPng,
      model: 'cx/gpt-image-2.6-flare',
      settings: { scenario: 'unknown_mode' },
    }),
  })
  assert.equal(badRes.status, 400)

  const okRes = await fetch(`${origin}/api/ai/image-edit`, {
    method: 'POST',
    headers: { Cookie: 'sibluudz_session=pswap-token', Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sceneImage: tinyPng,
      productImage: tinyPng,
      model: 'cx/gpt-image-2.6-flare',
      settings: { scenario: 'tabletop', fidelity: 'strict', scale: 'natural' },
      instructions: 'Jaga pantulan di meja kaca.',
      resolution: '2K',
    }),
  })
  assert.equal(okRes.status, 200)
  const payload = await okRes.json()
  assert.equal(payload.model, 'cx/gpt-image-2.6-flare')
  assert.equal(payload.image, tinyPng)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].images, [tinyPng, tinyPng])
  assert.equal(calls[0].image_size, '2K')
  assert.equal(calls[0].quality, 'high')
  assert.match(String(calls[0].prompt), /"mode": "tabletop"/)
  assert.match(String(calls[0].prompt), /Jaga pantulan di meja kaca\./)
})
