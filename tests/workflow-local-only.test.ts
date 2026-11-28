import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { isLocalHostName, isLocalWorkflowEnvironment } from '../server/middleware/local-workflow.js'

test('isLocalHostName accepts only loopback hosts and rejects domains or spoofs', () => {
  assert.equal(isLocalHostName('localhost'), true)
  assert.equal(isLocalHostName('localhost:5173'), true)
  assert.equal(isLocalHostName('127.0.0.1:3001'), true)
  assert.equal(isLocalHostName('[::1]:3001'), true)
  assert.equal(isLocalHostName('::1'), true)

  assert.equal(isLocalHostName('sibluudz.my.id'), false)
  assert.equal(isLocalHostName('sibluudz.my.id:443'), false)
  assert.equal(isLocalHostName('localhost.evil.com'), false)
  assert.equal(isLocalHostName('127.0.0.1.nip.io'), false)
  assert.equal(isLocalHostName(''), false)
})

test('isLocalWorkflowEnvironment checks APP_ORIGIN unless ALLOW_REMOTE_WORKFLOWS is true', () => {
  assert.equal(isLocalWorkflowEnvironment({}), true)
  assert.equal(isLocalWorkflowEnvironment({ APP_ORIGIN: 'http://localhost:5173' }), true)
  assert.equal(isLocalWorkflowEnvironment({ APP_ORIGIN: 'https://sibluudz.my.id' }), false)
  assert.equal(isLocalWorkflowEnvironment({ APP_ORIGIN: 'https://sibluudz.my.id', ALLOW_REMOTE_WORKFLOWS: 'true' }), true)
})

test('requireLocalWorkflow allows localhost requests and locks VPS/remote hosts with 403 WORKFLOW_LOCAL_ONLY', async t => {
  const prevDataDir = process.env.DATA_DIRECTORY
  const prevOrigin = process.env.APP_ORIGIN
  const prevAllowRemote = process.env.ALLOW_REMOTE_WORKFLOWS

  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-localwf-'))
  process.env.NODE_ENV = 'test'
  delete process.env.APP_ORIGIN
  delete process.env.ALLOW_REMOTE_WORKFLOWS

  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json())

  const { db } = await import('../server/db.js')
  const { default: automationRoutes } = await import('../server/routes/automation.routes.js')
  app.use('/api/workflows', automationRoutes)

  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`

  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
    if (prevDataDir === undefined) delete process.env.DATA_DIRECTORY
    else process.env.DATA_DIRECTORY = prevDataDir
    if (prevOrigin === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = prevOrigin
    if (prevAllowRemote === undefined) delete process.env.ALLOW_REMOTE_WORKFLOWS
    else process.env.ALLOW_REMOTE_WORKFLOWS = prevAllowRemote
  })

  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('u-local', 'local@example.test', 'Local User', 'admin')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)')
    .run(createHash('sha256').update('local-tok').digest('hex'), 'u-local', Date.now() + 60_000)

  // Localhost request succeeds
  const okRes = await fetch(origin + '/api/workflows', {
    headers: { Cookie: 'sibluudz_session=local-tok' },
  })
  assert.equal(okRes.status, 200)

  // Remote X-Forwarded-Host header is rejected even for authenticated user or webhook hook
  const remoteListRes = await fetch(origin + '/api/workflows', {
    headers: {
      Cookie: 'sibluudz_session=local-tok',
      'X-Forwarded-Host': 'sibluudz.my.id',
    },
  })
  assert.equal(remoteListRes.status, 403)
  assert.equal((await remoteListRes.json()).code, 'WORKFLOW_LOCAL_ONLY')

  const remoteHookRes = await fetch(origin + '/api/workflows/hooks/' + 'a'.repeat(64), {
    method: 'POST',
    headers: { 'X-Forwarded-Host': 'sibluudz.my.id' },
  })
  assert.equal(remoteHookRes.status, 403)
  assert.equal((await remoteHookRes.json()).code, 'WORKFLOW_LOCAL_ONLY')

  // Production VPS APP_ORIGIN locks even direct 127.0.0.1 requests
  process.env.APP_ORIGIN = 'https://sibluudz.my.id'
  const vpsEnvRes = await fetch(origin + '/api/workflows', {
    headers: { Cookie: 'sibluudz_session=local-tok' },
  })
  assert.equal(vpsEnvRes.status, 403)
  assert.equal((await vpsEnvRes.json()).code, 'WORKFLOW_LOCAL_ONLY')
})
