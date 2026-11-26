import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { relightMasterPromptV3 } from '../shared/relight-master-prompt.js'
import { buildRelightPrompt, relightOptions, relightPresets, RELIGHT_PROMPT_VERSION } from '../shared/relight.js'

const section = (text: string, heading: string) => text.split(/(?=^### )/m).find(block => block.startsWith(`### ${heading}`))!

test('the embedded master is the complete supplied V3 document', () => {
  assert.equal(RELIGHT_PROMPT_VERSION, 'universal-master-v3')
  assert.equal(createHash('sha256').update(relightMasterPromptV3).digest('hex'), 'f29dfe6e5d6a68810ef25d71d32c54b6171669872b1d00f90894bbabd15a468c')
  for (const heading of ['6.', '7.', '8.', '8A.']) {
    assert.equal(section(buildRelightPrompt(), heading), section(relightMasterPromptV3, heading), heading)
  }
  assert.match(buildRelightPrompt(), /Jangan menjadikan aturan preservasi sebagai alasan untuk tidak melakukan perubahan pencahayaan sama sekali/)
})

test('all five styles keep the full preservation rules and replace conflicting strobist defaults', () => {
  for (const preset of relightPresets) {
    const prompt = buildRelightPrompt({ preset: preset.id })
    assert.ok(prompt.includes(preset.prompt), preset.id)
    assert.ok(prompt.includes('### 8A. ULTRA-STRICT PIXEL-LEVEL PRESERVATION'))
    assert.match(prompt, /DILARANG MENGUBAH SATU DIGIT PUN/)
    assert.match(prompt, /HASIL WAJIB MENUNJUKKAN PERUBAHAN PENCAHAYAAN YANG JELAS/)
    if (preset.id !== 'strobist') assert.doesNotMatch(prompt, /PROFESSIONAL OFF-CAMERA STROBIST FLASH|Professional Off-Camera Strobist Flash|BACKGROUND HARUS RELATIF LEBIH GELAP/)
  }
})

test('every lighting control reaches the active recipe without contradictory option defaults', () => {
  for (const [key, options] of Object.entries(relightOptions)) {
    for (const option of options) {
      const prompt = buildRelightPrompt({ [key]: option.id })
      assert.ok(prompt.includes(option.prompt), `${key}:${option.id}`)
      for (const other of options.filter(item => item.id !== option.id)) assert.ok(!prompt.includes(other.prompt), `${key}:${other.id}`)
    }
  }
  assert.match(buildRelightPrompt({ intensity: 'strong' }), /SUBJECT EXPOSURE: \+1 to \+1\.5 EV/)
  assert.match(buildRelightPrompt({ intensity: 'strong' }), /AMBIENT BACKGROUND: -1\.5 to -2 EV/)
  assert.match(buildRelightPrompt({ intensity: 'medium' }), /SUBJECT EXPOSURE: \+0\.5 to \+1 EV/)
  assert.match(buildRelightPrompt({ intensity: 'subtle' }), /SUBJECT EXPOSURE: \+0\.25 to \+0\.5 EV/)
})

test('native resolution changes only the dimension rules, and long user guidance is not truncated', () => {
  for (const resolution of ['1K', '2K', '4K'] as const) {
    const prompt = buildRelightPrompt({ preset: 'backlit_rim', temperature: 'cool', pattern: 'blinds', direction: 'left' }, 'x'.repeat(4000), resolution)
    assert.match(prompt, new RegExp(`native ${resolution}`))
    assert.doesNotMatch(prompt, /Dimensi gambar tidak berubah|Pertahankan rasio aspek serta dimensi asli|Pertahankan dimensi piksel asli/)
    assert.ok(prompt.includes('x'.repeat(4000)))
    assert.ok(prompt.length < 32000)
    assert.equal(section(prompt, '7.'), section(relightMasterPromptV3, '7.'))
  }
})
