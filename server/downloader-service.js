import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, unlink } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { getSetting, setSetting } from './db.js'
import { encryptSocialToken, decryptSocialToken } from './utils/social-crypto.js'
import {
  isAllowedMediaProxyHost,
  normalizeCookieInput,
  sanitizeDownloadFilename,
  shortcodeToInstagramMediaId,
} from '../shared/downloader.js'

const execFileAsync = promisify(execFile)

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const IG_MOBILE_UA =
  'Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2400; samsung; SM-G991B; o1s; exynos2100; en_US; 458229258)'
const IG_APP_ID = '936619743392459'
const IG_ANON_LSD = 'AVqbxe3J_YA'
const IG_ANON_POST_DOC_ID = '27130156389949648'
const IG_ANON_POST_FRIENDLY_NAME = 'PolarisLoggedOutDesktopWWWPostRootContentQuery'
const PROXY_TTL_MS = 30 * 60 * 1000
const MAX_PROXY_ENTRIES = 600
const MAX_PROXY_BYTES = 150 * 1024 * 1024

export const IG_COOKIE_SETTING_KEY = 'downloader_ig_cookies'
export const TT_COOKIE_SETTING_KEY = 'downloader_tt_cookies'

let cachedBinaryCheck = { checkedAt: 0, value: null }

export class DownloaderHttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function canEncryptDownloaderCookies() {
  const encoded = process.env.SOCIAL_CREDENTIALS_KEY || process.env.MAIL_CREDENTIALS_KEY
  if (!encoded) return false
  try {
    return Buffer.from(encoded, 'base64').length === 32
  } catch {
    return false
  }
}

async function resolveExecutable(candidates, versionArg = '--version') {
  for (const bin of candidates) {
    try {
      const { stdout } = await execFileAsync(bin, [versionArg], { timeout: 10_000 })
      const firstLine = String(stdout || '').trim().split(/\r?\n/)[0] || ''
      return { available: true, bin, version: firstLine }
    } catch {
      // try next candidate
    }
  }
  return { available: false, bin: '', version: '' }
}

