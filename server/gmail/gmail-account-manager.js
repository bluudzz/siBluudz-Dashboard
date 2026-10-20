/**
 * Modul manajemen akun Gmail via Google OAuth2 & Gmail REST API v1 (refresh_token).
 *
 * Menggunakan format pipa:
 * 4 segmen: email|refresh_token|client_id|client_secret
 * 5 segmen: email|password|refresh_token|client_id|client_secret
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL_MESSAGES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RETRIES = 3

/** Error operasi Gmail dengan kode mesin (`INVALID_GRANT`, `TOKEN_FAILED`, `TIMEOUT`, `NETWORK`, `GMAIL_FAILED`, `GMAIL_UNAUTHORIZED`). */
export class GmailAuthError extends Error {
  /**
   * @param {string} message
   * @param {'INVALID_GRANT'|'TOKEN_FAILED'|'TIMEOUT'|'NETWORK'|'GMAIL_FAILED'|'GMAIL_UNAUTHORIZED'} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'GmailAuthError'
    this.code = code
  }
}

/**
 * Ambil kode OTP dari teks email.
 * @param {string} text
 * @param {string|RegExp} [pattern] Regex OTP; default mencocokkan 4-8 digit angka.
 * @returns {string|null}
 */
export function extractOtp(text, pattern = /\b\d{4,8}\b/) {
  if (!text) return null
  const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
  const match = regex.exec(text)
  return match ? (match[1] || match[0]) : null
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Decode base64url dari body part Gmail API
 * @param {string} data
 * @returns {string}
 */
function decodeBase64Url(data) {
  if (!data) return ''
  try {
    return Buffer.from(data, 'base64url').toString('utf8')
  } catch {
    try {
      const standard = data.replace(/-/g, '+').replace(/_/g, '/')
      return Buffer.from(standard, 'base64').toString('utf8')
    } catch {
      return ''
    }
  }
}

/**
 * Rekursif mencari text/plain dan text/html dari struktur payload Gmail API
 */
function extractBodyFromPayload(payload) {
  let text = ''
  let html = ''

  if (payload.body && payload.body.data) {
    const decoded = decodeBase64Url(payload.body.data)
    if (payload.mimeType === 'text/html') html = decoded
    else text = decoded
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        text = text || decodeBase64Url(part.body.data)
      } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
        html = html || decodeBase64Url(part.body.data)
      } else if (part.parts) {
        const sub = extractBodyFromPayload(part)
        text = text || sub.text
        html = html || sub.html
      }
    }
  }

  return { text, html }
}

/**
 * Manager satu akun Gmail berbasis OAuth2 refresh_token (Google OAuth2 + Gmail REST API).
 */
export class GmailAccountManager {
  /**
   * @param {object} options
   * @param {string} options.email
   * @param {string} [options.password] Disimpan untuk keperluan audit/format pipa cadangan.
   * @param {string} options.refreshToken
   * @param {string} options.clientId
   * @param {string} options.clientSecret
   * @param {number} [options.timeoutMs] Timeout per request dalam ms (default 15000).
   * @param {number} [options.maxRetries] Maksimum retry untuk HTTP 429 (default 3).
   * @param {(newRefreshToken: string) => void} [options.onRefreshTokenRotated]
   */
  constructor({
    email,
    password = '',
    refreshToken,
    clientId,
    clientSecret,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    onRefreshTokenRotated,
  }) {
    if (!email || !refreshToken || !clientId || !clientSecret) {
      throw new Error('email, refreshToken, clientId, dan clientSecret wajib diisi.')
    }
    this.email = email
    this.password = password
    this.currentRefreshToken = refreshToken
    this.clientId = clientId
    this.clientSecret = clientSecret
    this.timeoutMs = timeoutMs
    this.maxRetries = maxRetries
    this.onRefreshTokenRotated = onRefreshTokenRotated
    /** @type {'valid'|'invalid'} */
    this.status = 'valid'
    this.invalidReason = null
    /** @type {{ accessToken: string, expiresAt: number }|null} */
    this.tokenCache = null
  }

