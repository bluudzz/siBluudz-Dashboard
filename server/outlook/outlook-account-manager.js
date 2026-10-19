/**
 * Modul manajemen akun Outlook/Hotmail via Microsoft Graph API (OAuth2 refresh_token).
 *
 * Akun disiapkan dengan refresh_token + client_id (public client, tanpa client_secret),
 * lalu modul ini menukar refresh_token menjadi access_token untuk memanggil Microsoft Graph.
 */

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
const GRAPH_MESSAGES_URL = 'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages'
const DEFAULT_SCOPE = 'offline_access https://graph.microsoft.com/Mail.Read'
const DEFAULT_TIMEOUT_MS = 15_000
const DEFAULT_MAX_RETRIES = 3

/** Error operasi Outlook dengan kode mesin (`INVALID_GRANT`, `TOKEN_FAILED`, `TIMEOUT`, `NETWORK`, `GRAPH_FAILED`, `GRAPH_UNAUTHORIZED`). */
export class OutlookAuthError extends Error {
  /**
   * @param {string} message
   * @param {'INVALID_GRANT'|'TOKEN_FAILED'|'TIMEOUT'|'NETWORK'|'GRAPH_FAILED'|'GRAPH_UNAUTHORIZED'} code
   */
  constructor(message, code) {
    super(message)
    this.name = 'OutlookAuthError'
    this.code = code
  }
}

/**
 * Ambil kode OTP dari teks email.
 * @param {string} text
 * @param {string|RegExp} [pattern] Regex OTP; string akan dikonversi ke RegExp.
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
 * Manager satu akun Outlook berbasis OAuth2 refresh_token (Microsoft Graph, tenant consumers).
 */
