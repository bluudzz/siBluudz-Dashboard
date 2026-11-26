import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseTargetMime,
  computePngKeepLimit,
  encodeWithinBudget,
  EXPORT_LOSSLESS_MAX_BYTES,
  EXPORT_QUALITY_MAX,
  EXPORT_QUALITY_MIN,
  EXPORT_TARGET_BYTES,
  selectExportDimensions,
} from '../src/features/ai-generator/relight-export.ts'

test('computePngKeepLimit targets ~2.5 MB and preserves AI output up to 3.5 MB', () => {
  assert.equal(computePngKeepLimit(0), EXPORT_TARGET_BYTES)
  assert.equal(computePngKeepLimit(-100), EXPORT_TARGET_BYTES)
  assert.equal(computePngKeepLimit(Number.NaN), EXPORT_TARGET_BYTES)
  assert.equal(computePngKeepLimit(1_000_000), EXPORT_TARGET_BYTES)

  const aiBytes = Math.round(2.42 * 1024 * 1024)
  assert.equal(computePngKeepLimit(aiBytes), Math.round(aiBytes * 1.25))
  assert.equal(computePngKeepLimit(5 * 1024 * 1024), EXPORT_LOSSLESS_MAX_BYTES)
})

test('selectExportDimensions keeps the higher pixel resolution', () => {
  assert.deepEqual(selectExportDimensions(4000, 3000, 1024, 768), { width: 4000, height: 3000 })
  assert.deepEqual(selectExportDimensions(800, 600, 2048, 1536), { width: 2048, height: 1536 })
  assert.deepEqual(selectExportDimensions(0, 0, 1200, 900), { width: 1200, height: 900 })
})

test('chooseTargetMime selects JPEG for opaque photos and WebP when transparency is present', () => {
  assert.deepEqual(chooseTargetMime('image/jpeg', false), { mime: 'image/jpeg', ext: 'jpg' })
  assert.deepEqual(chooseTargetMime('image/png', false), { mime: 'image/jpeg', ext: 'jpg' })
  assert.deepEqual(chooseTargetMime('image/webp', false), { mime: 'image/webp', ext: 'webp' })
  assert.deepEqual(chooseTargetMime('image/png', true), { mime: 'image/webp', ext: 'webp' })
})

test('encodeWithinBudget fast-paths max quality when already under 2.5 MB target', async () => {
  const qualities: number[] = []
  const result = await encodeWithinBudget(async (q) => {
    qualities.push(q)
    return { size: Math.round(2.3 * 1024 * 1024) }
  }, EXPORT_TARGET_BYTES)

  assert.ok(result)
  assert.equal(result.quality, EXPORT_QUALITY_MAX)
  assert.deepEqual(qualities, [EXPORT_QUALITY_MAX])
})

test('encodeWithinBudget binary-searches highest quality within ~2.5 MB target', async () => {
  const result = await encodeWithinBudget(async (q) => {
    return { size: Math.round(1_800_000 + Math.max(0, q - 0.89) * 14_000_000) }
  }, EXPORT_TARGET_BYTES)

  assert.ok(result)
  assert.ok(result.blob.size <= EXPORT_TARGET_BYTES)
  assert.ok(result.quality > EXPORT_QUALITY_MIN && result.quality < EXPORT_QUALITY_MAX)
})

test('encodeWithinBudget enforces EXPORT_QUALITY_MIN (0.90) floor even on oversized inputs', async () => {
  const result = await encodeWithinBudget(async (q) => {
    return { size: Math.round(q * 4_000_000) }
  }, EXPORT_TARGET_BYTES)

  assert.ok(result)
  assert.equal(result.quality, EXPORT_QUALITY_MIN)
})
