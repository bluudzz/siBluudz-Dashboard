import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

function minimalMp4Buffer() {
  const header = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32])
  return Buffer.concat([header, Buffer.alloc(64, 0)])
}

test('Google Flow MCP supports both videoGenerate and flow-backed imageGenerate', async t => {
  const prevDataDir = process.env.DATA_DIRECTORY
  const prevPublicBase = process.env.PUBLIC_BASE_URL
  const tempDir = mkdtempSync(join(tmpdir(), 'sibluudz-flow-video-'))
  process.env.DATA_DIRECTORY = tempDir
  process.env.NODE_ENV = 'test'
  process.env.PUBLIC_BASE_URL = 'https://panel.example.com'

  const { db } = await import('../server/db.js')
  const { storeWorkflowImage } = await import('../server/workflow-media.js')
  const { runVideoNode, getGoogleFlowPaths } = await import('../server/workflow-google-flow.js')
  const { runImageNode } = await import('../server/workflow-image.js')
  const { validateGraph } = await import('../shared/workflow-engine.js')
  const { inspectWorkflow } = await import('../shared/workflow-readiness.js')
  const { default: sharp } = await import('sharp')

  const flowPaths = getGoogleFlowPaths()
  assert.ok(flowPaths.profileDir.endsWith('google-flow-chrome-profile'))
  assert.ok(flowPaths.cliPath.endsWith('cli.js'))
  assert.equal(flowPaths.cdpUrl, 'http://127.0.0.1:9222')

  t.after(() => {
    db.close()
    if (prevDataDir === undefined) delete process.env.DATA_DIRECTORY
    else process.env.DATA_DIRECTORY = prevDataDir
    if (prevPublicBase === undefined) delete process.env.PUBLIC_BASE_URL
    else process.env.PUBLIC_BASE_URL = prevPublicBase
  })

  await t.test('videoGenerate validates in graph & readiness, polls Google Flow job, resolves upstream image reference, and stores MP4', async () => {
    db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('u-video', 'video@example.test', 'Video User', 'admin')

    const nodes = [
      { id: 't1', type: 'promptTrigger', position: { x: 0, y: 0 }, data: { label: 'Prompt', prompt: 'Kamera orbit produk kopi', promptMode: 'normal' } },
      { id: 'v1', type: 'videoGenerate', position: { x: 300, y: 0 }, data: { label: 'Generate Video', aspectRatio: '9:16', upscale: 'none' } },
    ]
    const edges = [{ id: 'e1', source: 't1', target: 'v1' }]
    assert.deepEqual(validateGraph(nodes, edges, true), [])
    assert.equal(inspectWorkflow(nodes, edges).some(i => i.severity === 'error'), false)

    const badNodes = [nodes[0], { ...nodes[1], data: { label: 'Generate Video', aspectRatio: '4:5', upscale: 'none' } }]
    assert.equal(inspectWorkflow(badNodes, edges).some(i => i.severity === 'error' && i.code === 'video-aspect'), true)
    const badOutputNodes = [nodes[0], { ...nodes[1], data: { label: 'Generate Video', aspectRatio: '9:16', outputs: '5', upscale: 'none' } }]
    assert.equal(inspectWorkflow(badOutputNodes, edges).some(i => i.severity === 'error' && i.code === 'video-outputs'), true)

    const tinyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]).toString('base64')
    const storedImg = await storeWorkflowImage('u-video', tinyJpeg, 'image/jpeg')

    const fakeVideoPath1 = join(tempDir, 'flow-render-1.mp4')
    const fakeVideoPath2 = join(tempDir, 'flow-render-2.mp4')
    writeFileSync(fakeVideoPath1, minimalMp4Buffer())
    writeFileSync(fakeVideoPath2, minimalMp4Buffer())

    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    let pollCount = 0
    const mockCallTool = async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'flow_generate_video') {
        return { id: 'job-123', status: 'processing', model: 'veo-3-1-fast', aspectRatio: '9:16' }
      }
      if (name === 'flow_job_status') {
        pollCount++
        if (pollCount === 1) return { id: 'job-123', status: 'processing' }
        return {
          id: 'job-123',
          status: 'completed',
          model: 'veo-3-1-fast',
          aspectRatio: '9:16',
          downloadedFiles: [fakeVideoPath1, fakeVideoPath2],
          mediaProbe: [
            { durationSeconds: 8, width: 1080, height: 1920 },
            { durationSeconds: 8, width: 1080, height: 1920 },
          ],
        }
      }
      throw new Error(`Unexpected tool: ${name}`)
    }

    const out = await runVideoNode(
      {
        node: { id: 'v1', data: { model: 'veo-3-1-fast', aspectRatio: '9:16', outputs: '2', upscale: 'none', useInputImage: true } },
        input: [{ json: { prompt: 'Slow cinematic zoom in', imagePreviewUrl: storedImg.previewUrl } }],
      },
      { id: 'u-video', role: 'admin' },
      { callTool: mockCallTool, outputDirectory: tempDir },
    )

    assert.equal(out.length, 2)
    assert.equal(pollCount, 2)
    assert.equal(calls[0].name, 'flow_generate_video')
    assert.equal(calls[0].args.outputs, 2)
    assert.equal(Array.isArray(calls[0].args.referenceFiles), true)
    assert.equal((calls[0].args.referenceFiles as string[]).length, 1)
    assert.equal(out[0].json.outputIndex, 1)
    assert.equal(out[1].json.outputIndex, 2)
    assert.equal(out[0].json.outputCount, 2)
    assert.match(out[0].json.videoPreviewUrl, /^\/api\/workflow-media\/[a-f0-9]{48}$/)
    assert.equal(out[0].json.videoUrl, `https://panel.example.com${out[0].json.videoPreviewUrl}`)
    assert.equal(out[0].json.videoMime, 'video/mp4')
    assert.equal(out[0].json.videoDurationSeconds, 8)
    assert.equal(out[0].json.videoResolution, '1080x1920')

    await assert.rejects(
      () => runVideoNode(
        {
          node: { id: 'v2', data: { prompt: 'Test error path', useInputImage: false } },
          input: [{ json: {} }],
        },
        { id: 'u-video', role: 'admin' },
        {
          callTool: async () => ({ id: 'job-err', status: 'needs_attention', error: 'CAPTCHA terdeteksi di Google Flow' }),
          outputDirectory: tempDir,
        },
      ),
      /CAPTCHA terdeteksi/,
    )
  })

  await t.test('imageGenerate with provider googleFlow runs flow_generate_image, converts PNG/WebP, and skips 9router model check in readiness', async () => {
    db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('u-flow-img', 'flowimg@example.test', 'Flow Image', 'admin')

    const nodes = [
      { id: 't1', type: 'promptTrigger', position: { x: 0, y: 0 }, data: { label: 'Prompt', prompt: 'Foto produk estetik', promptMode: 'normal' } },
      { id: 'i1', type: 'imageGenerate', position: { x: 300, y: 0 }, data: { label: 'Generate Gambar', provider: 'googleFlow', aspectRatio: '3:4', outputs: '2', reasoningLevel: 'high' } },
    ]
    const edges = [{ id: 'e1', source: 't1', target: 'i1' }]
    assert.equal(inspectWorkflow(nodes, edges).some(i => i.severity === 'error'), false)
    assert.equal(inspectWorkflow([nodes[0], { ...nodes[1], data: { label: 'Generate Gambar', provider: 'googleFlow', outputs: '0' } }], edges).some(i => i.severity === 'error' && i.code === 'image-outputs'), true)
    assert.equal(inspectWorkflow([nodes[0], { ...nodes[1], data: { label: 'Generate Gambar', provider: 'googleFlow', reasoningLevel: 'ultra' } }], edges).some(i => i.severity === 'error' && i.code === 'image-reasoning'), true)

    const fakeWebpPath1 = join(tempDir, 'flow-image-1.webp')
    const fakeWebpPath2 = join(tempDir, 'flow-image-2.webp')
    const webpBuf = await sharp({ create: { width: 4, height: 4, channels: 4, background: '#336699' } }).webp().toBuffer()
    writeFileSync(fakeWebpPath1, webpBuf)
    writeFileSync(fakeWebpPath2, webpBuf)

    const imageCalls: Array<{ name: string; args: Record<string, unknown> }> = []
    const result = await runImageNode(
      { node: { id: 'i1', data: { provider: 'googleFlow', model: 'nano-banana-2-1', aspectRatio: '3:4', outputs: '2', reasoningLevel: 'high', prompt: 'Botol parfum kaca' } }, input: [{ json: {} }] },
      { id: 'u-flow-img', role: 'admin' },
      {
        callTool: async (name: string, args: Record<string, unknown>) => {
          imageCalls.push({ name, args })
          if (name === 'flow_generate_image') return { id: 'img-job-1', status: 'processing' }
          if (name === 'flow_job_status') {
            return { id: 'img-job-1', status: 'completed', model: 'nano-banana-2-1', aspectRatio: '3:4', downloadedFiles: [fakeWebpPath1, fakeWebpPath2] }
          }
          throw new Error(`Unexpected tool ${name}`)
        },
        outputDirectory: tempDir,
      },
    )

    assert.deepEqual(imageCalls.map(c => c.name), ['flow_generate_image', 'flow_job_status'])
    assert.equal(imageCalls[0].args.outputs, 2)
    assert.equal(imageCalls[0].args.reasoningLevel, 'high')
    assert.equal(result.length, 2)
    assert.equal(result[0].json.imageProvider, 'googleFlow')
    assert.equal(result[0].json.imageModel, 'nano-banana-2-1')
    assert.equal(result[0].json.imageReasoningLevel, 'high')
    assert.equal(result[0].json.outputIndex, 1)
    assert.equal(result[1].json.outputIndex, 2)
    assert.equal(result[0].json.imageMime, 'image/jpeg')
    assert.match(result[0].json.imagePreviewUrl, /^\/api\/workflow-media\/[a-f0-9]{48}$/)
  })
})
