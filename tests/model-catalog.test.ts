import test from 'node:test'
import assert from 'node:assert/strict'
import {
  curateTextModels,
  curateImageModels,
  pickPreferredLatestTextModel,
} from '../shared/model-catalog.js'

test('curateTextModels filters legacy/noise models and sorts newest first', () => {
  const sampleModels = [
    'ag/claude-opus-4-6-thinking',
    'ag/claude-opus-5-5',
    'ag/claude-sonnet-4-6',
    'ag/claude-sonnet-5-5',
    'ag/gemini-3.8-flash',
    'ag/gemini-4-hydrogen',
    'ag/gpt-oss-120b-medium',
    'cx/gpt-5.6-sol',
    'cx/gpt-6.1-sol',
    'cx/gpt-6.2-sol',
    'cx/gpt-6.2-sol[1m]',
    'cx/gpt-reserve',
    'gptweb/chatgpt_alpha_model_external_access_reserved_gate_12',
    'gptweb/gpt-5-6',
    'gptweb/gpt-6',
    'gptweb/gpt-6-2',
    'muse-image/muse-image-1',
    'river/Qwen/Qwen3.5-9B',
    'river/Qwen/Qwen3.8-27B-FP8',
    'river/moonshotai/Kimi-K3',
    'river/moonshotai/Kimi-K3.1-Pro',
    'river/deepseek-ai/DeepSeek-V4.1-Flash',
    'river/deepseek-ai/DeepSeek-V4.1-Flash-1017',
  ]

  const curated = curateTextModels(sampleModels)

  // Noise & non-text excluded completely
  assert.ok(!curated.all.includes('muse-image/muse-image-1'))
  assert.ok(!curated.all.includes('cx/gpt-reserve'))
  assert.ok(!curated.all.includes('gptweb/chatgpt_alpha_model_external_access_reserved_gate_12'))

  // Legacy models moved out of `latest` into `legacy`
  for (const oldId of [
    'ag/claude-opus-4-6-thinking',
    'ag/claude-sonnet-4-6',
    'ag/gemini-3.8-flash',
    'ag/gpt-oss-120b-medium',
    'cx/gpt-5.6-sol',
    'gptweb/gpt-5-6',
    'river/Qwen/Qwen3.5-9B',
    'river/moonshotai/Kimi-K3',
    'river/deepseek-ai/DeepSeek-V4.1-Flash-1017',
  ]) {
    assert.ok(!curated.latest.includes(oldId), `Expected ${oldId} not to be in latest`)
    assert.ok(curated.legacy.includes(oldId), `Expected ${oldId} to be in legacy`)
  }

  // Newest models kept in `latest` and ordered newest-first
  assert.equal(curated.latest[0], 'cx/gpt-6.2-sol')
  assert.ok(curated.latest.indexOf('cx/gpt-6.2-sol') < curated.latest.indexOf('cx/gpt-6.2-sol[1m]'))
  assert.ok(curated.latest.indexOf('cx/gpt-6.2-sol') < curated.latest.indexOf('cx/gpt-6.1-sol'))
  assert.ok(curated.latest.indexOf('ag/claude-opus-5-5') < curated.latest.indexOf('gptweb/gpt-6-2'))
  assert.ok(curated.latest.indexOf('gptweb/gpt-6-2') < curated.latest.indexOf('gptweb/gpt-6'))
  assert.ok(curated.latest.includes('ag/gemini-4-hydrogen'))

  // Flagship picker selects cx/gpt-6.2-sol first
  assert.equal(pickPreferredLatestTextModel(sampleModels), 'cx/gpt-6.2-sol')
})

test('curateImageModels separates legacy gpt-image 1.5/2 from latest 2.5+/gemini-3.1', () => {
  const imageModels = [
    'ag/gemini-3.1-flash-image',
    'cx/gpt-6-sol-image',
    'cx/gpt-image-1.5',
    'cx/gpt-image-2',
    'cx/gpt-image-2.5',
    'cx/gpt-image-2.6-flare',
  ]

  const curated = curateImageModels(imageModels)
  assert.deepEqual(curated.latest, [
    'cx/gpt-6-sol-image',
    'cx/gpt-image-2.6-flare',
    'cx/gpt-image-2.5',
    'ag/gemini-3.1-flash-image',
  ])
  assert.deepEqual(curated.legacy, ['cx/gpt-image-2', 'cx/gpt-image-1.5'])
})
