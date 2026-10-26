import assert from 'node:assert/strict'
import { test } from 'node:test'
import { initialBrief, buildArchitectPrompt, buildExecutorPrompt } from '../src/features/prompt-studio/prompt-builder.ts'

test('blank briefs and missing plans do not generate usable prompts', () => {
  assert.equal(buildArchitectPrompt(initialBrief), '')
  assert.equal(buildArchitectPrompt({ ...initialBrief, request: '  ' }), '')
  assert.equal(buildExecutorPrompt(initialBrief, 'plan'), '')
  assert.equal(buildExecutorPrompt({ ...initialBrief, request: 'Redesign' }, '  '), '')
})
test('architect prompt preserves user constraints and requests a self-contained implementation handoff', () => {
  const result = buildArchitectPrompt({ ...initialBrief, request: 'Rapikan sidebar', context: 'React', references: 'Warna biru', constraints: 'Jangan ubah invoice', scope: 'Tampilan saja', detail: 'Ringkas' })
  for (const value of ['Rapikan sidebar', 'React', 'Warna biru', 'Jangan ubah invoice', 'Tampilan saja', 'Utamakan spesifikasi padat', 'Blok ini wajib mandiri', '1440/768/390']) assert.ok(result.includes(value))
})
test('executor preserves the complete plan without summarizing away design decisions', () => {
  const plan = 'Layout 240px / 1fr\nWarna #123456\nKriteria: keyboard focus terlihat.'
  const result = buildExecutorPrompt({ ...initialBrief, request: 'Rapikan sidebar' }, plan)
  assert.ok(result.includes(plan))
  assert.ok(result.includes('Rapikan sidebar'))
  assert.ok(result.includes('Jangan mengarang detail desain penting'))
})