export async function detectDownloaderBinaries({ force = false } = {}) {
  const now = Date.now()
  const ttlMs = cachedBinaryCheck.value?.ytDlpAvailable ? 60_000 : 5_000
  if (!force && cachedBinaryCheck.value && now - cachedBinaryCheck.checkedAt < ttlMs) {
    return cachedBinaryCheck.value
  }

  const ytCandidates = [
    'yt-dlp',
    'yt-dlp.exe',
    '/usr/local/bin/yt-dlp',
    path.join(homedir(), '.local', 'bin', 'yt-dlp'),
    path.join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe'),
    path.join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe'),
    path.join(homedir(), 'AppData', 'Local', 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe'),
  ]
  const ffmpegCandidates = ['ffmpeg', 'ffmpeg.exe', '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg']

  const [yt, ff] = await Promise.all([
    resolveExecutable(ytCandidates, '--version'),
    resolveExecutable(ffmpegCandidates, '-version'),
  ])

  const value = {
    ytDlpAvailable: yt.available,
    ytDlpBin: yt.bin,
    ytDlpVersion: yt.version,
    ffmpegAvailable: ff.available,
    ffmpegBin: ff.bin,
  }
  cachedBinaryCheck = { checkedAt: now, value }
  return value
}

export function getStoredDownloaderCookies(platform) {
  const key = platform === 'tiktok' ? TT_COOKIE_SETTING_KEY : IG_COOKIE_SETTING_KEY
  const encrypted = getSetting(key, '')
  if (!encrypted) return { netscape: '', header: '', configured: false }
  try {
    const raw = decryptSocialToken(encrypted)
    const normalized = normalizeCookieInput(raw, platform)
    return {
      ...normalized,
      configured: Boolean(normalized.netscape || normalized.header),
    }
  } catch {
    return { netscape: '', header: '', configured: false }
  }
}

export function saveStoredDownloaderCookies(platform, rawInput) {
  const key = platform === 'tiktok' ? TT_COOKIE_SETTING_KEY : IG_COOKIE_SETTING_KEY
  const trimmed = String(rawInput || '').trim()
  if (!trimmed) {
    setSetting(key, '')
    return { configured: false }
  }
  if (!canEncryptDownloaderCookies()) {
    throw new DownloaderHttpError(
      500,
      'MAIL_CREDENTIALS_KEY / SOCIAL_CREDENTIALS_KEY belum dikonfigurasi di server.'
    )
  }
  const normalized = normalizeCookieInput(trimmed, platform)
  setSetting(key, encryptSocialToken(normalized.netscape))
  return { configured: Boolean(normalized.netscape) }
}

export async function withTempCookieFile(netscapeText, fn) {
  if (!netscapeText) {
    return fn(null)
  }
  const filePath = path.join(tmpdir(), `dl-cookie-${randomUUID()}.txt`)
  await writeFile(filePath, netscapeText, { encoding: 'utf8', mode: 0o600 })
  try {
    return await fn(filePath)
  } finally {
    await unlink(filePath).catch(() => {})
  }
}

function resolveTikWmUrl(candidate) {
  const raw = String(candidate || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `https://www.tikwm.com${raw}`
  return raw
}

function normalizeCandidateExt(ext, kind) {
  const clean = String(ext || '').trim().toLowerCase()
  if (clean) return clean === 'jpeg' ? 'jpg' : clean
  if (kind === 'image') return 'jpg'
  if (kind === 'audio') return 'mp3'
  return 'mp4'
}

function mimeForKind(kind, ext) {
  if (kind === 'image') {
    if (ext === 'webp') return 'image/webp'
    if (ext === 'png') return 'image/png'
    return 'image/jpeg'
  }
  if (kind === 'audio') {
    if (ext === 'm4a') return 'audio/mp4'
    return 'audio/mpeg'
  }
  return 'video/mp4'
}

function buildTitleSnippet(text, fallback = 'media') {
  const firstLine = String(text || '').trim().split(/\r?\n/)[0] || ''
  return (firstLine || fallback).slice(0, 120)
}

async function runYtDlpJson(url, netscapeCookies, binaries, fetchTimeoutMs = 30_000) {
  const binInfo = binaries || (await detectDownloaderBinaries())
  if (!binInfo.ytDlpAvailable || !binInfo.ytDlpBin) {
    throw new DownloaderHttpError(503, 'Engine yt-dlp belum terpasang di server.')
  }

  return withTempCookieFile(netscapeCookies, async (cookieFile) => {
    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-call-home',
    ]
    if (cookieFile) {
      args.push('--cookies', cookieFile)
    }
    args.push(url)

    try {
      const { stdout } = await execFileAsync(binInfo.ytDlpBin, args, {
        timeout: fetchTimeoutMs,
        maxBuffer: 12 * 1024 * 1024,
      })
      return JSON.parse(stdout)
    } catch (error) {
      const stderr = String(error?.stderr || error?.message || '').toLowerCase()
      if (stderr.includes('there is no video in this post') || stderr.includes('no video')) {
        throw new DownloaderHttpError(
          422,
          'Postingan ini hanya berisi foto (bukan video). Gunakan mode Instagram Foto atau pastikan Cookie Sesi IG aktif.'
        )
      }
      if (stderr.includes('no stories') || (stderr.includes('story') && stderr.includes('not found'))) {
        throw new DownloaderHttpError(
          404,
          'Story tidak ditemukan atau sudah kedaluwarsa (lebih dari 24 jam).'
        )
      }
      if (stderr.includes('checkpoint') || stderr.includes('challenge')) {
        throw new DownloaderHttpError(
          422,
          'Akun sesi Instagram terkena verifikasi/checkpoint. Buka Instagram dari akun cadangan lalu perbarui cookie sesi.'
        )
      }
      if (stderr.includes('login') || stderr.includes('cookie') || stderr.includes('sign in')) {
        throw new DownloaderHttpError(
          422,
          'Konten ini meminta login. Tambahkan Cookie Sesi Instagram / TikTok yang valid di pengaturan admin.'
        )
      }
      if (stderr.includes('rate-limit') || stderr.includes('429')) {
        throw new DownloaderHttpError(
          429,
          'Server sementara dibatasi oleh platform target. Coba lagi sebentar atau perbarui cookie sesi.'
        )
      }
      throw new DownloaderHttpError(
        422,
        'Gagal mengekstrak media dari tautan tersebut. Pastikan tautan valid dan akun tidak privat.'
      )
    }
  })
}

function pickBestYtDlpVideoFormat(entry) {
  const formats = Array.isArray(entry?.formats) ? entry.formats : []
  const mp4Combined = formats
    .filter((f) => f && f.url && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
    .sort((a, b) => (Number(b.height || 0) - Number(a.height || 0)) || (Number(b.tbr || 0) - Number(a.tbr || 0)))
  if (mp4Combined.length > 0) {
    return mp4Combined[0]
  }
  const direct = entry?.url ? { url: entry.url, ext: entry.ext || 'mp4', width: entry.width, height: entry.height } : null
  if (direct) return direct
  const fallbackVideo = formats
    .filter((f) => f && f.url && f.vcodec && f.vcodec !== 'none')
    .sort((a, b) => Number(b.height || 0) - Number(a.height || 0))
  return fallbackVideo[0] || null
}

function mapYtDlpPayload(payload, platform, fallbackTitle) {
  const entries = Array.isArray(payload?.entries) && payload.entries.length > 0 ? payload.entries : [payload]
  const title = buildTitleSnippet(payload?.title || payload?.description || entries[0]?.title, fallbackTitle)
  const author = String(
    payload?.uploader_id || payload?.uploader || payload?.channel || entries[0]?.uploader || ''
  ).replace(/^@+/, '')

  const items = []
  entries.forEach((entry, idx) => {
    if (!entry) return
    const best = pickBestYtDlpVideoFormat(entry)
    const thumb = entry.thumbnail || ''
    if (best?.url) {
      const ext = normalizeCandidateExt(best.ext, 'video')
      const isImage = ['jpg', 'jpeg', 'png', 'webp'].includes(ext)
      const kind = isImage ? 'image' : 'video'
      const label = entries.length > 1
        ? `${kind === 'image' ? 'Foto' : 'Video'} Slide ${idx + 1}`
        : kind === 'image'
          ? 'Foto Resolusi Penuh'
          : best.height
            ? `Video ${best.height}p MP4`
            : 'Video HD MP4'
      items.push({
        id: `item-${idx + 1}`,
        kind,
        label,
        url: best.url,
        thumbUrl: thumb || (kind === 'image' ? best.url : ''),
        ext,
        mimeType: mimeForKind(kind, ext),
        width: Number(best.width || entry.width || 0) || undefined,
        height: Number(best.height || entry.height || 0) || undefined,
        filename: sanitizeDownloadFilename(`${author || platform}_${title}_${idx + 1}`, ext),
      })
    } else if (thumb) {
      items.push({
        id: `item-${idx + 1}`,
        kind: 'image',
        label: entries.length > 1 ? `Foto Slide ${idx + 1}` : 'Foto Resolusi Penuh',
        url: thumb,
        thumbUrl: thumb,
        ext: 'jpg',
        mimeType: 'image/jpeg',
        filename: sanitizeDownloadFilename(`${author || platform}_${title}_${idx + 1}`, 'jpg'),
      })
    }
  })

  return { title, author, items }
}

export async function extractTikTokMedia(url, mode, cookies = { netscape: '', header: '' }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const binaries = deps.binaries

  // 1. Primary: TikWM API (supports No-Watermark HD Video, Photo Slideshows, Audio, & Public Stories)
  try {
    const body = new URLSearchParams({ url, hd: '1' }).toString()
    const response = await fetchImpl('https://www.tikwm.com/api/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': BROWSER_UA,
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (response.ok) {
      const json = await response.json().catch(() => null)
      const data = json?.data
      if (json?.code === 0 && data && typeof data === 'object') {
        const title = buildTitleSnippet(data.title, 'tiktok')
        const author = String(data.author?.unique_id || data.author?.nickname || '').replace(/^@+/, '')
        const cover = resolveTikWmUrl(data.cover || data.origin_cover)
        const items = []

        if (Array.isArray(data.images) && data.images.length > 0) {
          data.images.forEach((rawImgUrl, idx) => {
            const imgUrl = resolveTikWmUrl(rawImgUrl)
            if (!imgUrl) return
            items.push({
              id: `tt-slide-${idx + 1}`,
              kind: 'image',
              label: `Foto Slide ${idx + 1}`,
              url: imgUrl,
              thumbUrl: imgUrl,
              ext: 'jpg',
              mimeType: 'image/jpeg',
              filename: sanitizeDownloadFilename(`${author || 'tiktok'}_slide_${idx + 1}`, 'jpg'),
            })
          })
          const musicUrl = resolveTikWmUrl(data.music || data.music_info?.play)
          if (musicUrl) {
            items.push({
              id: 'tt-audio',
              kind: 'audio',
              label: 'Audio MP3',
              url: musicUrl,
              thumbUrl: cover,
              ext: 'mp3',
              mimeType: 'audio/mpeg',
              filename: sanitizeDownloadFilename(`${author || 'tiktok'}_audio`, 'mp3'),
            })
          }
          if (items.length > 0) {
            return {
              platform: 'tiktok',
              resolvedMode: mode === 'tiktok_story' ? 'tiktok_story' : 'tiktok_photo',
              title,
              author,
              items,
            }
          }
        }

        const hdUrl = resolveTikWmUrl(data.hdplay)
        const sdUrl = resolveTikWmUrl(data.play)
        const musicUrl = resolveTikWmUrl(data.music || data.music_info?.play)

        if (hdUrl) {
          items.push({
            id: 'tt-hd',
            kind: 'video',
            label: 'Video HD (Tanpa Watermark)',
            url: hdUrl,
            thumbUrl: cover,
            ext: 'mp4',
            mimeType: 'video/mp4',
            filename: sanitizeDownloadFilename(`${author || 'tiktok'}_hd`, 'mp4'),
          })
        }
        if (sdUrl && sdUrl !== hdUrl) {
          items.push({
            id: 'tt-sd',
            kind: 'video',
            label: hdUrl ? 'Video Standar (Tanpa Watermark)' : 'Video (Tanpa Watermark)',
            url: sdUrl,
            thumbUrl: cover,
            ext: 'mp4',
            mimeType: 'video/mp4',
            filename: sanitizeDownloadFilename(`${author || 'tiktok'}_video`, 'mp4'),
          })
        }
        if (musicUrl) {
          items.push({
            id: 'tt-audio',
            kind: 'audio',
            label: 'Audio MP3',
            url: musicUrl,
            thumbUrl: cover,
            ext: 'mp3',
            mimeType: 'audio/mpeg',
            filename: sanitizeDownloadFilename(`${author || 'tiktok'}_audio`, 'mp3'),
          })
        }

        if (items.length > 0) {
          return {
            platform: 'tiktok',
            resolvedMode: mode === 'tiktok_story' ? 'tiktok_story' : 'tiktok_video',
            title,
            author,
            items,
          }
        }
      }
    }
  } catch {
    // Fall back to yt-dlp
  }

  // 2. Fallback: yt-dlp
  const payload = deps.ytDlpRun
    ? await deps.ytDlpRun(url, cookies.netscape)
    : await runYtDlpJson(url, cookies.netscape, binaries)
  const mapped = mapYtDlpPayload(payload, 'tiktok', 'tiktok')
  if (mapped.items.length === 0) {
    throw new DownloaderHttpError(422, 'Media TikTok tidak ditemukan atau akun sedang privat.')
  }
  return {
    platform: 'tiktok',
    resolvedMode: mapped.items.some((i) => i.kind === 'image') ? 'tiktok_photo' : mode,
    ...mapped,
  }
}

function pickBestCandidate(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null
  return [...candidates].sort((a, b) => (Number(b.width || 0) * Number(b.height || 0)) - (Number(a.width || 0) * Number(a.height || 0)))[0]
}

function parseIgMediaNode(node, author, title, idx) {
  if (!node) return null
  const videoVer = Array.isArray(node.video_versions) ? node.video_versions[0] : null
  if (videoVer?.url || node.video_url) {
    const thumb = pickBestCandidate(node.image_versions2?.candidates)?.url || node.display_url || ''
    return {
      id: `ig-item-${idx + 1}`,
      kind: 'video',
      label: idx > 0 ? `Video Slide ${idx + 1}` : 'Video HD MP4',
      url: videoVer?.url || node.video_url,
      thumbUrl: thumb,
      ext: 'mp4',
      mimeType: 'video/mp4',
      width: Number(videoVer?.width || node.original_width || 0) || undefined,
      height: Number(videoVer?.height || node.original_height || 0) || undefined,
      filename: sanitizeDownloadFilename(`${author || 'instagram'}_${title}_${idx + 1}`, 'mp4'),
    }
  }
  const bestImg = pickBestCandidate(node.image_versions2?.candidates)
  const imgUrl = bestImg?.url || node.display_url || node.thumbnail_src
  if (imgUrl) {
    return {
      id: `ig-item-${idx + 1}`,
      kind: 'image',
      label: `Foto Slide ${idx + 1}`,
      url: imgUrl,
      thumbUrl: imgUrl,
      ext: 'jpg',
      mimeType: 'image/jpeg',
      width: Number(bestImg?.width || node.original_width || 0) || undefined,
      height: Number(bestImg?.height || node.original_height || 0) || undefined,
      filename: sanitizeDownloadFilename(`${author || 'instagram'}_${title}_${idx + 1}`, 'jpg'),
    }
  }
  return null
}

function extractItemsFromIgWebJson(json, fallbackAuthor = '') {
  const item = Array.isArray(json?.items) ? json.items[0] : json?.graphql?.shortcode_media
  if (!item) return null

  const author = String(
    item.user?.username || item.owner?.username || fallbackAuthor || ''
  ).replace(/^@+/, '')
  const captionText =
    item.caption?.text ||
    item.edge_media_to_caption?.edges?.[0]?.node?.text ||
    ''
  const title = buildTitleSnippet(captionText, author || 'instagram')

  const items = []
  if (Array.isArray(item.carousel_media) && item.carousel_media.length > 0) {
    item.carousel_media.forEach((child, idx) => {
      const parsed = parseIgMediaNode(child, author, title, idx)
      if (parsed) items.push(parsed)
    })
  } else if (Array.isArray(item.edge_sidecar_to_children?.edges) && item.edge_sidecar_to_children.edges.length > 0) {
    item.edge_sidecar_to_children.edges.forEach((edge, idx) => {
      const parsed = parseIgMediaNode(edge?.node, author, title, idx)
      if (parsed) items.push(parsed)
    })
  } else {
    const parsed = parseIgMediaNode(item, author, title, 0)
    if (parsed) {
      if (parsed.kind === 'image') parsed.label = 'Foto Resolusi Penuh'
      items.push(parsed)
    }
  }

  return items.length > 0 ? { title, author, items } : null
}

function parseIgEmbedHtml(html) {
  if (!html) return null
  // Look for window.__additionalDataLoaded or gql_data embedded JSON
  const match =
    html.match(/window\.__additionalDataLoaded\([^,]+,\s*(\{[\s\S]*?\})\);/) ||
    html.match(/"gql_data":\s*(\{"shortcode_media":[\s\S]*?\})\s*,\s*"/)
  if (match && match[1]) {
    try {
      const parsed = JSON.parse(match[1])
      const extracted = extractItemsFromIgWebJson(
        parsed.shortcode_media ? { graphql: parsed } : parsed
      )
      if (extracted) return extracted
    } catch {
      // continue to regex fallback
    }
  }

  const videoMatch = html.match(/<video[^>]+src="([^"]+)"/i) || html.match(/"video_url":"([^"]+)"/)
  const imageMatch = html.match(/class="EmbeddedMediaImage"[^>]+src="([^"]+)"/i)
  if (videoMatch?.[1]) {
    const cleanUrl = videoMatch[1].replace(/&amp;/g, '&').replace(/\\u0026/g, '&')
    return {
      title: 'Instagram Reel',
      author: 'instagram',
      items: [
        {
          id: 'ig-embed-video',
          kind: 'video',
          label: 'Video HD MP4',
          url: cleanUrl,
          thumbUrl: '',
          ext: 'mp4',
          mimeType: 'video/mp4',
          filename: sanitizeDownloadFilename('instagram_video', 'mp4'),
        },
      ],
    }
  }
  if (imageMatch?.[1]) {
    const cleanUrl = imageMatch[1].replace(/&amp;/g, '&')
    return {
      title: 'Instagram Foto',
      author: 'instagram',
      items: [
        {
          id: 'ig-embed-image',
          kind: 'image',
          label: 'Foto Resolusi Penuh',
          url: cleanUrl,
          thumbUrl: cleanUrl,
          ext: 'jpg',
          mimeType: 'image/jpeg',
          filename: sanitizeDownloadFilename('instagram_photo', 'jpg'),
        },
      ],
    }
  }
  return null
}

function findJsonKeyRecursive(root, targetKeys) {
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') continue
    if (Array.isArray(current)) {
      for (let i = current.length - 1; i >= 0; i -= 1) {
        stack.push(current[i])
      }
      continue
    }
    for (const key of targetKeys) {
      if (Object.prototype.hasOwnProperty.call(current, key) && current[key] !== undefined) {
        return { key, data: current[key] }
      }
    }
    for (const val of Object.values(current)) {
      if (val && typeof val === 'object') {
        stack.push(val)
      }
    }
  }
  return null
}

function extractIgSsrBlock(html, targetKeys) {
  if (!html) return null
  const scriptRegex = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    const body = match[1]
    if (!targetKeys.some((key) => body.includes(key))) continue
    try {
      const parsed = JSON.parse(body)
      const hit = findJsonKeyRecursive(parsed, targetKeys)
      if (hit) return hit
    } catch {
      // Ignore unparseable script blocks and continue scanning
    }
  }
  return null
}

function buildIgPageHeaders(cookieHeader) {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Dest': 'document',
    ...(cookieHeader ? { Cookie: cookieHeader } : {}),
  }
}

