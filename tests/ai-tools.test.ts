import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

test('removed AI tools cannot generate through stale clients or consume quota', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-removed-tools-'))
  process.env.NINEROUTER_API_KEY = ''
  const { db } = await import('../server/db.js')
  const { default: routes } = await import('../server/routes/ai.routes.js')
  const app = express()
  app.use(express.json())
  app.use('/api/ai', routes)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close() })
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('test-user', 'tools@example.test', 'Test', 'user')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(createHash('sha256').update('tools-token').digest('hex'), 'test-user', Date.now() + 60000)
  for (const type of ['invoice_items', 'proposal_structure', 'follow_up_message', 'video_prompt', 'humanizer', 'prompt_reframer']) {
    const response = await fetch(origin + '/api/ai/generate', {
      method: 'POST', headers: { Origin: origin, Cookie: 'sibluudz_session=tools-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, prompt: 'Permintaan dari tab lama.' }),
    })
    assert.equal(response.status, 410, type)
    assert.match((await response.json()).error, /dihapus/)
  }
  assert.equal(db.prepare('select count(*) as count from ai_usage_logs').get().count, 0)
  assert.equal(db.prepare('select count(*) as count from ai_history').get().count, 0)
})
