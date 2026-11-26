import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import {
  analyzePromptLocally,
  buildCheckerPrompt,
  parsePromptEvaluation,
} from '../shared/prompt-checker.js'

test('analyzePromptLocally detects elements and estimates tokens accurately', () => {
  const empty = analyzePromptLocally('')
  assert.equal(empty.words, 0)
  assert.equal(empty.approxTokens, 0)
  assert.equal(empty.passedCount, 0)

  const weak = analyzePromptLocally('Tolong bantu')
  assert.equal(weak.words, 2)
  assert.equal(weak.passedCount, 0)

  const complete = analyzePromptLocally(
    'Sebagai product designer untuk aplikasi kasir UMKM, evaluasi alur checkout dalam format tabel poin, jangan sertakan saran generik tanpa contoh konkret.'
  )
  assert.equal(complete.passedCount, 4)
  assert.ok(complete.approxTokens > complete.words)
  assert.deepEqual(
    complete.checks.map((c) => c.passed),
    [true, true, true, true]
  )
})

test('buildCheckerPrompt appends goal, focuses, and extra criteria only when provided', () => {
  assert.equal(buildCheckerPrompt('  Tes prompt  ', { goal: 'general', focuses: [], extraCriteria: '' }), 'Tes prompt')

  const composed = buildCheckerPrompt('Review endpoint API', {
    goal: 'coding',
    focuses: ['clarity', 'strict_constraints'],
    extraCriteria: 'Cocokkan untuk Node.js',
  })
  assert.match(composed, /^Review endpoint API/)
  assert.match(composed, /Tujuan prompt: Coding \/ Agent/)
  assert.match(composed, /Fokus audit: Kejelasan, Batasan ketat/)
  assert.match(composed, /Kriteria tambahan: Cocokkan untuk Node\.js/)
})

test('parsePromptEvaluation parses clean JSON, fenced JSON, clamps scores, and handles plain text fallback', () => {
  const clean = parsePromptEvaluation(JSON.stringify({
    scores: { clarity: 110, specificity: -5, constraints: 70 },
    summary: 'Perlu penajaman batasan.',
    strengths: ['Tujuan jelas', ''],
    issues: [{ title: 'Format belum ada', detail: 'Tambahkan schema JSON.', severity: 'HIGH' }, 'Tanpa batasan panjang'],
    recommendations: ['Sebutkan jumlah poin maksimal.'],
    improved_prompt: 'Evaluasi draft ini dalam format JSON maksimal 3 poin.',
  }))
  assert.ok(clean)
  assert.equal(clean.scores.clarity, 100)
  assert.equal(clean.scores.specificity, 0)
  assert.equal(clean.scores.constraints, 70)
  assert.equal(clean.overall, 57)
  assert.deepEqual(clean.strengths, ['Tujuan jelas'])
  assert.equal(clean.issues.length, 2)
  assert.equal(clean.issues[0].severity, 'high')
  assert.equal(clean.issues[1].severity, 'medium')

  const fenced = parsePromptEvaluation('Berikut audit:\n```json\n{"overall": 82, "scores": {"clarity": 85, "specificity": 80, "constraints": 81}, "improved_prompt": "Versi siap pakai."}\n```')
  assert.ok(fenced)
  assert.equal(fenced.overall, 82)
  assert.equal(fenced.improved_prompt, 'Versi siap pakai.')

  assert.equal(parsePromptEvaluation('1. Skor: 80/100\n2. Saran biasa tanpa JSON'), null)
})

test('prompt_checker route returns parsed evaluation alongside raw result and saves history', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(join(tmpdir(), 'sibluudz-checker-'))
  process.env.NINEROUTER_API_KEY = 'checker-test-key'
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
              overall: 78,
              scores: { clarity: 82, specificity: 74, constraints: 78 },
              summary: 'Prompt cukup jelas tetapi belum menyebut format output.',
              strengths: ['Topik sudah terarah'],
              issues: [{ title: 'Belum ada format output', detail: 'Hasil bisa terlalu panjang.', severity: 'medium' }],
              recommendations: ['Tambahkan format daftar bernomor.'],
              improved_prompt: 'Evaluasi copy landing page ini dalam 5 poin bernomor.',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 45, completion_tokens: 90 },
    })
  })

  const server = mockServer.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  process.env.NINEROUTER_BASE_URL = origin + '/mock/v1'

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

  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('checker-user', 'checker@example.test', 'Checker', 'user')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(
    createHash('sha256').update('checker-token').digest('hex'),
    'checker-user',
    Date.now() + 60000
  )

  const response = await fetch(appOrigin + '/api/ai/generate', {
    method: 'POST',
    headers: {
      Origin: appOrigin,
      Cookie: 'sibluudz_session=checker-token',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'prompt_checker',
      prompt: 'Evaluasi copy landing page ini.',
      model: 'ag/gemini-3.8-flash',
    }),
  })

  assert.equal(response.status, 200)
  const data = await response.json()
  assert.equal(data.evaluation?.overall, 78)
  assert.equal(data.evaluation?.scores?.clarity, 82)
  assert.equal(data.evaluation?.improved_prompt, 'Evaluasi copy landing page ini dalam 5 poin bernomor.')
  assert.equal(capturedBodies.length, 1)
  assert.match(capturedBodies[0].messages[0].content, /JSON murni/)
  assert.equal(db.prepare("select count(*) as count from ai_history where type='prompt_checker'").get().count, 1)
})
