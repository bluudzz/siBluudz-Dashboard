import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync } from 'node:fs'
import { mkdir, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const formatUtc = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

test('cleanupExpiredGeneratedFiles removes generated media files and history older than 14 days', async (t) => {
  process.env.DATA_DIRECTORY = mkdtempSync(path.join(tmpdir(), 'sibluudz-cleanup-'))
  process.env.NODE_ENV = 'test'

  const { db } = await import('../server/db.js')
  const { mediaDirectory } = await import('../server/workflow-media.js')
  const { cleanupExpiredGeneratedFiles, GENERATED_RETENTION_DAYS } = await import(
    '../server/generated-cleanup.js'
  )

  t.after(() => db.close())

  assert.equal(GENERATED_RETENTION_DAYS, 14)

  const now = Date.now()
  const dayMs = 24 * 60 * 60 * 1000
  const expiredIso = formatUtc(now - 15 * dayMs)
  const freshIso = formatUtc(now - 13 * dayMs)

  db.prepare('insert into users (id, email, name, role) values (?,?,?,?)').run(
    'clean-user',
    'clean@test.local',
    'Clean User',
    'user'
  )
  db.prepare('insert into workflows (id, user_id, name) values (?,?,?)').run(
    'clean-wf',
    'clean-user',
    'Cleanup Test Workflow'
  )

  await mkdir(mediaDirectory, { recursive: true })

  // 15-day-old generated media + DB row -> should be deleted
  const oldMediaFile = path.join(mediaDirectory, 'old_media.jpg')
  await writeFile(oldMediaFile, Buffer.from('old'))
  db.prepare('insert into workflow_media (token, user_id, filename, mime_type, created_at) values (?,?,?,?,?)').run(
    'a'.repeat(48),
    'clean-user',
    'old_media.jpg',
    'image/jpeg',
    expiredIso
  )

  // 13-day-old generated media + DB row -> should stay
  const freshMediaFile = path.join(mediaDirectory, 'fresh_media.jpg')
  await writeFile(freshMediaFile, Buffer.from('fresh'))
  db.prepare('insert into workflow_media (token, user_id, filename, mime_type, created_at) values (?,?,?,?,?)').run(
    'b'.repeat(48),
    'clean-user',
    'fresh_media.jpg',
    'image/jpeg',
    freshIso
  )

  // Orphan files (no DB row): one 15d old -> deleted, one fresh -> kept
  const oldOrphanFile = path.join(mediaDirectory, 'old_orphan.mp4')
  await writeFile(oldOrphanFile, Buffer.from('orphan-old'))
  const oldDate = new Date(now - 15 * dayMs)
  await utimes(oldOrphanFile, oldDate, oldDate)

  const freshOrphanFile = path.join(mediaDirectory, 'fresh_orphan.mp4')
  await writeFile(freshOrphanFile, Buffer.from('orphan-fresh'))

  // AI history: 15d -> deleted, 13d -> kept
  db.prepare('insert into ai_history (id, user_id, type, model, prompt, result, created_at) values (?,?,?,?,?,?,?)').run(
    'ai-old',
    'clean-user',
    'prompt_builder',
    'm1',
    'old prompt',
    'old result',
    expiredIso
  )
  db.prepare('insert into ai_history (id, user_id, type, model, prompt, result, created_at) values (?,?,?,?,?,?,?)').run(
    'ai-fresh',
    'clean-user',
    'prompt_builder',
    'm1',
    'fresh prompt',
    'fresh result',
    freshIso
  )

  // Workflow runs: 15d -> deleted, 13d -> kept
  db.prepare('insert into workflow_runs (id, workflow_id, user_id, status, started_at, completed_at) values (?,?,?,?,?,?)').run(
    'run-old',
    'clean-wf',
    'clean-user',
    'success',
    expiredIso,
    expiredIso
  )
  db.prepare('insert into workflow_runs (id, workflow_id, user_id, status, started_at, completed_at) values (?,?,?,?,?,?)').run(
    'run-fresh',
    'clean-wf',
    'clean-user',
    'success',
    freshIso,
    freshIso
  )

  // Downloader history: 15d -> deleted, 13d -> kept
  db.prepare('insert into downloader_history (id, user_id, mode, platform, source_url, created_at) values (?,?,?,?,?,?)').run(
    'dl-old',
    'clean-user',
    'tiktok_video',
    'tiktok',
    'https://www.tiktok.com/@a/video/1',
    expiredIso
  )
  db.prepare('insert into downloader_history (id, user_id, mode, platform, source_url, created_at) values (?,?,?,?,?,?)').run(
    'dl-fresh',
    'clean-user',
    'tiktok_video',
    'tiktok',
    'https://www.tiktok.com/@a/video/2',
    freshIso
  )

  // Proxy tokens: expired -> deleted, active -> kept
  db.prepare('insert into downloader_proxy_tokens (token, user_id, url, filename, mime_type, platform, expires_at) values (?,?,?,?,?,?,?)').run(
    'tok-old',
    'clean-user',
    'https://cdn.example.com/1.mp4',
    '1.mp4',
    'video/mp4',
    'tiktok',
    now - 1000
  )
  db.prepare('insert into downloader_proxy_tokens (token, user_id, url, filename, mime_type, platform, expires_at) values (?,?,?,?,?,?,?)').run(
    'tok-fresh',
    'clean-user',
    'https://cdn.example.com/2.mp4',
    '2.mp4',
    'video/mp4',
    'tiktok',
    now + 60_000
  )

  // Usage logs must NOT be purged
  db.prepare('insert into ai_usage_logs (id, user_id, model, type, created_at) values (?,?,?,?,?)').run(
    'usage-old',
    'clean-user',
    'm1',
    'prompt_builder',
    expiredIso
  )

  const summary = await cleanupExpiredGeneratedFiles({ now, mediaDir: mediaDirectory })

  assert.equal(summary.deletedMediaFiles, 1)
  assert.equal(summary.deletedMediaRows, 1)
  assert.equal(summary.deletedOrphanFiles, 1)
  assert.equal(summary.deletedAiHistory, 1)
  assert.equal(summary.deletedWorkflowRuns, 1)
  assert.equal(summary.deletedDownloaderHistory, 1)
  assert.equal(summary.deletedProxyTokens, 1)

  assert.equal(existsSync(oldMediaFile), false)
  assert.equal(existsSync(oldOrphanFile), false)
  assert.equal(existsSync(freshMediaFile), true)
  assert.equal(existsSync(freshOrphanFile), true)

  assert.deepEqual(
    db.prepare('select token from workflow_media').all().map((r) => r.token),
    ['b'.repeat(48)]
  )
  assert.deepEqual(
    db.prepare('select id from ai_history').all().map((r) => r.id),
    ['ai-fresh']
  )
  assert.deepEqual(
    db.prepare('select id from workflow_runs').all().map((r) => r.id),
    ['run-fresh']
  )
  assert.deepEqual(
    db.prepare('select id from downloader_history').all().map((r) => r.id),
    ['dl-fresh']
  )
  assert.deepEqual(
    db.prepare('select token from downloader_proxy_tokens').all().map((r) => r.token),
    ['tok-fresh']
  )
  assert.equal(db.prepare('select count(*) as cnt from ai_usage_logs').get().cnt, 1)
})