export class OutlookAccountManager {
  /**
   * @param {object} options
   * @param {string} options.email
   * @param {string} [options.password] Disimpan untuk keperluan audit; tidak dipakai oleh OAuth2.
   * @param {string} options.refreshToken
   * @param {string} options.clientId
   * @param {number} [options.timeoutMs] Timeout per request dalam ms (default 15000).
   * @param {number} [options.maxRetries] Maksimum retry untuk HTTP 429 (default 3).
   * @param {(newRefreshToken: string) => void} [options.onRefreshTokenRotated]
   *        Dipanggil saat Microsoft mengembalikan refresh_token baru (rotasi token).
   */
  constructor({
    email,
    password = '',
    refreshToken,
    clientId,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxRetries = DEFAULT_MAX_RETRIES,
    onRefreshTokenRotated,
  }) {
    if (!email || !refreshToken || !clientId) {
      throw new Error('email, refreshToken, dan clientId wajib diisi.')
    }
    this.email = email
    this.password = password
    this.currentRefreshToken = refreshToken
    this.clientId = clientId
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
   * Bangun manager dari format pipa `email|password|refresh_token|client_id`.
   * @param {string} line
   * @param {object} [options] Opsi tambahan untuk constructor.
   */
  static fromPipeLine(line, options = {}) {
    const parts = String(line).trim().split('|').map((part) => part.trim())
    if (parts.length < 4 || parts.some((part, index) => index !== 1 && !part)) {
      throw new Error(`Format baris tidak valid (harus email|password|refresh_token|client_id): "${String(line).slice(0, 80)}"`)
    }
    const [email, password, refreshToken, clientId] = parts
    return new OutlookAccountManager({ email, password, refreshToken, clientId, ...options })
  }

  /**
   * Request dengan timeout (default 15 detik) dan exponential backoff untuk HTTP 429.
   * @private
   */
  async #request(url, init = {}) {
    for (let attempt = 0; ; attempt += 1) {
      let response
      try {
        response = await fetch(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) })
      } catch (error) {
        if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
          throw new OutlookAuthError(`Request timeout setelah ${this.timeoutMs}ms.`, 'TIMEOUT')
        }
        throw new OutlookAuthError(`Koneksi gagal: ${error?.message || error}`, 'NETWORK')
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
   * Tukar refresh_token menjadi access_token baru.
   * @returns {Promise<string>} access_token
   * @throws {OutlookAuthError} kode `INVALID_GRANT` bila refresh_token expired/dicabut.
   */
  async refreshToken() {
    const response = await this.#request(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        refresh_token: this.currentRefreshToken,
        scope: DEFAULT_SCOPE,
      }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
      if (payload.error === 'invalid_grant') {
        this.status = 'invalid'
        this.invalidReason = payload.error_description || 'Refresh token expired atau dicabut.'
        throw new OutlookAuthError(this.invalidReason, 'INVALID_GRANT')
      }
      throw new OutlookAuthError(
        payload.error_description || payload.error || `Token refresh gagal (HTTP ${response.status}).`,
        'TOKEN_FAILED',
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
   * Baca pesan inbox terbaru via Microsoft Graph.
   * @param {number} [limit] Jumlah pesan (1-50, default 5).
   * @returns {Promise<Array<{id: string, subject: string, from: string, fromName: string, receivedDateTime: string, bodyPreview: string, isRead: boolean}>>}
   */
  async getInboxMessages(limit = 5) {
    try {
      return await this.#fetchInbox(limit)
    } catch (error) {
      // Access token bisa dicabut di tengah jalan; paksa refresh sekali lalu ulang.
      if (error?.code === 'GRAPH_UNAUTHORIZED') {
        this.tokenCache = null
        return this.#fetchInbox(limit)
      }
      throw error
    }
  }

  /** @private */
  async #fetchInbox(limit) {
    const accessToken = await this.#accessToken()
    const query = new URLSearchParams({
      $top: String(Math.min(Math.max(Math.trunc(Number(limit)) || 5, 1), 50)),
      $orderby: 'receivedDateTime desc',
      $select: 'subject,from,bodyPreview,receivedDateTime,isRead',
    })
    const response = await this.#request(`${GRAPH_MESSAGES_URL}?${query}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (response.status === 401) {
      throw new OutlookAuthError('Access token ditolak Microsoft Graph.', 'GRAPH_UNAUTHORIZED')
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new OutlookAuthError(
        payload.error?.message || `Gagal mengambil inbox (HTTP ${response.status}).`,
        'GRAPH_FAILED',
      )
    }
    const data = await response.json()
    return (Array.isArray(data.value) ? data.value : []).map((message) => ({
      id: message.id,
      subject: message.subject || '(Tanpa subjek)',
      from: message.from?.emailAddress?.address || '',
      fromName: message.from?.emailAddress?.name || '',
      receivedDateTime: message.receivedDateTime || '',
      bodyPreview: message.bodyPreview || '',
      isRead: Boolean(message.isRead),
    }))
  }

  /**
   * Cari kode OTP/link verifikasi pada email terbaru.
   * @param {string|RegExp} [serviceNameOrRegex]
   *        String: dicocokkan literal (case-insensitive) ke pengirim/subjek/isi pesan.
   *        RegExp: dipakai apa adanya. Kosong: pindai semua pesan.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<string|null>} Kode OTP, atau null bila tidak ditemukan.
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
  async getMessage(messageId) {
    const accessToken = await this.#accessToken()
    const response = await this.#request(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(messageId)}?$select=id,subject,from,receivedDateTime,bodyPreview,body,isRead`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    )
    if (response.status === 401) {
      throw new OutlookAuthError('Access token ditolak Microsoft Graph.', 'GRAPH_UNAUTHORIZED')
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new OutlookAuthError(
        payload.error?.message || `Gagal mengambil pesan (HTTP ${response.status}).`,
        'GRAPH_FAILED',
      )
    }
    const data = await response.json()
    const content = data.body?.content || ''
    const htmlText = data.body?.contentType === 'html' && typeof content === 'string'
      ? content.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, ' ')
      : content || data.bodyPreview || ''
    return {
      id: data.id,
      subject: data.subject || '(Tanpa subjek)',
      from: data.from?.emailAddress?.name
        ? `${data.from.emailAddress.name} <${data.from.emailAddress.address}>`
        : (data.from?.emailAddress?.address || ''),
      date: data.receivedDateTime || null,
      text: (htmlText || '').slice(0, 40000),
      rawHtml: data.body?.contentType === 'html' ? content : null,
    }
  }
}
