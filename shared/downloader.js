export const DOWNLOADER_GROUPS = [
  { id: 'tiktok', label: 'TikTok Downloader' },
  { id: 'instagram', label: 'Instagram Downloader' },
]

export const DOWNLOADER_MODES = [
  {
    mode: 'tiktok_video',
    platform: 'tiktok',
    group: 'tiktok',
    title: 'TikTok Video',
    kindLabel: 'Video MP4',
    description: 'Unduh video TikTok tanpa watermark dalam kualitas HD beserta audio MP3.',
    placeholder: 'Tempel tautan video TikTok (https://www.tiktok.com/... atau https://vt.tiktok.com/...)',
  },
  {
    mode: 'tiktok_photo',
    platform: 'tiktok',
    group: 'tiktok',
    title: 'TikTok Foto',
    kindLabel: 'Slideshow',
    description: 'Ambil semua slide foto dari postingan carousel TikTok sekaligus.',
    placeholder: 'Tempel tautan foto/slideshow TikTok (https://www.tiktok.com/@user/photo/...)',
  },
  {
    mode: 'tiktok_story',
    platform: 'tiktok',
    group: 'tiktok',
    title: 'TikTok Story',
    kindLabel: 'Story',
    description: 'Unduh TikTok Story akun publik sebelum kedaluwarsa 24 jam.',
    placeholder: 'Tempel tautan TikTok Story (https://www.tiktok.com/@user/story/...)',
  },
  {
    mode: 'instagram_reel',
    platform: 'instagram',
    group: 'instagram',
    title: 'Instagram Reel',
    kindLabel: 'Reel HD',
    description: 'Unduh video Instagram Reel berkualitas tinggi lengkap dengan audio.',
    placeholder: 'Tempel tautan Instagram Reel (https://www.instagram.com/reel/...)',
  },
  {
    mode: 'instagram_photo',
    platform: 'instagram',
    group: 'instagram',
    title: 'Instagram Foto',
    kindLabel: 'Foto / Slide',
    description: 'Unduh foto tunggal maupun seluruh slide carousel Instagram.',
    placeholder: 'Tempel tautan postingan/carousel Instagram (https://www.instagram.com/p/...)',
  },
  {
    mode: 'instagram_story',
    platform: 'instagram',
    group: 'instagram',
    title: 'IG Story',
    kindLabel: 'Story',
    description: 'Unduh foto dan video Instagram Story aktif dari akun target.',
    placeholder: 'Tempel tautan IG Story atau ketik @username akun target',
  },
]

const VALID_MODE_SET = new Set(DOWNLOADER_MODES.map((item) => item.mode))

const TIKTOK_HOSTS = new Set([
  'tiktok.com',
  'www.tiktok.com',
  'm.tiktok.com',
  'vm.tiktok.com',
  'vt.tiktok.com',
])

const INSTAGRAM_HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
  'instagr.am',
  'ddinstagram.com',
])

const INSTAGRAM_REWRITE_HOSTS = new Set(['instagr.am', 'ddinstagram.com'])

const ALLOWED_PROXY_SUFFIXES = [
  'tiktokcdn.com',
  'tiktokcdn-us.com',
  'tiktokcdn-eu.com',
  'tiktokcdn-in.com',
  'tiktokv.com',
  'tiktok.com',
  'muscdn.com',
  'byteoversea.com',
  'ibytedtos.com',
  'tikwm.com',
  'snssdk.com',
  'akamaized.net',
  'ttwstatic.com',
  'cdninstagram.com',
  'fbcdn.net',
  'instagram.com',
]

function isPrivateOrLocalHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true
  }
  const m172 = host.match(/^172\.(\d+)\./)
  if (m172) {
    const second = Number(m172[1])
    if (second >= 16 && second <= 31) return true
  }
  if (/^169\.254\./.test(host)) return true
  if (host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) {
    return true
  }
  return false
}

export function detectDownloaderModeFromUrl(urlString, fallbackMode = 'tiktok_video') {
  const safeFallback = VALID_MODE_SET.has(fallbackMode) ? fallbackMode : 'tiktok_video'
  let parsed
  try {
    parsed = new URL(urlString)
  } catch {
    return safeFallback
  }
  const host = parsed.hostname.toLowerCase()
  const path = parsed.pathname.toLowerCase()

  if (TIKTOK_HOSTS.has(host)) {
    if (path.includes('/photo/')) return 'tiktok_photo'
    if (path.includes('/story/')) return 'tiktok_story'
    if (host === 'vt.tiktok.com' || host === 'vm.tiktok.com') {
      return safeFallback.startsWith('tiktok_') ? safeFallback : 'tiktok_video'
    }
    return 'tiktok_video'
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    if (path.includes('/stories/')) return 'instagram_story'
    if (path.includes('/reel/') || path.includes('/reels/')) return 'instagram_reel'
    if (path.includes('/p/') || path.includes('/tv/')) {
      return safeFallback === 'instagram_reel' ? 'instagram_reel' : 'instagram_photo'
    }
    return safeFallback.startsWith('instagram_') ? safeFallback : 'instagram_reel'
  }

  return safeFallback
}

