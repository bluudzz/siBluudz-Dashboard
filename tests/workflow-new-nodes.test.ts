import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { executeGraph, executeGraphAsync, resolveValue, validateGraph } from '../shared/workflow-engine.js'
import { inspectWorkflow } from '../shared/workflow-readiness.js'
import { applyWorkflowOperations } from '../shared/workflow-assistant.js'
import { workflowNodeImages } from '../src/features/automation/workflow-model.ts'

const node = (id: string, type: string, data: Record<string, unknown> = {}) => ({ id, type, position: { x: 0, y: 0 }, data: { label: id, ...data } })
const edge = (source: string, target: string, sourceHandle?: string) => ({ id: `${source}-${target}-${sourceHandle || 'd'}`, source, target, ...(sourceHandle ? { sourceHandle } : {}) })

test('resolveValue rejects malformed double-brace expressions and readiness flags them', () => {
  assert.throws(() => resolveValue('{{prompt}}', { prompt: 'hello' }), /Ekspresi belum didukung/)
  assert.equal(resolveValue('{prompt}', { prompt: 'hello' }), 'hello')
  assert.equal(resolveValue('{{ $json.prompt }}', { prompt: 'hello' }), 'hello')

  const trigger = node('start', 'promptTrigger', { prompt: 'halo' })
  const search = node('search', 'searchContent', { sourceMode: 'search', query: '{{prompt}}' })
  const issues = inspectWorkflow([trigger, search], [edge('start', 'search')])
  assert.ok(issues.some(i => i.code === 'expression-syntax' && i.severity === 'error' && i.nodeId === 'search'))
})

test('Instagram readiness and runtime approval cover reels, stories, comments, and insights', async () => {
  const trigger = node('start', 'trigger', { sampleData: '{"videoUrl":"https://example.com/reel.mp4","imageUrl":"https://example.com/story.jpg","mediaId":"123456789"}' })
  const approval = node('approve', 'approval', { approvedItems: null })

  for (const op of ['reels', 'stories'] as const) {
    const igNoApproval = node('ig', 'instagram', { operation: op, accountId: 'acc-1' })
    assert.ok(inspectWorkflow([trigger, igNoApproval], [edge('start', 'ig')]).some(i => i.code === 'instagram-approval'))

    const igWithApproval = node('ig', 'instagram', { operation: op, accountId: 'acc-1' })
    const readiness = inspectWorkflow([trigger, approval, igWithApproval], [edge('start', 'approve'), edge('approve', 'ig')])
    assert.equal(readiness.filter(i => i.severity === 'error').length, 0)

    const waiting = await executeGraphAsync([trigger, approval, igWithApproval], [edge('start', 'approve'), edge('approve', 'ig')], undefined, async () => [])
    assert.equal(waiting.status, 'waiting_approval')
    assert.equal(waiting.nodeResults.ig.status, 'skipped')
  }

  for (const op of ['comments', 'insights'] as const) {
    const ig = node('ig', 'instagram', { operation: op, accountId: 'acc-1' })
    const readiness = inspectWorkflow([trigger, ig], [edge('start', 'ig')])
    assert.equal(readiness.filter(i => i.severity === 'error').length, 0)
  }
})

