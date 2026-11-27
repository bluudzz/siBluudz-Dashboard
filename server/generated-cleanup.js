import { readdir, stat, unlink } from 'node:fs/promises'
import path from 'node:path'
import { db } from './db.js'
import { mediaDirectory } from './workflow-media.js'

export const GENERATED_RETENTION_DAYS = 14
export const GENERATED_RETENTION_MS = GENERATED_RETENTION_DAYS * 24 * 60 * 60 * 1000
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

let cleanupTimer = null

function formatSqliteUtc(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

export async function cleanupExpiredGeneratedFiles({
  now = Date.now(),
  retentionDays = GENERATED_RETENTION_DAYS,
  dbInstance = db,
  mediaDir = mediaDirectory,
} = {}) {
  const cutoffMs = now - retentionDays * 24 * 60 * 60 * 1000
  const cutoffIso = formatSqliteUtc(cutoffMs)

  const expiredMedia = dbInstance
    .prepare('select token, filename from workflow_media where created_at < ?')
    .all(cutoffIso)

  const deleteMediaStmt = dbInstance.prepare('delete from workflow_media where token = ?')
  let deletedMediaFiles = 0
  let deletedMediaRows = 0

  for (const row of expiredMedia) {
    if (row.filename && path.basename(row.filename) === row.filename) {
      try {
        await unlink(path.join(mediaDir, row.filename))
        deletedMediaFiles += 1
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
    deletedMediaRows += deleteMediaStmt.run(row.token).changes
  }

  let deletedOrphanFiles = 0
  try {
    const entries = await readdir(mediaDir, { withFileTypes: true })
    const activeFiles = new Set(
      dbInstance
        .prepare('select filename from workflow_media')
        .all()
        .map((row) => row.filename)
    )

    for (const entry of entries) {
      if (!entry.isFile() || activeFiles.has(entry.name)) continue
      const fullPath = path.join(mediaDir, entry.name)
      try {
        const info = await stat(fullPath)
        if (info.mtimeMs < cutoffMs) {
          await unlink(fullPath)
          deletedOrphanFiles += 1
        }
      } catch (err) {
        if (err?.code !== 'ENOENT') throw err
      }
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err
  }

  const deletedAiHistory = dbInstance
    .prepare('delete from ai_history where created_at < ?')
    .run(cutoffIso).changes
  const deletedWorkflowRuns = dbInstance
    .prepare('delete from workflow_runs where coalesce(completed_at, started_at) < ?')
    .run(cutoffIso).changes
  const deletedDownloaderHistory = dbInstance
    .prepare('delete from downloader_history where created_at < ?')
    .run(cutoffIso).changes
  const deletedProxyTokens = dbInstance
    .prepare('delete from downloader_proxy_tokens where expires_at <= ?')
    .run(now).changes

  return {
    cutoff: cutoffIso,
    deletedMediaFiles,
    deletedMediaRows,
    deletedOrphanFiles,
    deletedAiHistory,
    deletedWorkflowRuns,
    deletedDownloaderHistory,
    deletedProxyTokens,
  }
}

export function startGeneratedFilesCleanup({
  intervalMs = CLEANUP_INTERVAL_MS,
  retentionDays = GENERATED_RETENTION_DAYS,
} = {}) {
  if (process.env.NODE_ENV === 'test' || cleanupTimer) return cleanupTimer

  const run = async () => {
    try {
      const summary = await cleanupExpiredGeneratedFiles({ retentionDays })
      const total =
        summary.deletedMediaFiles +
        summary.deletedMediaRows +
        summary.deletedOrphanFiles +
        summary.deletedAiHistory +
        summary.deletedWorkflowRuns +
        summary.deletedDownloaderHistory +
        summary.deletedProxyTokens
      if (total > 0) {
        console.log('[cleanup] Purged expired generated data (>14d):', summary)
      }
    } catch (err) {
      console.error('Generated files cleanup failed:', err)
    }
  }

  void run()
  cleanupTimer = setInterval(() => {
    void run()
  }, intervalMs)
  cleanupTimer.unref?.()
  return cleanupTimer
}