export function normalizeAndValidateUrl(input, mode = 'tiktok_video') {
  const raw = String(input || '').trim()
  if (!raw) {
    throw new Error('Masukkan tautan TikTok atau Instagram terlebih dahulu.')
  }
  if (raw.length > 2048) {
    throw new Error('Tautan terlalu panjang (maksimal 2048 karakter).')
  }

  let candidate = raw
  if (mode === 'instagram_story' && /^@?[a-zA-Z0-9._]{1,30}$/.test(candidate)) {
    const username = candidate.replace(/^@+/, '')
    if (!username || /^\.+$/.test(username)) {
      throw new Error('Username Instagram tidak valid.')
    }
    candidate = `https://www.instagram.com/stories/${username}/`
  } else if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    if (/^(www\.)?(tiktok\.com|vm\.tiktok\.com|vt\.tiktok\.com|m\.tiktok\.com|instagram\.com|m\.instagram\.com|instagr\.am|ddinstagram\.com)(\/|$|\?)/i.test(candidate)) {
      candidate = `https://${candidate}`
    }
  }

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('Format tautan tidak valid. Tempel tautan TikTok atau Instagram yang lengkap.')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Hanya tautan HTTP atau HTTPS yang diperbolehkan.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('Tautan tidak boleh mengandung kredensial.')
  }

  const hostname = parsed.hostname.toLowerCase()
  if (isPrivateOrLocalHost(hostname)) {
    throw new Error('Host lokal atau IP privat tidak diperbolehkan.')
  }

  let platform = null
  if (TIKTOK_HOSTS.has(hostname)) {
    platform = 'tiktok'
  } else if (INSTAGRAM_HOSTS.has(hostname)) {
    platform = 'instagram'
    if (INSTAGRAM_REWRITE_HOSTS.has(hostname)) {
      parsed.hostname = 'www.instagram.com'
    }
  } else {
    throw new Error('Domain tidak didukung. Gunakan tautan dari TikTok atau Instagram.')
  }

  const normalizedUrl = parsed.toString()
  const detectedMode = detectDownloaderModeFromUrl(normalizedUrl, mode)

  return {
    url: normalizedUrl,
    platform,
    detectedMode,
  }
}

export function isAllowedMediaProxyHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.+$/, '')
  if (!host) return false
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.includes('[') || host.includes(']')) {
    return false
  }
  if (isPrivateOrLocalHost(host)) {
    return false
  }
  return ALLOWED_PROXY_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export function normalizeCookieInput(raw, platform = 'instagram') {
  const text = String(raw || '').trim()
  if (!text) {
    return { netscape: '', header: '' }
  }
  if (text.length > 65536) {
    throw new Error('Data cookie terlalu panjang (maksimal 64 KB).')
  }

  const defaultDomain = platform === 'tiktok' ? '.tiktok.com' : '.instagram.com'
  const matchSuffix = platform === 'tiktok' ? 'tiktok.com' : 'instagram.com'

  const lines = text.split(/\r?\n/)
  const hasNetscapeRows = lines.some((line) => {
    const trimmed = line.trim()
    return trimmed && !trimmed.startsWith('#') && trimmed.split('\t').length >= 7
  })

  if (hasNetscapeRows || text.startsWith('# Netscape HTTP Cookie File')) {
    const validRows = []
    const headerPairs = []
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const cols = line.split('\t')
      if (cols.length < 7) continue
      const [domain, flag, path, secure, expires, name, ...rest] = cols
      const value = rest.join('\t')
      const cleanName = String(name || '').trim()
      if (!cleanName || /[\r\n\0;]/.test(cleanName) || /[\r\n\0]/.test(value)) continue
      const cleanDomain = String(domain || '').trim() || defaultDomain
      const cleanFlag = String(flag || 'TRUE').trim().toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE'
      const cleanPath = String(path || '/').trim() || '/'
      const cleanSecure = String(secure || 'TRUE').trim().toUpperCase() === 'FALSE' ? 'FALSE' : 'TRUE'
      const cleanExpires = /^\d+$/.test(String(expires || '').trim()) ? String(expires).trim() : '2147483647'
      validRows.push(`${cleanDomain}\t${cleanFlag}\t${cleanPath}\t${cleanSecure}\t${cleanExpires}\t${cleanName}\t${value}`)
      if (cleanDomain.toLowerCase().includes(matchSuffix)) {
        headerPairs.push(`${cleanName}=${value}`)
      }
    }
    if (validRows.length === 0) {
      throw new Error('Format cookies.txt Netscape tidak valid atau kosong.')
    }
    return {
      netscape: `# Netscape HTTP Cookie File\n${validRows.join('\n')}\n`,
      header: headerPairs.join('; '),
    }
  }

  // Raw HTTP Cookie header (`k=v; k2=v2`) or newline-separated `k=v`
  const sanitized = text.replace(/^cookie:\s*/i, '')
  const rawParts = sanitized.split(/[;\r\n]+/).map((part) => part.trim()).filter(Boolean)
  const netscapeRows = []
  const headerPairs = []
  for (const part of rawParts) {
    const eqIndex = part.indexOf('=')
    if (eqIndex <= 0) continue
    const name = part.slice(0, eqIndex).trim()
    const value = part.slice(eqIndex + 1).trim()
    if (!name || /[\s;]/.test(name) || /[\r\n\0;]/.test(value)) continue
    headerPairs.push(`${name}=${value}`)
    netscapeRows.push(`${defaultDomain}\tTRUE\t/\tTRUE\t2147483647\t${name}\t${value}`)
  }

  if (headerPairs.length === 0) {
    throw new Error('Format cookie tidak dikenali. Tempel header Cookie (nama=nilai; ...) atau isi cookies.txt Netscape.')
  }

  return {
    netscape: `# Netscape HTTP Cookie File\n${netscapeRows.join('\n')}\n`,
    header: headerPairs.join('; '),
  }
}

export function sanitizeDownloadFilename(name, ext = 'mp4') {
  const safeExt = String(ext || 'mp4').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'mp4'
  const base = String(name || 'media')
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72) || 'media'
  return `${base}.${safeExt}`
}
