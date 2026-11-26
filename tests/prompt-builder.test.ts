import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  PROMPT_STUDIO_TEMPLATES,
  initialBrief,
  buildArchitectPrompt,
  buildExecutorPrompt,
  estimatePromptMetrics,
  parseStudioPromptSections,
} from '../src/features/prompt-studio/prompt-builder.ts'

test('blank briefs and missing plans do not generate usable prompts', () => {
  assert.equal(buildArchitectPrompt(initialBrief), '')
  assert.equal(buildArchitectPrompt({ ...initialBrief, request: '  ' }), '')
  assert.equal(buildExecutorPrompt(initialBrief, 'plan'), '')
  assert.equal(buildExecutorPrompt({ ...initialBrief, request: 'Redesign' }, '  '), '')
})

test('architect prompt preserves user constraints and requests a self-contained implementation handoff', () => {
  const result = buildArchitectPrompt({
    ...initialBrief,
    request: 'Rapikan sidebar',
    context: 'React',
    references: 'Warna biru',
    constraints: 'Jangan ubah invoice',
    scope: 'Tampilan saja',
    detail: 'Ringkas',
  })
  for (const value of [
    'Rapikan sidebar',
    'React',
    'Warna biru',
    'Jangan ubah invoice',
    'Tampilan saja',
    'Utamakan spesifikasi padat',
    'Blok ini wajib mandiri',
    '1440/768/390',
  ]) {
    assert.ok(result.includes(value))
  }
})

test('executor preserves the complete plan without summarizing away design decisions', () => {
  const plan = 'Layout 240px / 1fr\nWarna #123456\nKriteria: keyboard focus terlihat.'
  const result = buildExecutorPrompt({ ...initialBrief, request: 'Rapikan sidebar' }, plan)
  assert.ok(result.includes(plan))
  assert.ok(result.includes('Rapikan sidebar'))
  assert.ok(result.includes('Jangan mengarang detail desain penting'))
})

test('templates, metric estimation, and section parser support live Prompt Studio UI', () => {
  assert.ok(PROMPT_STUDIO_TEMPLATES.length >= 4)
  for (const tpl of PROMPT_STUDIO_TEMPLATES) {
    assert.ok(tpl.brief.request && tpl.brief.request.trim().length > 10)
  }

  const emptyMetrics = estimatePromptMetrics('')
  assert.equal(emptyMetrics.words, 0)
  assert.equal(emptyMetrics.approxTokens, 0)

  const architectPrompt = buildArchitectPrompt({ ...initialBrief, request: 'Rapikan sidebar' })
  const metrics = estimatePromptMetrics(architectPrompt)
  assert.ok(metrics.words > 100)
  assert.ok(metrics.approxTokens > metrics.words)

  const sections = parseStudioPromptSections(architectPrompt)
  assert.deepEqual(
    sections.map((s) => s.heading),
    [
      'Peran & tujuan',
      'BRIEF PENGGUNA',
      'CARA BEKERJA',
      'HASIL YANG HARUS ANDA BERIKAN',
      'ATURAN UNTUK PROMPT IMPLEMENTASI FINAL',
    ]
  )

  const executorSections = parseStudioPromptSections(
    buildExecutorPrompt({ ...initialBrief, request: 'Rapikan sidebar' }, 'Batch 1: edit Sidebar.tsx')
  )
  assert.deepEqual(
    executorSections.map((s) => s.heading),
    ['Peran & tujuan', 'BRIEF ASLI', 'BATAS PELAKSANAAN', 'RANCANGAN DARI AI PERANCANG']
  )
})