function extractSetCookieValue(headers, cookieName) {
  const list = typeof headers?.getSetCookie === 'function' ? headers.getSetCookie() : []
  const prefix = `${cookieName}=`
  for (const item of list) {
    const pair = String(item || '').split(';')[0].trim()
    if (pair.startsWith(prefix)) {
      return pair.slice(prefix.length)
    }
  }
  const rawHeader = headers?.get?.('set-cookie') || ''
  const match = rawHeader.match(new RegExp(`(?:^|,\\s*)${cookieName}=([^;,\\s]+)`))
  return match?.[1] || ''
}

async function extractInstagramAnonymousGraphql(shortcode, fetchImpl) {
  const mediaId = shortcodeToInstagramMediaId(shortcode)
  if (!mediaId) return null

  const commonHeaders = {
    'User-Agent': BROWSER_UA,
    'X-IG-App-ID': IG_APP_ID,
    'X-ASBD-ID': '129477',
    'X-IG-WWW-Claim': '0',
    Origin: 'https://www.instagram.com',
    Referer: `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`,
    'Sec-Fetch-Site': 'same-origin',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
    Accept: '*/*',
  }

  try {
    const rulingRes = await fetchImpl(
      `https://www.instagram.com/api/v1/web/get_ruling_for_content/?content_type=MEDIA&target_id=${encodeURIComponent(mediaId)}`,
      {
        headers: commonHeaders,
        signal: AbortSignal.timeout(12_000),
      }
    )
    const csrf = extractSetCookieValue(rulingRes.headers, 'csrftoken')

    const body = new URLSearchParams({
      lsd: IG_ANON_LSD,
      fb_api_caller_class: 'RelayModern',
      fb_api_req_friendly_name: IG_ANON_POST_FRIENDLY_NAME,
      server_timestamps: 'true',
      variables: JSON.stringify({ media_id: mediaId }),
      doc_id: IG_ANON_POST_DOC_ID,
    }).toString()

    const gqlRes = await fetchImpl('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        ...commonHeaders,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-FB-Friendly-Name': IG_ANON_POST_FRIENDLY_NAME,
        'X-CSRFToken': csrf,
        'X-FB-LSD': IG_ANON_LSD,
        'X-Requested-With': 'XMLHttpRequest',
        ...(csrf ? { Cookie: `csrftoken=${csrf}` } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    })

    if (!gqlRes.ok) return null
    const json = await gqlRes.json().catch(() => null)
    const info = json?.data?.xig_polaris_media?.if_not_gated_logged_out
    if (!info || typeof info !== 'object') return null

    return extractItemsFromIgWebJson({ items: [info] })
  } catch {
    return null
  }
}

