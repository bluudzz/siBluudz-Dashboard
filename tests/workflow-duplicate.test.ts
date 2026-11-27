import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

test('POST /api/workflows/:id/duplicate copies graph as inactive draft without cloning webhook token', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-dup-'))
  process.env.NODE_ENV = 'test'

  const app = express()
  app.use(express.json())
  const { db } = await import('../server/db.js')
  const { default: routes } = await import('../server/routes/automation.routes.js')
  app.use('/api/workflows', routes)

  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  t.after(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('u1', 'u1@example.test', 'User 1', 'user')
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('u2', 'u2@example.test', 'User 2', 'user')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)')
    .run(createHash('sha256').update('tok-1').digest('hex'), 'u1', Date.now() + 60_000)

  const req = (path: string, method = 'GET', body?: unknown, hdrs: Record<string, string> = {}) =>
    fetch(origin + '/api/workflows' + path, {
      method,
      headers: {
        Cookie: 'sibluudz_session=tok-1',
        Origin: origin,
        'Content-Type': 'application/json',
        ...hdrs,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

  const createRes = await req('', 'POST', { name: 'IG Carousel Utama', description: 'Alur produksi', template: 'starter' })
  assert.equal(createRes.status, 201)
  const created = await createRes.json()

  db.prepare('update workflows set is_active = 1, webhook_token = ? where id = ?').run('secret-hook-token', created.id)

  const dupRes = await req(`/${created.id}/duplicate`, 'POST', {})
  assert.equal(dupRes.status, 201)
  const duplicated = await dupRes.json()
  assert.notEqual(duplicated.id, created.id)
  assert.equal(duplicated.name, 'IG Carousel Utama (Salinan)')
  assert.equal(duplicated.isActive, false)
  assert.equal(duplicated.webhookToken, '')

  const origDetail = await (await req(`/${created.id}`)).json()
  const dupDetail = await (await req(`/${duplicated.id}`)).json()
  assert.equal(dupDetail.workflow.nodes.length, origDetail.workflow.nodes.length)
  assert.equal(dupDetail.workflow.edges.length, origDetail.workflow.edges.length)
  assert.equal(dupDetail.workflow.isActive, false)
  assert.equal(dupDetail.workflow.webhookToken, '')

  // Reject missing / foreign workflow IDs
  assert.equal((await req('/nonexistent-id/duplicate', 'POST', {})).status, 404)
  db.prepare("insert into workflows (id,user_id,name,description,nodes,edges) values ('other-wf','u2','Milik u2','','[]','[]')").run()
  assert.equal((await req('/other-wf/duplicate', 'POST', {})).status, 404)

  // Reject cross-origin requests
  assert.equal((await req(`/${created.id}/duplicate`, 'POST', {}, { Origin: 'https://evil.example' })).status, 403)
})
