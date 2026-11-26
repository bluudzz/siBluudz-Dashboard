import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

test('9router model sync refreshes stale catalogs and reconciles obsolete default models', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-model-sync-'))
  process.env.NINEROUTER_API_KEY = 'sync-test-key'
  process.env.NODE_ENV = 'test'

  const app = express()
  app.use(express.json())

  const liveTextModels = [
    { id: 'cx/gpt-6.1-sol', owned_by: 'cx', capabilities: { vision: true, tools: true, reasoning: true, imageOutput: false } },
    { id: 'gptweb/gpt-6', owned_by: 'gptweb', capabilities: { vision: true, tools: true, reasoning: true, imageOutput: false } },
    { id: 'river/GLM-5.3', owned_by: 'river', capabilities: { vision: false, tools: true, reasoning: false, imageOutput: false } },
  ]
  const liveImageModels = [
    { id: 'ag/gemini-3.1-flash-image', owned_by: 'ag', capabilities: { imageOutput: true } },
    { id: 'cx/gpt-image-2.5', owned_by: 'cx', capabilities: { imageOutput: true } },
  ]

  app.get('/mock/v1/models', (_req, res) => {
    res.json({ data: liveTextModels })
  })
  app.get('/mock/v1/models/image', (_req, res) => {
    res.json({ data: liveImageModels })
  })

  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  process.env.NINEROUTER_BASE_URL = `${origin}/mock/v1`

  const { db, setSetting } = await import('../server/db.js')
  const { default: aiRoutes } = await import('../server/routes/ai.routes.js')
  const { default: adminRoutes } = await import('../server/routes/admin.routes.js')
  app.use('/api/ai', aiRoutes)
  app.use('/api/admin', adminRoutes)

  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id, email, name, role) values (?, ?, ?, ?)').run(
    'sync-admin',
    'sync-admin@example.test',
    'Sync Admin',
    'admin'
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(
    createHash('sha256').update('sync-admin-token').digest('hex'),
    'sync-admin',
    Date.now() + 60000
  )

  // Seed stale DB caches & removed model IDs
  setSetting('ninerouter_available_models', JSON.stringify(['ds/old-dead-model']))
  setSetting('ninerouter_model', 'ds/old-dead-model')
  setSetting('ninerouter_image_model', 'sdwebui/flux-1-dev')

  const authHeaders = {
    Cookie: 'sibluudz_session=sync-admin-token',
    Origin: origin,
    'Content-Type': 'application/json',
  }

  // 1. Forced status refresh updates both text and image catalogs and reconciles stale defaults
  const statusRes = await fetch(`${origin}/api/ai/status?refresh=1`, { headers: authHeaders })
  assert.equal(statusRes.status, 200)
  const status = await statusRes.json()
  assert.deepEqual(status.availableModels, ['cx/gpt-6.1-sol', 'gptweb/gpt-6', 'river/GLM-5.3'])
  assert.deepEqual(status.availableImageModels, ['ag/gemini-3.1-flash-image', 'cx/gpt-image-2.5'])
  assert.equal(status.model, 'cx/gpt-6.1-sol')
  assert.equal(status.imageModel, 'ag/gemini-3.1-flash-image')

  // 2. /api/ai/models returns live list and never falls back to obsolete hardcoded 'gpt-4o-mini'
  const modelsRes = await fetch(`${origin}/api/ai/models`, { headers: authHeaders })
  assert.equal(modelsRes.status, 200)
  const modelsJson = await modelsRes.json()
  assert.equal(modelsJson.success, true)
  assert.deepEqual(modelsJson.models, ['cx/gpt-6.1-sol', 'gptweb/gpt-6', 'river/GLM-5.3'])
  assert.equal(modelsJson.defaultModel, 'cx/gpt-6.1-sol')
  assert.notEqual(modelsJson.defaultModel, 'gpt-4o-mini')

  // 3. /api/admin/fetch-models returns both text and image models + counts
  const fetchAdminRes = await fetch(`${origin}/api/admin/fetch-models`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  })
  assert.equal(fetchAdminRes.status, 200)
  const fetchAdminJson = await fetchAdminRes.json()
  assert.equal(fetchAdminJson.success, true)
  assert.equal(fetchAdminJson.count, 3)
  assert.equal(fetchAdminJson.imageCount, 2)
  assert.deepEqual(fetchAdminJson.imageModels, ['ag/gemini-3.1-flash-image', 'cx/gpt-image-2.5'])
})