  /**
   * Bangun manager dari format pipa:
   * - 4 segmen: `email|refresh_token|client_id|client_secret`
   * - 5 segmen: `email|password|refresh_token|client_id|client_secret`
   * @param {string} line
   * @param {object} [options]
   */
  static fromPipeLine(line, options = {}) {
    const parts = String(line).trim().split('|').map((part) => part.trim())
    if (parts.length === 4) {
      const [email, refreshToken, clientId, clientSecret] = parts
      if (!email || !refreshToken || !clientId || !clientSecret) {
        throw new Error(`Format 4 segmen tidak lengkap: "${line.slice(0, 80)}"`)
      }
      return new GmailAccountManager({ email, password: '', refreshToken, clientId, clientSecret, ...options })
    }

    if (parts.length >= 5) {
      const [email, password, refreshToken, clientId, clientSecret] = parts
      if (!email || !refreshToken || !clientId || !clientSecret) {
        throw new Error(`Format 5 segmen tidak lengkap: "${line.slice(0, 80)}"`)
      }
      return new GmailAccountManager({ email, password, refreshToken, clientId, clientSecret, ...options })
    }

    throw new Error(
      `Format baris tidak valid (harus email|refresh_token|client_id|client_secret atau email|password|refresh_token|client_id|client_secret): "${String(line).slice(0, 80)}"`
    )
  }