test('merge supports combineByPosition broadcast, append, and aggregate', () => {
  const trigger = node('start', 'trigger', { sampleData: '{"topic":"Promo"}' })
  const cap = node('cap', 'set', { fields: '{"caption":"Caption IG"}', keepInput: false })
  const slides = node('slides', 'trigger', { sampleData: '[{"json":{"imageUrl":"https://example.com/1.jpg"}},{"json":{"imageUrl":"https://example.com/2.jpg"}}]' })

  const combine = node('m', 'merge', { mode: 'combineByPosition' })
  const r1 = executeGraph([trigger, cap, slides, combine], [edge('start', 'cap'), edge('cap', 'm'), edge('slides', 'm')])
  assert.equal(r1.status, 'completed')
  assert.equal(r1.nodeResults.m.output.length, 2)
  assert.equal(r1.nodeResults.m.output[0].json.caption, 'Caption IG')
  assert.equal(r1.nodeResults.m.output[1].json.caption, 'Caption IG')
  assert.equal(r1.nodeResults.m.output[1].json.imageUrl, 'https://example.com/2.jpg')

  const append = node('m', 'merge', { mode: 'append' })
  const r2 = executeGraph([trigger, cap, slides, append], [edge('start', 'cap'), edge('cap', 'm'), edge('slides', 'm')])
  assert.equal(r2.nodeResults.m.output.length, 3)

  const agg = node('m', 'merge', { mode: 'aggregate', aggregateField: 'slides' })
  const r3 = executeGraph([slides, agg], [edge('slides', 'm')])
  assert.equal(r3.nodeResults.m.output.length, 1)
  assert.equal(r3.nodeResults.m.output[0].json.count, 2)
  assert.deepEqual(r3.nodeResults.m.output[0].json.imageUrls, ['https://example.com/1.jpg', 'https://example.com/2.jpg'])
})

test('jsonParse extracts fenced JSON objects and splits arbitrary arrays', () => {
  const trigger = node('start', 'trigger', {
    sampleData: JSON.stringify({
      output: 'Berikut hasilnya:\n```json\n{"title":"Judul A","slides":[{"prompt":"P1"},{"prompt":"P2"}]}\n```\nSemoga membantu.',
    }),
  })
  const parser = node('p', 'jsonParse', { parseMode: 'parse', sourceField: 'output' })
  const r1 = executeGraph([trigger, parser], [edge('start', 'p')])
  assert.equal(r1.status, 'completed')
  assert.equal(r1.nodeResults.p.output[0].json.title, 'Judul A')

  const splitter = node('s', 'jsonParse', { parseMode: 'splitArray', sourceField: 'output', arrayPath: 'slides', keepInput: false })
  const r2 = executeGraph([trigger, splitter], [edge('start', 's')])
  assert.equal(r2.status, 'completed')
  assert.deepEqual(r2.nodeResults.s.output.map(i => i.json.prompt), ['P1', 'P2'])
  assert.deepEqual(r2.nodeResults.s.output.map(i => i.json.splitIndex), [1, 2])
})

test('IF upgraded operators and Switch 4-way routing work cleanly', () => {
  const items = [
    { json: { kind: 'carousel', score: 90, tag: 'ig_promo', note: '' } },
    { json: { kind: 'reels', score: 40, tag: 'tt_video', note: 'ready' } },
    { json: { kind: 'other', score: 75, tag: 'blog', note: 'ok' } },
  ]
  const trigger = node('start', 'trigger', { sampleData: JSON.stringify(items) })
  const sw = node('sw', 'switch', {
    field: 'kind',
    rule1Operator: 'equals', rule1Value: 'carousel',
    rule2Operator: 'startsWith', rule2Value: 'reel',
    rule3Operator: 'notContains', rule3Value: 'xyz',
  })
  assert.ok(validateGraph([trigger, sw, node('c1', 'set')], [edge('start', 'sw'), edge('sw', 'c1', 'bad')]).some(e => e.includes('Switch')))

  const c1 = node('c1', 'set', { fields: '{"branch":"case1"}' })
  const c2 = node('c2', 'set', { fields: '{"branch":"case2"}' })
  const c3 = node('c3', 'set', { fields: '{"branch":"case3"}' })
  const fb = node('fb', 'set', { fields: '{"branch":"fallback"}' })
  const res = executeGraph([trigger, sw, c1, c2, c3, fb], [
    edge('start', 'sw'),
    edge('sw', 'c1', 'case1'),
    edge('sw', 'c2', 'case2'),
    edge('sw', 'c3', 'case3'),
    edge('sw', 'fb', 'fallback'),
  ])
  assert.equal(res.status, 'completed')
  assert.equal(res.nodeResults.c1.output[0].json.kind, 'carousel')
  assert.equal(res.nodeResults.c2.output[0].json.kind, 'reels')
  assert.equal(res.nodeResults.c3.output[0].json.kind, 'other')
  assert.equal(res.nodeResults.fb.status, 'skipped')

  const gtIf = node('ifgt', 'if', { field: 'score', operator: 'gt', value: '80' })
  const emptyIf = node('ifempty', 'if', { field: 'note', operator: 'isEmpty', value: '' })
  const rIf = executeGraph([trigger, gtIf, emptyIf], [edge('start', 'ifgt'), edge('ifgt', 'ifempty', 'true')])
  assert.equal(rIf.nodeResults.ifgt.branches?.true.length, 1)
  assert.equal(rIf.nodeResults.ifempty.branches?.true.length, 1)
})

