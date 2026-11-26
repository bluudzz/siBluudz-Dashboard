import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { db } from '../db.js'
import { requireAdmin, requireSameOrigin, requireUser } from '../middleware/auth.js'
import {
  isAllowedMediaProxyHost,
  normalizeAndValidateUrl,
} from '../../shared/downloader.js'
import {
  canEncryptDownloaderCookies,
  createProxyTokenStore,
  detectDownloaderBinaries,
  DownloaderHttpError,
  extractInstagramMedia,
  extractTikTokMedia,
  fetchAllowedUpstream,
  getStoredDownloaderCookies,
  saveStoredDownloaderCookies,
} from '../downloader-service.js'

const RATE_WINDOW_MS = 60 * 1000
const RATE_MAX_REQUESTS = 25

export function createDownloaderRouter(deps = {}) {
  const router = Router()
  const proxyStore = deps.proxyStore || createProxyTokenStore()
  const rateBuckets = new Map()

  const checkRateLimit = (userId) => {
    const now = Date.now()
    const recent = (rateBuckets.get(userId) || []).filter((ts) => now - ts < RATE_WINDOW_MS)
    if (recent.length >= RATE_MAX_REQUESTS) {
      return false
    }
    recent.push(now)
    rateBuckets.set(userId, recent)
    return true
  }

  router.get('/status', requireUser, async (req, res) => {
    const binaries = deps.detectBinaries
      ? await deps.detectBinaries()
      : await detectDownloaderBinaries()
    const igCookies = getStoredDownloaderCookies('instagram')
    const ttCookies = getStoredDownloaderCookies('tiktok')

    res.json({
      ytDlpAvailable: Boolean(binaries.ytDlpAvailable),
      ffmpegAvailable: Boolean(binaries.ffmpegAvailable),
      hasInstagramCookies: Boolean(igCookies.configured),
      hasTiktokCookies: Boolean(ttCookies.configured),
      canManageCookies: req.user.role === 'admin',
      cookieEncryptionReady: canEncryptDownloaderCookies(),
    })
  })

  router.put('/cookies', requireSameOrigin, requireAdmin, (req, res) => {
    try {
      const { instagramCookies, tiktokCookies } = req.body || {}
      if (instagramCookies !== undefined && typeof instagramCookies !== 'string') {
        return res.status(400).json({ error: 'Format cookie Instagram harus berupa teks.' })
      }
      if (tiktokCookies !== undefined && typeof tiktokCookies !== 'string') {
        return res.status(400).json({ error: 'Format cookie TikTok harus berupa teks.' })
      }

      if (instagramCookies !== undefined) {
        saveStoredDownloaderCookies('instagram', instagramCookies)
      }
      if (tiktokCookies !== undefined) {
        saveStoredDownloaderCookies('tiktok', tiktokCookies)
      }

      const ig = getStoredDownloaderCookies('instagram')
      const tt = getStoredDownloaderCookies('tiktok')
      res.json({
        hasInstagramCookies: Boolean(ig.configured),
        hasTiktokCookies: Boolean(tt.configured),
      })
    } catch (error) {
      const status = error instanceof DownloaderHttpError ? error.status : 400
      res.status(status).json({ error: error.message || 'Gagal menyimpan cookie sesi.' })
    }
  })

  router.post('/extract', requireSameOrigin, requireUser, async (req, res) => {
    if (!checkRateLimit(req.user.id)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan ekstraksi. Tunggu 1 menit lalu coba lagi.' })
    }

    const { url: rawUrl, mode = 'tiktok_video' } = req.body || {}
    let validated
    try {
      validated = normalizeAndValidateUrl(rawUrl, mode)
    } catch (error) {
      return res.status(400).json({ error: error.message })
    }

    try {
      const binaries = deps.detectBinaries
        ? await deps.detectBinaries()
        : await detectDownloaderBinaries()

      let extracted
      if (validated.platform === 'tiktok') {
        const ttCookies = getStoredDownloaderCookies('tiktok')
        extracted = deps.extractTikTok
          ? await deps.extractTikTok(validated.url, validated.detectedMode, ttCookies)
          : await extractTikTokMedia(validated.url, validated.detectedMode, ttCookies, { binaries })
      } else {
        const igCookies = getStoredDownloaderCookies('instagram')
        extracted = deps.extractInstagram
          ? await deps.extractInstagram(validated.url, validated.detectedMode, igCookies)
          : await extractInstagramMedia(validated.url, validated.detectedMode, igCookies, { binaries })
      }

      const safeItems = (extracted.items || [])
        .filter((item) => {
          try {
            return item?.url && isAllowedMediaProxyHost(new URL(item.url).hostname)
          } catch {
            return false
          }
        })
        .map((item) => {
          const mediaToken = proxyStore.register({
            userId: req.user.id,
            url: item.url,
            filename: item.filename || `media.${item.ext || 'mp4'}`,
            mimeType: item.mimeType || 'application/octet-stream',
            platform: extracted.platform,
          })

          let thumbUrl = ''
          if (item.thumbUrl) {
            try {
              if (isAllowedMediaProxyHost(new URL(item.thumbUrl).hostname)) {
                const thumbToken = proxyStore.register({
                  userId: req.user.id,
                  url: item.thumbUrl,
                  filename: `thumb_${item.id || 'media'}.jpg`,
                  mimeType: 'image/jpeg',
                  platform: extracted.platform,
                })
                thumbUrl = `/api/downloader/proxy/${thumbToken}`
              }
            } catch {
              thumbUrl = ''
            }
          }

          return {
            id: item.id,
            kind: item.kind,
            label: item.label,
            ext: item.ext,
            mimeType: item.mimeType,
            width: item.width,
            height: item.height,
            filename: item.filename,
            previewUrl: `/api/downloader/proxy/${mediaToken}`,
            downloadUrl: `/api/downloader/proxy/${mediaToken}?download=1`,
            thumbUrl,
          }
        })

      if (safeItems.length === 0) {
        return res.status(422).json({ error: 'Tidak ada file media dari host yang diizinkan.' })
      }

      const resolvedMode = extracted.resolvedMode || validated.detectedMode
      try {
        db.prepare(`
          insert into downloader_history (id, user_id, mode, platform, source_url, title, author, item_count)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          req.user.id,
          resolvedMode,
          extracted.platform,
          validated.url,
          String(extracted.title || '').slice(0, 160),
          String(extracted.author || '').slice(0, 80),
          safeItems.length
        )
      } catch (dbErr) {
        console.warn('Downloader history log skipped:', dbErr?.message)
      }

      res.json({
        platform: extracted.platform,
        mode,
        resolvedMode,
        title: extracted.title || 'Media',
        author: extracted.author || '',
        sourceUrl: validated.url,
        items: safeItems,
      })
    } catch (error) {
      const status = error instanceof DownloaderHttpError ? error.status : 500
      res.status(status).json({
        error: error?.message || 'Gagal mengambil media dari tautan tersebut.',
      })
    }
  })

  router.get('/proxy/:token', requireUser, async (req, res) => {
    const entry = proxyStore.get(req.params.token, req.user.id)
    if (!entry) {
      return res.status(404).json({ error: 'Tautan media kedaluwarsa atau tidak ditemukan. Ambil ulang tautan.' })
    }

    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Referer: entry.platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.instagram.com/',
    }
    if (req.headers.range) {
      headers.Range = req.headers.range
    }

    try {
      const upstream = await fetchAllowedUpstream(entry.url, headers, deps.fetchImpl)
      if (!upstream.ok && upstream.status !== 206) {
        return res.status(502).json({ error: `Server CDN menolak permintaan (${upstream.status}).` })
      }

      const contentType = upstream.headers.get('content-type') || entry.mimeType || 'application/octet-stream'
      res.status(upstream.status)
      res.setHeader('Content-Type', contentType)
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.setHeader('Cache-Control', 'private, max-age=600')

      const length = upstream.headers.get('content-length')
      if (length) res.setHeader('Content-Length', length)
      const acceptRanges = upstream.headers.get('accept-ranges')
      if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges)
      const contentRange = upstream.headers.get('content-range')
      if (contentRange) res.setHeader('Content-Range', contentRange)

      if (req.query.download === '1') {
        const cleanName = String(entry.filename || 'media.bin').replace(/["\r\n]/g, '')
        res.setHeader('Content-Disposition', `attachment; filename="${cleanName}"`)
      }

      if (!upstream.body) {
        return res.end()
      }
      Readable.fromWeb(upstream.body).pipe(res)
    } catch (error) {
      const status = error instanceof DownloaderHttpError ? error.status : 502
      if (!res.headersSent) {
        res.status(status).json({ error: error?.message || 'Gagal mengunduh stream media.' })
      }
    }
  })

  router.get('/history', requireUser, (req, res) => {
    const items = db
      .prepare(`
        select id, mode, platform, source_url as sourceUrl, title, author, item_count as itemCount, created_at as createdAt
        from downloader_history
        where user_id = ?
        order by datetime(created_at) desc, rowid desc
        limit 30
      `)
      .all(req.user.id)
    res.json({ items })
  })

  router.delete('/history/:id', requireSameOrigin, requireUser, (req, res) => {
    db.prepare('delete from downloader_history where id = ? and user_id = ?').run(req.params.id, req.user.id)
    res.json({ ok: true })
  })

  router.delete('/history', requireSameOrigin, requireUser, (req, res) => {
    db.prepare('delete from downloader_history where user_id = ?').run(req.user.id)
    res.json({ ok: true })
  })

  return router
}

export default createDownloaderRouter()
