import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  IMAGE_PROMPT_STARTERS,
  buildImagePrompt,
  estimateImagePromptMetrics,
  formatImagePromptText,
  parseImagePromptSpec,
} from '../shared/image-prompt.js'

test('buildImagePrompt formats target, style, ratio, lighting, language, and details', () => {
  assert.equal(buildImagePrompt('   '), '')
  const composed = buildImagePrompt('Botol serum kaca frosted di batu travertine.', {
    target: 'flux',
    style: 'product_studio',
    ratio: '1:1',
    lighting: 'studio_softbox',
    language: 'en',
    details: 'Tanpa teks tambahan dan watermark.',
  })
  assert.match(composed, /^Botol serum kaca frosted/)
  assert.match(composed, /Target model gambar: Flux \/ SDXL/)
  assert.match(composed, /Gaya visual: Foto Produk/)
  assert.match(composed, /Rasio aspek: 1:1/)
  assert.match(composed, /Pencahayaan: Studio Softbox/)
  assert.match(composed, /Bahasa prompt utama & variasi: Bahasa Inggris/)
  assert.match(composed, /Detail tambahan & hal yang dihindari: Tanpa teks tambahan dan watermark\./)
})

test('parseImagePromptSpec and formatImagePromptText handle JSON, fenced JSON, and plain fallback', () => {
  assert.ok(IMAGE_PROMPT_STARTERS.length >= 4)
  const metrics = estimateImagePromptMetrics('Foto kemasan kopi di meja kayu.')
  assert.equal(metrics.words, 6)

  const parsed = parseImagePromptSpec(
    '```json\n' +
      JSON.stringify({
        title: 'Kopi Sangrai Katalog 4:5',
        main_prompt:
          'A matte black 250g roasted coffee pouch standing upright on a warm oak table beside scattered whole beans and a ceramic cup.',
        negative_prompt: 'text overlay, watermark, blurry packaging',
        variants: [
          {
            label: 'Close-up tekstur',
            prompt: 'Macro three-quarter angle focusing on the matte kraft pouch grain and morning window shadow across warm oak wood.',
          },
        ],
        breakdown: {
          subject: 'Kemasan kopi matte hitam 250g',
          composition: 'Vertical 4:5 catalog framing, 85mm lens',
          lighting: 'Soft morning side window light',
          color_palette: 'Deep charcoal, warm oak, roasted umber',
        },
        parameters: '4:5',
        tips: ['Pertahankan jarak ruang kosong di bagian atas agar label mudah diberi overlay teks katalog.'],
      }) +
      '\n```'
  )

  assert.ok(parsed)
  assert.equal(parsed.title, 'Kopi Sangrai Katalog 4:5')
  assert.match(parsed.main_prompt, /matte black 250g/i)
  assert.equal(parsed.variants.length, 1)
  assert.equal(parsed.breakdown.subject, 'Kemasan kopi matte hitam 250g')

  const txt = formatImagePromptText(parsed)
  assert.match(txt, /=== MAIN PROMPT ===/)
  assert.match(txt, /=== VARIASI ===/)
  assert.equal(parseImagePromptSpec('Penjelasan biasa tanpa JSON.'), null)
})

test('image_prompt route returns parsed imagePromptSpec alongside raw result and saves history', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-image-prompt-'))
  process.env.NINEROUTER_API_KEY = 'image-prompt-test-key'
  process.env.NODE_ENV = 'test'

  const capturedBodies: Array<{ messages: Array<{ role: string; content: string }> }> = []
  const mockServer = express()
  mockServer.use(express.json())
  mockServer.post('/mock/v1/chat/completions', (req, res) => {
    capturedBodies.push(req.body)
    res.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              title: 'Kopi Meja Kayu',
              main_prompt:
                'Commercial product photograph of a matte black coffee pouch resting on warm oak wood, soft morning window light from the left.',
              negative_prompt: 'watermark, distorted label, extra objects',
              variants: [
                {
                  label: 'Overhead flat-lay',
                  prompt: 'Top-down flat-lay composition of the matte black coffee pouch framed cleanly on warm oak planks.',
                },
              ],
              breakdown: {
                subject: 'Pouch kopi matte hitam dengan tekstur halus',
                composition: 'Three-quarter product angle, rasio 4:5',
                lighting: 'Cahaya pagi lembut dari samping kiri',
                color_palette: 'Hitam arang, kayu ek hangat, krem netral',
              },
              parameters: '4:5',
              tips: ['Tambahkan catatan jenis kemasan agar lebih konsisten antar seri foto.'],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 42, completion_tokens: 96 },
    })
  })

  const server = mockServer.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  process.env.NINEROUTER_BASE_URL = `http://127.0.0.1:${address.port}/mock/v1`

  const { db } = await import('../server/db.js')
  const { default: routes } = await import('../server/routes/ai.routes.js')

  const app = express()
  app.use(express.json())
  app.use('/api/ai', routes)
  const appServer = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => appServer.once('listening', resolve))
  const appAddress = appServer.address()
  assert.ok(appAddress && typeof appAddress !== 'string')
  const appOrigin = `http://127.0.0.1:${appAddress.port}`

  t.after(async () => {
    await new Promise<void>((resolve) => appServer.close(() => resolve()))
    await new Promise<void>((resolve) => server.close(() => resolve()))
    db.close()
  })

  db.prepare('insert into users (id, email, name, role) values (?, ?, ?, ?)').run(
    'imgp-user',
    'imgp@example.test',
    'Prompt Visual Tester',
    'user'
  )
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(
    createHash('sha256').update('imgp-token').digest('hex'),
    'imgp-user',
    Date.now() + 60000
  )

  const res = await fetch(`${appOrigin}/api/ai/generate`, {
    method: 'POST',
    headers: {
      Origin: appOrigin,
      Cookie: 'sibluudz_session=imgp-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'image_prompt',
      model: 'cx/gpt-6.2-sol',
      prompt: buildImagePrompt('Kemasan kopi di meja kayu, cahaya pagi, komposisi vertikal.', {
        target: 'universal',
        style: 'product_studio',
        ratio: '4:5',
      }),
    }),
  })

  assert.equal(res.status, 200)
  const data = await res.json()
  assert.ok(data.imagePromptSpec)
  assert.equal(data.imagePromptSpec.title, 'Kopi Meja Kayu')
  assert.match(data.imagePromptSpec.main_prompt, /Commercial product photograph/)
  assert.equal(data.imagePromptSpec.variants.length, 1)
  assert.equal(capturedBodies.length, 1)
  assert.match(capturedBodies[0].messages[0].content, /Visual Prompt Engineer/i)
  assert.equal(db.prepare('select count(*) as count from ai_history where type = ?').get('image_prompt').count, 1)
})