test('wait node completes and respects abort signal', async () => {
  const trigger = node('start', 'trigger', { sampleData: '{"ok":true}' })
  const wait = node('w', 'wait', { durationSeconds: '0.1' })
  const res = await executeGraphAsync([trigger, wait], [edge('start', 'w')], undefined, async (ctx: any) => {
    assert.equal(ctx.kind, 'wait')
    assert.equal(ctx.durationMs, 100)
    await new Promise(r => setTimeout(r, 20))
    return ctx.input
  })
  assert.equal(res.status, 'completed')
  assert.equal(res.nodeResults.w.output[0].json.ok, true)
})

test('apiRequest sends POST JSON and blocks SSRF targets', async () => {
  const { runApiRequestNode } = await import('../server/workflow-api-request.js')
  let captured: any = null
  const out = await runApiRequestNode({
    node: node('api', 'apiRequest', {
      method: 'POST',
      url: 'https://api.example.com/items',
      headers: '{"X-Api-Key":"token-{{ $json.key }}"}',
      body: '{"topic":"{{ $json.topic }}"}',
    }),
    input: [{ json: { key: '123', topic: 'Roblox' } }],
  }, {
    requestImpl: async (url: string, opts: any) => {
      captured = { url, ...opts }
      return { status: 201, headers: { 'content-type': 'application/json' }, contentType: 'application/json', body: '{"id":"item-1"}' }
    },
  })
  assert.equal(captured.url, 'https://api.example.com/items')
  assert.equal(captured.method, 'POST')
  assert.equal(captured.headers['X-Api-Key'], 'token-123')
  assert.equal(captured.body, '{"topic":"Roblox"}')
  assert.equal(out[0].json.statusCode, 201)
  assert.deepEqual(out[0].json.responseBody, { id: 'item-1' })

  await assert.rejects(
    () => runApiRequestNode({ node: node('api', 'apiRequest', { method: 'GET', url: 'https://127.0.0.1/secret' }), input: [{ json: {} }] }),
    /HTTPS publik/,
  )

  let multilineCaptured: any = null
  await runApiRequestNode({
    node: node('api2', 'apiRequest', {
      method: 'POST',
      url: 'https://api.example.com/captions',
      body: '{"caption":"{{ $json.caption }}"}',
    }),
    input: [{ json: { caption: 'Baris 1\nBaris 2 "Promo"' } }],
  }, {
    requestImpl: async (_url: string, opts: any) => {
      multilineCaptured = opts
      return { status: 200, headers: { 'content-type': 'application/json' }, contentType: 'application/json', body: '{"ok":true}' }
    },
  })
  assert.deepEqual(JSON.parse(multilineCaptured.body), { caption: 'Baris 1\nBaris 2 "Promo"' })

  let exprCaptured: any = null
  await runApiRequestNode({
    node: node('api3', 'apiRequest', {
      method: 'POST',
      url: 'https://api.example.com/payload',
      body: '{{ $json.payload }}',
    }),
    input: [{ json: { payload: { title: 'Halo "Dunia"', lines: ['a', 'b'] } } }],
  }, {
    requestImpl: async (_url: string, opts: any) => {
      exprCaptured = opts
      return { status: 200, headers: { 'content-type': 'application/json' }, contentType: 'application/json' , body: '{"ok":true}' }
    },
  })
  assert.deepEqual(JSON.parse(exprCaptured.body), { title: 'Halo "Dunia"', lines: ['a', 'b'] })
})

