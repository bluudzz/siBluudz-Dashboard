import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'

test('photo edits use the native image endpoint, preserve references and decode JSON/SSE failures accurately', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-image-edit-'))
  process.env.NINEROUTER_API_KEY = 'image-edit-test-key'
  const app = express()
  app.use(express.json())
  const requests: any[] = []
  let chatCalls = 0
  let responseMode = 'sse'
  const source = 'data:image/png;base64,' + (await sharp({ create: { width: 3, height: 2, channels: 3, background: '#777777' } }).png().toBuffer()).toString('base64')
  const product = 'data:image/webp;base64,UklGRg=='
  const encoded = '/9j/Zml4dHVyZQ=='
  app.post('/mock/v1/chat/completions', (_req, res) => { chatCalls++; res.status(502).type('html').send('<html><title>Bad Gateway</title></html>') })
  app.post('/mock/v1/images/generations', async (req, res) => {
    requests.push({ body: req.body, accept: req.headers.accept })
    if (responseMode === 'http-error') return res.status(502).type('html').send('<html><title>Bad Gateway</title><body>upstream unavailable</body></html>')
    if (responseMode === 'json-error') return res.status(429).json({ error: { message: 'Image provider quota exhausted' } })
    if (responseMode === 'json') return res.json({ data: [{ b64_json: encoded }] })
    res.type('text/event-stream')
    res.write('event: progress\r\ndata: {"stage":"generating"}\r\n\r\n')
    if (responseMode === 'stream-error') return res.end('event: error\ndata: {"message":"Provider ended without an image"}\n\n')
    if (responseMode === 'empty') return res.end('data: [DONE]\n\n')
    if (responseMode === 'partial') {
      res.write(`event: partial_image\ndata: {"b64_json":"${encoded}"}\n\n`)
      return res.end('event: error\ndata: {"message":"Final render failed"}\n\n')
    }
    const event = 'event: done\ndata: ' + JSON.stringify({ data: [{ b64_json: encoded }] }) + '\n\n'
    res.write(event.slice(0, 33))
    await new Promise(resolve => setTimeout(resolve, 5))
    res.write(event.slice(33))
    res.end('data: [DONE]\n\n')
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  process.env.NINEROUTER_BASE_URL = `http://127.0.0.1:${address.port}/mock/v1/chat/completions`
  const { callNineRouterImageEdit } = await import('../server/routes/ai.routes.js')
  const { db } = await import('../server/db.js')
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close() })
  const edit = (extra = {}) => callNineRouterImageEdit({ sceneImage: source, prompt: 'Relight only. Preserve pose and text.', model: 'cx/gpt-image-2', ...extra })
  const result = await edit()
  assert.equal(chatCalls, 0)
  assert.equal(result.image, `data:image/jpeg;base64,${encoded}`)
  assert.equal(result.model, 'cx/gpt-image-2')
  assert.equal(requests[0].body.image, source)
  assert.equal(requests[0].body.images, undefined)
  assert.equal(requests[0].body.size, undefined)
  assert.equal(requests[0].body.aspect_ratio, '3:2')
  assert.equal(requests[0].body.stream, true)
  assert.match(requests[0].accept, /text\/event-stream/)
  responseMode = 'json'
  await edit({ productImage: product })
  assert.deepEqual(requests[1].body.images, [source, product])
  assert.equal(requests[1].body.image, undefined)
  const rotated = 'data:image/jpeg;base64,' + (await sharp({ create: { width: 4, height: 2, channels: 3, background: '#777777' } }).withMetadata({ orientation: 6 }).jpeg().toBuffer()).toString('base64')
  await edit({ sceneImage: rotated })
  assert.equal(requests.at(-1).body.aspect_ratio, '1:2')
  for (const [mode, message] of [['http-error', /502.*Bad Gateway/], ['json-error', /429.*quota exhausted/], ['stream-error', /Provider ended without an image/], ['partial', /Final render failed/], ['empty', /tidak mengembalikan gambar/i]] as const) {
    responseMode = mode
    await assert.rejects(edit, message)
  }
  assert.equal(chatCalls, 0)
  await assert.rejects(() => edit({ sceneImage: undefined }), /foto sumber/i)
})

test('explicit output resolution reaches the provider and actual pixels are reported without upscaling', async t => {
  const { requestImageEdit } = await import('../server/ai-image-edit.js')
  const app = express()
  app.use(express.json())
  const source = 'data:image/png;base64,' + (await sharp({ create: { width: 768, height: 512, channels: 3, background: '#777777' } }).png().toBuffer()).toString('base64')
  let output = await sharp({ create: { width: 2528, height: 1696, channels: 3, background: '#999999' } }).png().toBuffer()
  let asUrl = false
  const calls: any[] = []
  app.post('/v1/images/generations', (req, res) => { calls.push(req.body); res.json({ data: [asUrl ? { url: 'https://example.test/image.png' } : { b64_json: output.toString('base64') }] }) })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise<void>(resolve => server.close(() => resolve())))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const edit = (resolution: unknown = '2K', extra = {}) => requestImageEdit({ baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'ag/gemini-3.1-flash-image', sceneImage: source, prompt: 'Relight only', resolution, ...extra })
  const result = await edit()
  assert.equal(calls[0].image_size, '2K')
  assert.equal(calls[0].aspect_ratio, '3:2')
  assert.equal(calls[0].size, undefined)
  assert.deepEqual(result.output, { width: 2528, height: 1696, bytes: output.length, format: 'png', requestedResolution: '2K', resolutionMatched: true })
  assert.equal(result.warning, undefined)
  assert.equal(result.image, 'data:image/png;base64,' + output.toString('base64'))
  output = await sharp({ create: { width: 1264, height: 848, channels: 3, background: '#999999' } }).png().toBuffer()
  const small = await edit('4K')
  assert.equal(calls.at(-1).image_size, '4K')
  assert.equal(small.output.width, 1264)
  assert.equal(small.output.resolutionMatched, false)
  assert.match(small.warning, /4K.*1264.*848/)
  assert.equal(small.image, 'data:image/png;base64,' + output.toString('base64'))
  const legacy = await requestImageEdit({ baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: 'test', model: 'cx/gpt-image-2', sceneImage: source, prompt: 'Relight only' })
  assert.equal(calls.at(-1).image_size, undefined)
  assert.equal(legacy.output.requestedResolution, null)
  assert.equal(legacy.warning, undefined)
  await edit(undefined, { model: 'cx/gpt-image-2.5', resolution: undefined, quality: 'high' })
  assert.equal(calls.at(-1).quality, 'high')
  assert.equal(calls.at(-1).image_size, undefined)
  assert.equal(calls.at(-1).aspect_ratio, '3:2')
  assert.equal(calls.at(-1).image, source)
  asUrl = true
  const remote = await edit('2K')
  assert.equal(remote.output, null)
  assert.match(remote.warning, /2K.*belum dapat diverifikasi/)
  const previousCalls = calls.length
  for (const invalid of ['8K', 'high', null, {}, 2048]) await assert.rejects(() => edit(invalid), /resolusi/i)
  await assert.rejects(() => edit(undefined, { quality: 'invalid' }), /kualitas/i)
  assert.equal(calls.length, previousCalls)
})
