import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  WEBSITE_PROMPT_STARTERS,
  buildWebsitePrompt,
  estimateWebsitePromptMetrics,
  formatWebsiteSpecMarkdown,
  parseWebsiteSpec,
} from '../shared/website-prompt.js'

test('buildWebsitePrompt formats project type, assistant, stack, standards, and constraints', () => {
  assert.equal(buildWebsitePrompt('   '), '')
  const composed = buildWebsitePrompt('Buat portal pelanggan B2B.', {
    projectType: 'fullstack',
    assistant: 'cursor',
    stack: ['React + Vite', 'TypeScript'],
    standards: ['responsive', 'tests'],
    constraints: 'Gunakan SQLite lokal.',
  })
  assert.match(composed, /^Buat portal pelanggan B2B\./)
  assert.match(composed, /Jenis proyek: Fullstack \/ API/)
  assert.match(composed, /Target coding assistant: Cursor/)
  assert.match(composed, /Tech stack: React \+ Vite, TypeScript/)
  assert.match(composed, /Standar kualitas: Responsif Mobile, Sertakan Test/)
  assert.match(composed, /Batasan & konteks repo: Gunakan SQLite lokal\./)
})

test('parseWebsiteSpec and formatWebsiteSpecMarkdown handle JSON, fenced JSON, and plain fallback', () => {
  assert.ok(WEBSITE_PROMPT_STARTERS.length >= 4)
  const metrics = estimateWebsitePromptMetrics('Buat halaman utama produk.')
  assert.equal(metrics.words, 4)
  assert.ok(metrics.approxTokens >= 4)

  const parsed = parseWebsiteSpec(
    '```json\n' +
      JSON.stringify({
        title: 'Portal Katalog UMKM',
        summary: 'Arsitektur ringan berbasis React dan SQLite.',
        stack: ['React + Vite', 'TypeScript'],
        files: [{ path: 'src/pages/Catalog.tsx', purpose: 'Halaman daftar produk' }],
        components: [{ name: 'ProductGrid', responsibility: 'Menampilkan kartu produk responsif' }],
        user_flows: ['Pilih kategori', 'Kirim pesanan'],
        states: { empty: 'Tampilkan tombol reset filter', loading: 'Tampilkan teks memuat', error: 'Tampilkan tombol coba lagi' },
        acceptance_criteria: ['0 overflow di 390px'],
        execution_prompt: 'Buat halaman katalog produk sesuai struktur di atas.',
      }) +
      '\n```'
  )

  assert.ok(parsed)
  assert.equal(parsed.title, 'Portal Katalog UMKM')
  assert.equal(parsed.files[0].path, 'src/pages/Catalog.tsx')
  assert.equal(parsed.states.empty, 'Tampilkan tombol reset filter')
  assert.equal(parsed.execution_prompt, 'Buat halaman katalog produk sesuai struktur di atas.')

  const md = formatWebsiteSpecMarkdown(parsed)
  assert.match(md, /# Portal Katalog UMKM/)
  assert.match(md, /`src\/pages\/Catalog\.tsx`: Halaman daftar produk/)
  assert.match(md, /## Prompt Eksekusi/)

  assert.equal(parseWebsiteSpec('Penjelasan biasa tanpa struktur JSON.'), null)
})

test('website_prompt route returns parsed websiteSpec alongside raw result and saves history', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-website-'))
  process.env.NINEROUTER_API_KEY = 'website-test-key'
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
              title: 'Dashboard Analitik Penjualan',
              summary: 'Dashboard ringan untuk memantau omzet harian.',
              stack: ['React + Vite', 'TypeScript'],
              files: [{ path: 'src/features/sales/SalesPage.tsx', purpose: 'Halaman utama analitik' }],
              components: [{ name: 'SalesTable', responsibility: 'Tabel transaksi dengan urutan' }],
              user_flows: ['Pilih rentang tanggal', 'Ekspor CSV'],
              states: { empty: 'Belum ada transaksi', loading: 'Memuat data...', error: 'Gagal memuat transaksi' },
              acceptance_criteria: ['Angka rata kanan tabular'],
              execution_prompt: 'Implementasikan SalesPage.tsx dan SalesTable sesuai spesifikasi.',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 55, completion_tokens: 110 },
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

  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run(
    'web-user',
    'web@example.test',
    'Web',
    'user'
  )
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(
    createHash('sha256').update('web-token').digest('hex'),
    'web-user',
    Date.now() + 60000
  )

  const response = await fetch(appOrigin + '/api/ai/generate', {
    method: 'POST',
    headers: {
      Origin: appOrigin,
      Cookie: 'sibluudz_session=web-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'website_prompt',
      prompt: 'Buat dashboard analitik penjualan.',
      model: 'ag/gemini-3.8-flash',
    }),
  })

  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.websiteSpec?.title, 'Dashboard Analitik Penjualan')
  assert.equal(data.websiteSpec?.files?.[0]?.path, 'src/features/sales/SalesPage.tsx')
  assert.equal(
    data.websiteSpec?.execution_prompt,
    'Implementasikan SalesPage.tsx dan SalesTable sesuai spesifikasi.'
  )
  assert.equal(capturedBodies.length, 1)
  assert.match(capturedBodies[0].messages[0].content, /JSON murni/)
  assert.equal(db.prepare("select count(*) as count from ai_history where type='website_prompt'").get().count, 1)
})