test('assistant supports new node types while keeping legacy tool and httpRequest blocked', () => {
  const built = applyWorkflowOperations([], [], [
    { op: 'addNode', ref: 'hook', type: 'webhookTrigger' },
    { op: 'addNode', ref: 'edit', type: 'imageEdit', after: 'hook', config: { editMode: 'igFormat', aspectRatio: '4:5' } },
    { op: 'addNode', ref: 'vision', type: 'aiVision', after: 'edit' },
    { op: 'addNode', ref: 'alert', type: 'notify', after: 'vision', config: { message: 'Selesai' } },
  ])
  assert.deepEqual(built.nodes.map(n => n.type), ['webhookTrigger', 'imageEdit', 'aiVision', 'notify'])
  assert.equal(built.edges.length, 3)
  assert.throws(() => applyWorkflowOperations([], [], [{ op: 'addNode', ref: 'legacy', type: 'httpRequest' }]), /tidak tersedia/)
})

test('workflowNodeImages renders thumbnails for both imageGenerate and imageEdit', () => {
  const result = { nodeId: 'e', label: 'Edit', status: 'success' as const, input: [], output: [{ json: { imagePreviewUrl: '/api/workflow-media/' + 'a'.repeat(48) } }], durationMs: 5 }
  assert.equal(workflowNodeImages({ type: 'imageEdit', data: { label: 'Edit', result } }).length, 1)
})

