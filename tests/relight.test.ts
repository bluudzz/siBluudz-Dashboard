import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { buildRelightPrompt, normalizeRelightSettings, relightPresets } from '../shared/relight.js'

test('relight settings reject unknown values and keep a usable default', () => {
  assert.throws(() => normalizeRelightSettings({ preset: 'unknown' }), /preset/i)
  for (const removed of ['golden_hour', 'low_key', 'hard_sun', 'neon_gel']) {
    assert.throws(() => normalizeRelightSettings({ preset: removed }), /preset/i)
  }
  assert.deepEqual(relightPresets.map((p) => p.id), ['strobist', 'direct_flash', 'film_flash', 'softbox', 'backlit_rim'])
  assert.throws(() => normalizeRelightSettings({ intensity: 'extreme' }), /intensity/i)
  assert.throws(() => normalizeRelightSettings(null), /pengaturan/i)
  assert.equal(normalizeRelightSettings({}).preset, 'strobist')
})

test('each lighting preset keeps the content lock and honors independent lighting controls', () => {
  for (const preset of relightPresets) {
    const prompt = buildRelightPrompt({ preset: preset.id, intensity: 'strong', temperature: 'warm', shadows: 'soft', pattern: 'window', direction: 'right' }, 'Pertahankan ambient ruangan.')
    assert.ok(prompt.includes(preset.prompt))
    for (const rule of ['pose', 'identity', 'text', 'logo', 'source pixels', 'microdetail', 'original pixel dimensions', 'right', 'window', 'warm', 'Pertahankan ambient ruangan.']) assert.ok(prompt.includes(rule), rule)
  }
  assert.doesNotMatch(buildRelightPrompt({ preset: 'softbox' }), /BACKGROUND MUST BE DARKER/)
})

test('requested resolution replaces the source-dimension restriction without weakening the content lock', () => {
  for (const resolution of ['1K', '2K', '4K']) {
    const prompt = buildRelightPrompt({}, '', resolution)
    assert.match(prompt, new RegExp(`native ${resolution}`))
    assert.doesNotMatch(prompt, /preserve original pixel dimensions|Do not crop, resize, upscale or downscale/)
    assert.match(prompt, /pose/)
    assert.match(prompt, /original orientation and aspect ratio/)
    assert.match(prompt, /Never add, remove, replace, move or reconstruct scene elements/)
  }
  assert.throws(() => buildRelightPrompt({}, '', '8K'), /resolusi/i)
})

