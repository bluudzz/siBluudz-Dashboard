import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import express from 'express'

test('reconnect rejects wrong login, preserves credentials, then replaces cached token and reads new mail', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'sibluudz-mail-test-'))
  process.env.DATA_DIRECTORY = directory
  process.env.MAIL_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  const { db } = await import('../server/db.js')
  const { default: router } = await import('../server/outlook/outlook.routes.js')
  const { encryptMailCredentials, decryptMailCredentials } = await import('../server/utils/mail-crypto.js')
  const { hashToken, appOrigin } = await import('../server/middleware/auth.js')
  const nativeFetch = globalThis.fetch
  const session = randomBytes(24).toString('hex')
  const accountEmail = 'owner@outlook.com'
  const oldCredentials = encryptMailCredentials({ refresh_token: 'old-refresh', client_id: 'client' })
  db.prepare('insert into users (id, email) values (?, ?)').run('user', 'user@example.com')
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)')
    .run(hashToken(session), 'user', Date.now() + 60_000)
  db.prepare(`insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
    values ('account', 'user', ?, ?, 'graph.microsoft.com', 443, ?, 'oauth2', 'outlook_graph', ?)`)
    .run(accountEmail, accountEmail, accountEmail, oldCredentials)
  let loginMatches = false
  globalThis.fetch = async (url, init) => {
    const target = String(url)
    if (target.startsWith('https://login.microsoftonline.com/')) {
      const form = new URLSearchParams(String(init?.body))
      const correct = form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:device_code'
        ? loginMatches : form.get('refresh_token') === 'new-refresh'
      return Response.json({ access_token: correct ? 'correct-token' : 'wrong-token', refresh_token: correct ? 'new-refresh' : 'old-refresh', expires_in: 3600 })
    }
    if (target.startsWith('https://graph.microsoft.com/')) {
      const correct = new Headers(init?.headers).get('Authorization') === 'Bearer correct-token'
      return Response.json({
        '@odata.context': `https://graph.microsoft.com/v1.0/$metadata#users('${correct ? 'owner' : 'other'}%40outlook.com')/messages`,
        value: [{ id: 'new-mail', subject: 'New test email', receivedDateTime: '2026-10-29T10:00:00Z' }],
      })
    }
    throw new Error(`Unexpected external request: ${target}`)
  }
  const app = express()
  app.use(express.json(), router)
  const server = app.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as { port: number }
  const request = (endpoint: string, body?: object) => nativeFetch(`http://127.0.0.1:${address.port}${endpoint}`, {
    method: body ? 'POST' : 'GET',
    headers: { cookie: `sibluudz_session=${session}`, origin: appOrigin, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  try {
    assert.equal((await request('/accounts/account/inbox')).status, 409)
    const reconnect = { device_code: 'device', client_id: 'client', email: accountEmail, auto_save: true }
    const wrong = await request('/device/poll', reconnect)
    assert.equal(wrong.status, 400)
    assert.match((await wrong.json()).error, /other@outlook.com/)
    assert.equal(db.prepare("select encrypted_credentials from mail_accounts where id = 'account'").get().encrypted_credentials, oldCredentials)
    loginMatches = true
    const success = await request('/device/poll', reconnect)
    assert.equal(success.status, 200)
    assert.equal((await success.json()).account_id, 'account')
    const saved = db.prepare("select encrypted_credentials from mail_accounts where id = 'account'").get()
    assert.equal(decryptMailCredentials(saved.encrypted_credentials).refresh_token, 'new-refresh')
    const inbox = await request('/accounts/account/inbox')
    assert.equal(inbox.status, 200)
    assert.equal((await inbox.json()).messages[0].subject, 'New test email')
    assert.equal((await request('/accounts/account/refresh', {})).status, 200)
  } finally {
    globalThis.fetch = nativeFetch
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