  /**
   * Request dengan timeout dan exponential backoff untuk HTTP 429.
   * @private
   */
  async #request(url, init = {}) {
    for (let attempt = 0; ; attempt += 1) {
      let response
      try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) })
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          throw new GmailAuthError(`Request timeout setelah ${this.timeoutMs}ms.`, 'TIMEOUT')
        }
        throw new GmailAuthError(`Koneksi gagal: ${error?.message || error}`, 'NETWORK')
      }
      if (response.status === 429 && attempt < this.maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'))
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000
        await sleep(delayMs)
        continue
      }
      return response
    }
  }

  /**
   * Tukar refresh_token menjadi access_token baru via Google OAuth2.
   * @returns {Promise<string>} access_token
   * @throws {GmailAuthError} kode `INVALID_GRANT` bila refresh_token expired/dicabut.
   */
  async refreshToken() {
    const response = await this.#request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.currentRefreshToken,
      }),
    })

    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (payload.error === 'invalid_grant') {
        this.status = 'invalid'
        this.invalidReason = payload.error_description || 'Refresh token expired atau dicabut oleh Google.'
        throw new GmailAuthError(this.invalidReason, 'INVALID_GRANT')
      }
      throw new GmailAuthError(
        payload.error_description || payload.error || `Token refresh gagal (HTTP ${response.status}).`,
        'TOKEN_FAILED'
      )
    }

    this.status = 'valid'
    this.invalidReason = null
    this.tokenCache = {
      accessToken: payload.access_token,
      expiresAt: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    }

    if (payload.refresh_token && payload.refresh_token !== this.currentRefreshToken) {
      this.currentRefreshToken = payload.refresh_token
      this.onRefreshTokenRotated?.(payload.refresh_token)
    }

    return this.tokenCache.accessToken
  }

  /** @private Ambil access_token dari cache, atau refresh bila mendekati kedaluwarsa. */
  async #accessToken() {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 60_000) {
      return this.tokenCache.accessToken
    }
    return this.refreshToken()
  }

  /**
   * Baca pesan inbox terbaru via Gmail REST API.
   * @param {number} [limit] Jumlah pesan (1-50, default 5).
   * @returns {Promise<Array<{id: string, subject: string, from: string, fromName: string, receivedDateTime: string, bodyPreview: string, isRead: boolean}>>}
   */
  async getInboxMessages(limit = 5) {
    try {
      return await this.#fetchInbox(limit)
    } catch (error) {
      if (error?.code === 'GMAIL_UNAUTHORIZED') {
        this.tokenCache = null
        return this.#fetchInbox(limit)
      }
      throw error
    }
  }

  /** @private */
  async #fetchInbox(limit) {
    const accessToken = await this.#accessToken()
    const maxResults = Math.min(Math.max(Math.trunc(Number(limit)) || 5, 1), 50)
    const listUrl = `${GMAIL_MESSAGES_URL}?maxResults=${maxResults}&q=${encodeURIComponent('in:inbox')}`

    const listRes = await this.#request(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (listRes.status === 401) {
      throw new GmailAuthError('Access token ditolak Google API.', 'GMAIL_UNAUTHORIZED')
    }
    if (!listRes.ok) {
      const payload = await listRes.json().catch(() => ({}))
      throw new GmailAuthError(
        payload.error?.message || `Gagal mengambil daftar email (HTTP ${listRes.status}).`,
        'GMAIL_FAILED'
      )
    }

    const listData = await listRes.json()
    const messageMetas = Array.isArray(listData.messages) ? listData.messages : []
    if (messageMetas.length === 0) return []

    // Fetch detail untuk tiap pesan secara concurrent (metadata only)
    const detailPromises = messageMetas.map(async (item) => {
      try {
        const detailUrl = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(item.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`
        const res = await this.#request(detailUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!res.ok) return null
        const msg = await res.json()
        const headers = msg.payload?.headers || []
        const subjectHeader = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(Tanpa subjek)'
        const fromHeader = headers.find((h) => h.name.toLowerCase() === 'from')?.value || ''
        const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date')?.value || ''

        // Parse fromName & fromAddress
        let fromName = ''
        let fromAddress = fromHeader
        const match = fromHeader.match(/^(.*?)\s*<([^>]+)>$/)
        if (match) {
          fromName = match[1].replace(/^["']|["']$/g, '').trim()
          fromAddress = match[2].trim()
        }

        const internalTime = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null
        const receivedDateTime = internalTime || (dateHeader ? new Date(dateHeader).toISOString() : new Date().toISOString())
        const isRead = !msg.labelIds?.includes('UNREAD')

        return {
          id: msg.id,
          subject: subjectHeader,
          from: fromAddress,
          fromName: fromName || fromAddress,
          receivedDateTime,
          bodyPreview: msg.snippet || '',
          isRead,
        }
      } catch {
        return null
      }
    })

    const results = await Promise.all(detailPromises)
    return results.filter(Boolean)
  }

  /**
   * Cari kode OTP pada email terbaru.
   * @param {string|RegExp} [serviceNameOrRegex]
   * @param {{ limit?: number }} [options]
   * @returns {Promise<string|null>}
   */
  async getVerificationCode(serviceNameOrRegex, { limit = 5 } = {}) {
    const matcher = serviceNameOrRegex instanceof RegExp
      ? serviceNameOrRegex
      : serviceNameOrRegex
        ? new RegExp(String(serviceNameOrRegex).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
        : null
    const messages = await this.getInboxMessages(limit)
    for (const message of messages) {
      if (matcher && !matcher.test(`${message.from} ${message.fromName} ${message.subject} ${message.bodyPreview}`)) {
        continue
      }
      const code = extractOtp(message.bodyPreview) ?? extractOtp(message.subject)
      if (code) return code
    }
    return null
  }

  /**
   * Ambil detail pesan lengkap (termasuk decode body HTML/text)
   * @param {string} messageId
   */
  async getMessage(messageId) {
    const accessToken = await this.#accessToken()
    const detailUrl = `${GMAIL_MESSAGES_URL}/${encodeURIComponent(messageId)}?format=full`
    const response = await this.#request(detailUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.status === 401) {
      throw new GmailAuthError('Access token ditolak Google API.', 'GMAIL_UNAUTHORIZED')
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new GmailAuthError(
        payload.error?.message || `Gagal mengambil pesan (HTTP ${response.status}).`,
        'GMAIL_FAILED'
      )
    }

    const data = await response.json()
    const headers = data.payload?.headers || []
    const subject = headers.find((h) => h.name.toLowerCase() === 'subject')?.value || '(Tanpa subjek)'
    const from = headers.find((h) => h.name.toLowerCase() === 'from')?.value || ''
    const dateHeader = headers.find((h) => h.name.toLowerCase() === 'date')?.value || ''
    const date = data.internalDate ? new Date(Number(data.internalDate)).toISOString() : (dateHeader ? new Date(dateHeader).toISOString() : null)

    const { text, html } = extractBodyFromPayload(data.payload || {})
    const htmlClean = typeof html === 'string'
      ? html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, ' ')
      : ''

    return {
      id: data.id,
      subject,
      from,
      date,
      text: (text || htmlClean || data.snippet || '').slice(0, 40000),
      rawHtml: html || null,
    }
  }
}