export async function extractInstagramMedia(url, mode, cookies = { netscape: '', header: '' }, deps = {}) {
  const fetchImpl = deps.fetchImpl || fetch
  const binaries = deps.binaries
  const parsedUrl = new URL(url)
  const pathname = parsedUrl.pathname

  // Case 1: Instagram Story (`/stories/<username>/<storyId?>/` or `/stories/highlights/<highlightId>/`)
  const storyMatch = pathname.match(/^\/stories\/([a-zA-Z0-9._]+)(?:\/(\d+))?/i)
  if (storyMatch || mode === 'instagram_story') {
    if (!cookies.header && !cookies.netscape) {
      throw new DownloaderHttpError(
        422,
        'Instagram Story memerlukan Cookie Sesi Instagram. Minta admin menambahkan cookie akun Instagram lewat tombol Sesi IG.'
      )
    }

    const username = storyMatch?.[1]
    const targetStoryId = storyMatch?.[2]
    const isHighlight = username?.toLowerCase() === 'highlights'

    // Strategy 1A: Authenticated SSR Relay JSON directly from instagram.com/stories/<username>/
    if (username && cookies.header) {
      try {
        const storyPageUrl = isHighlight
          ? url
          : `https://www.instagram.com/stories/${encodeURIComponent(username)}/`
        const pageRes = await fetchImpl(storyPageUrl, {
          headers: buildIgPageHeaders(cookies.header),
          signal: AbortSignal.timeout(15_000),
        })
        if (pageRes.url && pageRes.url.includes('/accounts/login')) {
          throw new DownloaderHttpError(
            422,
            'Cookie sesi Instagram sudah kedaluwarsa atau tidak valid. Perbarui Cookie Sesi IG di pengaturan admin.'
          )
        }
        if (pageRes.ok) {
          const html = await pageRes.text()
          const ssrBlock = extractIgSsrBlock(html, ['xdt_api__v1__feed__reels_media'])
          if (ssrBlock) {
            const reel = Array.isArray(ssrBlock.data?.reels_media)
              ? ssrBlock.data.reels_media[0]
              : null
            const rawItems = Array.isArray(reel?.items) ? reel.items : []
            if (rawItems.length === 0) {
              throw new DownloaderHttpError(
                404,
                isHighlight
                  ? 'IG Story Highlight tidak ditemukan atau akun sedang privat.'
                  : `Akun @${username} tidak memiliki IG Story aktif saat ini.`
              )
            }
            const resolvedAuthor = String(reel?.user?.username || (isHighlight ? 'highlight' : username)).replace(/^@+/, '')
            const ordered = [...rawItems]
            if (targetStoryId && !isHighlight) {
              ordered.sort((a, b) => {
                const aHit = String(a?.pk || a?.id || '').startsWith(targetStoryId) ? 0 : 1
                const bHit = String(b?.pk || b?.id || '').startsWith(targetStoryId) ? 0 : 1
                return aHit - bHit
              })
            }
            const items = ordered
              .map((node, idx) => {
                const parsed = parseIgMediaNode(node, resolvedAuthor, 'story', idx)
                if (!parsed) return null
                const isExact = !isHighlight && targetStoryId && String(node?.pk || node?.id || '').startsWith(targetStoryId)
                parsed.label = isExact
                  ? `Story Pilihan (${parsed.kind === 'video' ? 'Video' : 'Foto'})`
                  : `Story ${idx + 1} (${parsed.kind === 'video' ? 'Video' : 'Foto'})`
                return parsed
              })
              .filter(Boolean)

            if (items.length > 0) {
              return {
                platform: 'instagram',
                resolvedMode: 'instagram_story',
                title: isHighlight ? `Highlight @${resolvedAuthor}` : `Story @${resolvedAuthor}`,
                author: resolvedAuthor,
                items,
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof DownloaderHttpError) throw err
        // Fall through to mobile API / yt-dlp fallback
      }
    }

    // Strategy 1B: Legacy web_profile_info + reels_media fallback
    if (username && !isHighlight && cookies.header) {
      try {
        const profileRes = await fetchImpl(
          `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
          {
            headers: {
              'User-Agent': BROWSER_UA,
              'x-ig-app-id': IG_APP_ID,
              Cookie: cookies.header,
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(15_000),
          }
        )
        if (profileRes.ok) {
          const profileJson = await profileRes.json().catch(() => null)
          const userId = profileJson?.data?.user?.id
          if (userId) {
            const reelsRes = await fetchImpl(
              `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(userId)}`,
              {
                headers: {
                  'User-Agent': IG_MOBILE_UA,
                  'x-ig-app-id': IG_APP_ID,
                  Cookie: cookies.header,
                  Accept: 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
              }
            )
            if (reelsRes.ok) {
              const reelsJson = await reelsRes.json().catch(() => null)
              const rawItems =
                reelsJson?.reels_media?.[0]?.items ||
                reelsJson?.reels?.[String(userId)]?.items ||
                []
              if (Array.isArray(rawItems) && rawItems.length > 0) {
                const ordered = [...rawItems]
                if (targetStoryId) {
                  ordered.sort((a, b) => {
                    const aHit = String(a?.pk || a?.id || '').startsWith(targetStoryId) ? 0 : 1
                    const bHit = String(b?.pk || b?.id || '').startsWith(targetStoryId) ? 0 : 1
                    return aHit - bHit
                  })
                }
                const items = ordered
                  .map((node, idx) => {
                    const parsed = parseIgMediaNode(node, username, 'story', idx)
                    if (!parsed) return null
                    const isExact = targetStoryId && String(node?.pk || node?.id || '').startsWith(targetStoryId)
                    parsed.label = isExact
                      ? `Story Pilihan (${parsed.kind === 'video' ? 'Video' : 'Foto'})`
                      : `Story ${idx + 1} (${parsed.kind === 'video' ? 'Video' : 'Foto'})`
                    return parsed
                  })
                  .filter(Boolean)

                if (items.length > 0) {
                  return {
                    platform: 'instagram',
                    resolvedMode: 'instagram_story',
                    title: `Story @${username}`,
                    author: username,
                    items,
                  }
                }
              } else if (profileRes.ok) {
                throw new DownloaderHttpError(404, `Akun @${username} tidak memiliki IG Story aktif saat ini.`)
              }
            }
          }
        }
      } catch (err) {
        if (err instanceof DownloaderHttpError) throw err
        // Fall through to yt-dlp fallback
      }
    }

    const payload = deps.ytDlpRun
      ? await deps.ytDlpRun(url, cookies.netscape)
      : await runYtDlpJson(url, cookies.netscape, binaries)
    const mapped = mapYtDlpPayload(payload, 'instagram', `Story ${username || ''}`.trim())
    if (mapped.items.length === 0) {
      throw new DownloaderHttpError(422, 'IG Story tidak ditemukan atau cookie sesi Instagram perlu diperbarui.')
    }
    return {
      platform: 'instagram',
      resolvedMode: 'instagram_story',
      ...mapped,
    }
  }

  // Case 2: Post / Reel / Carousel (`/p/<shortcode>/`, `/reel/<shortcode>/`, `/reels/<shortcode>/`, `/tv/<shortcode>/`)
  const codeMatch = pathname.match(/^\/(?:p|reel|reels|tv)\/([a-zA-Z0-9_-]+)/i)
  const shortcode = codeMatch?.[1]

  // Strategy 2A: Anonymous GraphQL (csrftoken bootstrap + persisted doc_id, NO login cookies needed for public Posts/Reels/Carousels)
  if (shortcode) {
    const anonExtracted = await extractInstagramAnonymousGraphql(shortcode, fetchImpl)
    if (anonExtracted) {
      const hasVideoOnly = anonExtracted.items.every((i) => i.kind === 'video')
      return {
        platform: 'instagram',
        resolvedMode: hasVideoOnly ? 'instagram_reel' : 'instagram_photo',
        ...anonExtracted,
      }
    }
  }

  // Strategy 2B: Authenticated SSR Relay JSON directly from post/reel page HTML (for gated/followed posts)
  if (shortcode && cookies.header) {
    try {
      const pageRes = await fetchImpl(url, {
        headers: buildIgPageHeaders(cookies.header),
        signal: AbortSignal.timeout(15_000),
      })
      if (pageRes.ok && (!pageRes.url || !pageRes.url.includes('/accounts/login'))) {
        const html = await pageRes.text()
        const ssrBlock = extractIgSsrBlock(html, [
          'xdt_api__v1__media__shortcode__web_info',
          'xdt_shortcode_media',
        ])
        if (ssrBlock) {
          const jsonPayload =
            ssrBlock.key === 'xdt_shortcode_media'
              ? { graphql: { shortcode_media: ssrBlock.data } }
              : ssrBlock.data
          const extracted = extractItemsFromIgWebJson(jsonPayload)
          if (extracted) {
            const hasVideoOnly = extracted.items.every((i) => i.kind === 'video')
            return {
              platform: 'instagram',
              resolvedMode: hasVideoOnly ? 'instagram_reel' : 'instagram_photo',
              ...extracted,
            }
          }
        }
      }
    } catch {
      // continue to __a=1 / embed / yt-dlp fallback
    }
  }

  // Strategy B: Web JSON (with cookies if available) — fallback for Carousels & Photos
  if (shortcode && cookies.header) {
    try {
      const res = await fetchImpl(
        `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/?__a=1&__d=dis`,
        {
          headers: {
            'User-Agent': BROWSER_UA,
            'x-ig-app-id': IG_APP_ID,
            Cookie: cookies.header,
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (res.ok) {
        const json = await res.json().catch(() => null)
        const extracted = extractItemsFromIgWebJson(json)
        if (extracted) {
          const hasVideoOnly = extracted.items.every((i) => i.kind === 'video')
          return {
            platform: 'instagram',
            resolvedMode: hasVideoOnly ? 'instagram_reel' : 'instagram_photo',
            ...extracted,
          }
        }
      }
    } catch {
      // continue to yt-dlp / embed fallback
    }
  }

  // Strategy B: Embed HTML parser (works for public photo posts & carousels without cookies)
  if (shortcode && mode !== 'instagram_reel') {
    try {
      const embedRes = await fetchImpl(
        `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`,
        {
          headers: {
            'User-Agent': BROWSER_UA,
            Accept: 'text/html,application/xhtml+xml',
          },
          signal: AbortSignal.timeout(15_000),
        }
      )
      if (embedRes.ok) {
        const html = await embedRes.text()
        const extracted = parseIgEmbedHtml(html)
        if (extracted && extracted.items.length > 0) {
          const hasVideoOnly = extracted.items.every((i) => i.kind === 'video')
          return {
            platform: 'instagram',
            resolvedMode: hasVideoOnly ? 'instagram_reel' : 'instagram_photo',
            ...extracted,
          }
        }
      }
    } catch {
      // continue to yt-dlp
    }
  }

  // Strategy C: yt-dlp (primary for Reels without cookies or final fallback)
  try {
    const payload = deps.ytDlpRun
      ? await deps.ytDlpRun(url, cookies.netscape)
      : await runYtDlpJson(url, cookies.netscape, binaries)
    const mapped = mapYtDlpPayload(payload, 'instagram', 'Instagram')
    if (mapped.items.length > 0) {
      const hasImage = mapped.items.some((i) => i.kind === 'image')
      return {
        platform: 'instagram',
        resolvedMode: hasImage && mode === 'instagram_photo' ? 'instagram_photo' : 'instagram_reel',
        ...mapped,
      }
    }
  } catch (err) {
    // Also try embed fallback if yt-dlp failed on a Reel
    if (shortcode) {
      try {
        const embedRes = await fetchImpl(
          `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/embed/captioned/`,
          {
            headers: { 'User-Agent': BROWSER_UA },
            signal: AbortSignal.timeout(12_000),
          }
        )
        if (embedRes.ok) {
          const extracted = parseIgEmbedHtml(await embedRes.text())
          if (extracted && extracted.items.length > 0) {
            return {
              platform: 'instagram',
              resolvedMode: mode === 'instagram_photo' ? 'instagram_photo' : 'instagram_reel',
              ...extracted,
            }
          }
        }
      } catch {
        // throw original error below
      }
    }

    if (!cookies.header && !cookies.netscape) {
      throw new DownloaderHttpError(
        422,
        'Instagram membatasi akses dari IP server. Minta admin menambahkan Cookie Sesi Instagram lewat tombol Sesi IG agar Reel/Foto stabil.'
      )
    }
    if (err instanceof DownloaderHttpError) throw err
  }

  throw new DownloaderHttpError(
    422,
    'Gagal mengambil media Instagram. Pastikan postingan bersifat publik atau perbarui Cookie Sesi Instagram.'
  )
}

export function createProxyTokenStore() {
  const store = new Map()

  function prune() {
    const now = Date.now()
    for (const [token, entry] of store.entries()) {
      if (entry.expiresAt <= now) {
        store.delete(token)
      }
    }
    while (store.size > MAX_PROXY_ENTRIES) {
      const oldestKey = store.keys().next().value
      if (!oldestKey) break
      store.delete(oldestKey)
    }
  }

  function register({ userId, url, filename, mimeType, platform }) {
    if (!url) return ''
    prune()
    const token = randomUUID()
    store.set(token, {
      userId,
      url,
      filename,
      mimeType,
      platform,
      expiresAt: Date.now() + PROXY_TTL_MS,
    })
    return token
  }

  function get(token, userId) {
    const entry = store.get(token)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      store.delete(token)
      return null
    }
    if (entry.userId !== userId) return null
    return entry
  }

  return { register, get }
}

export async function fetchAllowedUpstream(targetUrl, headers, fetchImpl = fetch) {
  let currentUrl = targetUrl
  for (let hop = 0; hop < 4; hop += 1) {
    let parsed
    try {
      parsed = new URL(currentUrl)
    } catch {
      throw new DownloaderHttpError(400, 'URL media tidak valid.')
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new DownloaderHttpError(403, 'Protokol media tidak diizinkan.')
    }
    if (!isAllowedMediaProxyHost(parsed.hostname)) {
      throw new DownloaderHttpError(403, 'Host CDN media tidak berada dalam daftar izin.')
    }

    const res = await fetchImpl(currentUrl, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(45_000),
    })

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) {
        throw new DownloaderHttpError(502, 'Redirect CDN tidak memiliki tujuan.')
      }
      currentUrl = new URL(location, currentUrl).toString()
      continue
    }

    const contentLength = Number(res.headers.get('content-length') || 0)
    if (contentLength > MAX_PROXY_BYTES) {
      throw new DownloaderHttpError(413, 'Ukuran file melebihi batas maksimal 150 MB.')
    }

    return res
  }
  throw new DownloaderHttpError(502, 'Terlalu banyak pengalihan URL media.')
}