test('relight API sends one source photo, applies controls, logs usage and rejects invalid input', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-relight-'))
  process.env.NINEROUTER_API_KEY = 'relight-test-key'
  process.env.NODE_ENV = 'test'
  const app = express()
  app.use(express.json({ limit: '12mb' }))
  const calls: any[] = []
  let providerMode = 'image'
  let chatCalls = 0
  let imageCatalogAvailable = true
  app.get('/mock/v1/models/image', (_req, res) => {
    if (!imageCatalogAvailable) return res.status(503).json({ error: 'unavailable' })
    res.json({ data: [{ id: 'test/image-editor' }, { id: 'test/vision-only', capabilities: { vision: true, imageOutput: false } }, { id: 'ag/gemini-3.1-flash-image' }, { id: 'cx/gpt-image-2.5' }] })
  })
  app.get('/mock/v1/models', (_req, res) => res.json({ data: [{ id: 'test/text-model', capabilities: { imageOutput: false } }, { id: 'test/other-image', capabilities: { imageOutput: true } }, { id: 'test/name-image-without-capability' }] }))
  app.post('/mock/v1/chat/completions', (_req, res) => { chatCalls++; res.status(502).end() })
  app.post('/mock/v1/images/generations', (req, res) => {
    calls.push(req.body)
    if (providerMode === 'error') return res.status(503).json({ error: { message: 'Provider unavailable' } })
    if (providerMode === 'text') return res.json({ choices: [{ message: { content: 'This model can only describe photos.' } }] })
    res.json({ data: [{ url: source }] })
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  process.env.NINEROUTER_BASE_URL = origin + '/mock/v1'
  const { db } = await import('../server/db.js')
  const { default: routes } = await import('../server/routes/ai.routes.js')
  const { default: sharp } = await import('sharp')
  const source = 'data:image/png;base64,' + (await sharp({ create: { width: 3, height: 2, channels: 3, background: '#777777' } }).png().toBuffer()).toString('base64')
  app.use('/api/ai', routes)
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close() })
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('relight-user', 'relight@example.test', 'Test', 'user')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(createHash('sha256').update('relight-token').digest('hex'), 'relight-user', Date.now() + 60000)
  const request = (body: unknown, authenticated = true, requestOrigin = origin) => fetch(origin + '/api/ai/image-relight', { method: 'POST', headers: { ...(authenticated ? { Cookie: 'sibluudz_session=relight-token' } : {}), Origin: requestOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const modelResponse = await fetch(origin + '/api/ai/image-models', { headers: { Cookie: 'sibluudz_session=relight-token' } })
  assert.deepEqual((await modelResponse.json()).models, ['ag/gemini-3.1-flash-image', 'cx/gpt-image-2.5', 'test/image-editor', 'test/other-image'])
  imageCatalogAvailable = false
  const fallbackModels = await fetch(origin + '/api/ai/image-models', { headers: { Cookie: 'sibluudz_session=relight-token' } })
  assert.deepEqual((await fallbackModels.json()).models, ['test/other-image'])
  imageCatalogAvailable = true
  assert.equal((await request({}, false)).status, 401)
  assert.equal((await request({}, true, 'https://other.example')).status, 403)
  assert.equal((await request({ sourceImage: source, settings: { preset: 'invented' } })).status, 400)
  assert.equal((await request({ sourceImage: source, settings: null })).status, 400)
  assert.equal((await request({ sourceImage: source, instructions: 'x'.repeat(4001) })).status, 400)
  assert.equal((await request({ sourceImage: source, model: ['invalid'] })).status, 400)
  assert.equal((await request({ sourceImage: source, resolution: '8K' })).status, 400)
  assert.equal((await request({ sourceImage: 'data:image/png;base64,' + 'A'.repeat(8 * 1024 * 1024 + 4) })).status, 400)
  assert.equal((await request({ sourceImage: 'data:image/png;base64,not-a-photo' })).status, 400)
  assert.equal(calls.length, 0)
  assert.equal((await request({ sourceImage: source, model: 'test/text-model' })).status, 400)
  assert.equal((await request({ sourceImage: source, model: 'test/vision-only' })).status, 400)
  assert.equal(calls.length, 0)
  const response = await request({ sourceImage: source, model: 'test/image-editor', settings: { preset: 'film_flash', intensity: 'subtle', pattern: 'leaves' }, instructions: 'Jaga detail kain.', resolution: '2K' })
  assert.equal(response.status, 200)
  const result = await response.json()
  assert.equal(result.image, source)
  assert.equal(result.model, 'test/image-editor')
  assert.equal(result.promptVersion, 'universal-master-v3')
  assert.equal(result.prompt, undefined)
  assert.match(calls[0].prompt, /### 8A\. ULTRA-STRICT PIXEL-LEVEL PRESERVATION/)
  assert.equal(result.output.width, 3)
  assert.equal(result.output.height, 2)
  assert.equal(result.output.requestedResolution, '2K')
  assert.equal(result.output.resolutionMatched, false)
  assert.match(result.warning, /2K/)
  assert.equal(result.usage.usageToday, 1)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].model, 'test/image-editor')
  assert.equal(calls[0].stream, true)
  assert.equal(calls[0].image_size, '2K')
  assert.match(calls[0].prompt, /native 2K/)
  assert.equal(calls[0].size, undefined)
  assert.equal(calls[0].image, source)
  assert.equal(calls[0].images, undefined)
  assert.match(calls[0].prompt, /film|Film/)
  assert.match(calls[0].prompt, /Jaga detail kain/)
  assert.equal(db.prepare("select count(*) as count from ai_usage_logs where type='image_relight'").get().count, 1)
  providerMode = 'error'
  assert.equal((await request({ sourceImage: source, model: 'test/image-editor' })).status, 503)
  providerMode = 'text'
  assert.equal((await request({ sourceImage: source, model: 'test/image-editor' })).status, 502)
  assert.equal(chatCalls, 0)
  assert.equal(db.prepare("select count(*) as count from ai_usage_logs where type='image_relight'").get().count, 1)
  providerMode = 'image'
  const swapResponse = await fetch(origin + '/api/ai/image-edit', { method: 'POST', headers: { Cookie: 'sibluudz_session=relight-token', Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ sceneImage: source, productImage: source, model: 'test/image-editor' }) })
  assert.equal(swapResponse.status, 200)
  assert.deepEqual(calls.at(-1).images, [source, source])
  assert.equal(calls.at(-1).image, undefined)
  assert.equal(db.prepare("select count(*) as count from ai_usage_logs where type='image_edit'").get().count, 1)
  const gemini = await request({ sourceImage: source, model: 'ag/gemini-3.1-flash-image', resolution: '1K' })
  assert.equal(gemini.status, 200)
  assert.equal(calls.at(-1).image_size, '2K')
  assert.match(calls.at(-1).prompt, /native 2K/)
  assert.match(calls.at(-1).prompt, /ULTRA-STRICT PIXEL-LEVEL PRESERVATION/)
  assert.equal(calls.at(-1).quality, undefined)
  const gpt = await request({ sourceImage: source, model: 'cx/gpt-image-2.5' })
  assert.equal(gpt.status, 200)
  assert.equal(calls.at(-1).quality, 'high')
  assert.equal(calls.at(-1).image_size, undefined)
  assert.equal(calls.at(-1).image, source)
  assert.match(calls.at(-1).prompt, /ULTRA-STRICT PIXEL-LEVEL PRESERVATION/)
  assert.equal((await gpt.json()).prompt, undefined)
  db.prepare('update users set ai_daily_limit=1 where id=?').run('relight-user')
  const previousCalls = calls.length
  assert.equal((await request({ sourceImage: source })).status, 429)
  assert.equal(calls.length, previousCalls)
})