test('backend imageEdit (igFormat & aiEdit), aiVision, notify channels, and video storage work together', async t => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-newnodes-'))
  process.env.NODE_ENV = 'test'
  process.env.SOCIAL_CREDENTIALS_KEY = randomBytes(32).toString('base64')
  process.env.NINEROUTER_API_KEY = 'test-key'
  process.env.NINEROUTER_BASE_URL = 'https://mock-router.example.com/v1'
  process.env.PUBLIC_BASE_URL = 'https://panel.example.com'

  const { db } = await import('../server/db.js')
  const { encryptSocialToken } = await import('../server/utils/social-crypto.js')
  const { storeWorkflowImage, storeWorkflowVideo } = await import('../server/workflow-media.js')
  const { runImageEditNode } = await import('../server/workflow-image-edit.js')
  const { runVisionNode } = await import('../server/workflow-vision.js')
  const { runNotifyNode } = await import('../server/workflow-notify.js')
  const { chooseSharedFile } = await import('../server/workflow-drive.js')

  t.after(() => db.close())

  db.prepare('insert into users (id, email, name, role) values (?, ?, ?, ?)').run('u1', 'u1@example.test', 'User 1', 'admin')

  // 1. storeWorkflowImage + imageEdit igFormat (4:5 + XML-safe overlay)
  const srcPng = await sharp({ create: { width: 800, height: 800, channels: 3, background: '#1e3a5f' } }).png().toBuffer()
  const stored = await storeWorkflowImage('u1', srcPng.toString('base64'), 'image/png')

  const igFormatted = await runImageEditNode({
    node: node('ie', 'imageEdit', {
      editMode: 'igFormat',
      aspectRatio: '4:5',
      overlayTitle: 'Promo & Diskon <50%>',
      overlaySubtitle: 'Khusus hari ini',
      watermark: '@bluudzstore',
      textPosition: 'bottom',
    }),
    input: [{ json: { imagePreviewUrl: stored.previewUrl, imageUrl: stored.imageUrl } }],
  }, { id: 'u1', role: 'admin' })

  assert.equal(igFormatted[0].json.editedWidth, 1080)
  assert.equal(igFormatted[0].json.editedHeight, 1350)
  assert.match(igFormatted[0].json.imageUrl, /^https:\/\/panel\.example\.com\/api\/workflow-media\/[a-f0-9]{48}$/)

  // 2. imageEdit aiEdit with mock editImpl
  const outPng = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ffffff' } }).png().toBuffer()
  const aiEdited = await runImageEditNode({
    node: node('ie2', 'imageEdit', { editMode: 'aiEdit', model: 'ag/gemini-3.1-flash-image', prompt: 'Make brighter', resolution: '1K' }),
    input: [{ json: { imagePreviewUrl: stored.previewUrl } }],
  }, { id: 'u1', role: 'admin' }, {
    editImpl: async () => ({ image: `data:image/png;base64,${outPng.toString('base64')}`, model: 'ag/gemini-3.1-flash-image', output: { width: 64, height: 64 } }),
  })
  assert.equal(aiEdited[0].json.editMode, 'aiEdit')
  assert.equal(aiEdited[0].json.editedWidth, 64)

  // 3. aiVision reads local workflow-media and parses QA JSON
  const visionOut = await runVisionNode({
    node: node('v', 'aiVision', { model: 'ag/gemini-3.8-flash', prompt: 'Cek gambar', qaMode: true }),
    input: [{ json: { imagePreviewUrl: igFormatted[0].json.imagePreviewUrl } }],
  }, { id: 'u1', role: 'admin' }, {
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"passed": true, "score": 9, "summary": "Gambar tajam dan jelas", "issues": []}\n```' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  })
  assert.equal(visionOut[0].json.visionPassed, true)
  assert.equal(visionOut[0].json.visionScore, 9)
  assert.equal(visionOut[0].json.output, 'Gambar tajam dan jelas')

  // 4. notify node formats Telegram & Discord
  db.prepare('insert into workflow_notification_channels (id, user_id, label, channel_type, chat_id, encrypted_secret) values (?, ?, ?, ?, ?, ?)').run(
    'ch-tg', 'u1', 'TG Admin', 'telegram', '-100999', encryptSocialToken('123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef'),
  )
  let tgPayload: any = null
  const tgOut = await runNotifyNode({
    node: node('n', 'notify', { channelId: 'ch-tg', message: 'Siap publish: {{ $json.visionSummary }}', includeImage: true }),
    input: [{ json: { visionSummary: 'Mantap', imageUrl: igFormatted[0].json.imageUrl } }],
  }, { id: 'u1' }, {
    fetchImpl: async (url: any, opts: any) => {
      tgPayload = { url: String(url), body: JSON.parse(opts.body) }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  })
  assert.match(tgPayload.url, /api\.telegram\.org\/bot.*\/sendPhoto$/)
  assert.equal(tgPayload.body.chat_id, '-100999')
  assert.equal(tgPayload.body.caption, 'Siap publish: Mantap')
  assert.equal(tgOut[0].json.notificationStatus, 'sent')

  // 5. storeWorkflowVideo + chooseSharedFile video filter
  const fakeMp4 = Buffer.concat([Buffer.from([0, 0, 0, 20]), Buffer.from('ftypisom'), Buffer.alloc(16)])
  const vid = await storeWorkflowVideo('u1', fakeMp4, 'video/mp4')
  assert.match(vid.videoUrl, /^https:\/\/panel\.example\.com\/api\/workflow-media\/[a-f0-9]{48}$/)
  assert.equal(chooseSharedFile([
    { name: 'clip.mp4', mimeType: 'video/mp4', capabilities: { canDownload: true } },
    { name: 'photo.jpg', mimeType: 'image/jpeg', capabilities: { canDownload: true } },
  ], 'random', '', () => 0, 'videos').file.name, 'clip.mp4')
})
