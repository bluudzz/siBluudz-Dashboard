/**
 * Modul autentikasi Device Authorization Grant (OAuth 2.0 Device Code Flow - RFC 8628)
 * untuk mendapatkan OAuth2 refresh_token dan client_id Microsoft Graph API
 * tanpa memerlukan client_secret atau redirect_uri kustom.
 */

export const DEFAULT_PUBLIC_CLIENT_ID = '04b07795-8ddb-461a-bbee-02f9e1bf7b46' // Public Client ID (Azure CLI)
export const DEFAULT_DEVICE_SCOPE = 'offline_access https://graph.microsoft.com/Mail.Read'

const DEVICE_CODE_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode'
const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Meminta Device Code dari Microsoft OAuth2 endpoint.
 * @param {object} [options]
 * @param {string} [options.clientId]
 * @param {string} [options.scope]
 * @returns {Promise<{ user_code: string, device_code: string, verification_uri: string, expires_in: number, interval: number, message: string, client_id: string }>}
 */
export async function requestDeviceCode(options = {}) {
  const clientId = options.clientId || DEFAULT_PUBLIC_CLIENT_ID
  const scope = options.scope || DEFAULT_DEVICE_SCOPE

  const response = await fetch(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      scope,
    }),
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error_description || data.error || `Gagal meminta device code (HTTP ${response.status}).`)
  }

  return {
    user_code: data.user_code,
    device_code: data.device_code,
    verification_uri: data.verification_uri || 'https://www.microsoft.com/link',
    expires_in: data.expires_in || 900,
    interval: data.interval || 5,
    message: data.message || `Buka ${data.verification_uri} dan masukkan kode: ${data.user_code}`,
    client_id: clientId,
  }
}

/**
 * Memeriksa status device code satu kali ke token endpoint.
 * Mengembalikan token jika sudah diotorisasi, atau null jika masih menunggu (authorization_pending).
 * @param {string} deviceCode
 * @param {string} [clientId]
 * @returns {Promise<{ pending: boolean, tokens?: { access_token: string, refresh_token: string, expires_in: number } }>}
 */
export async function checkDeviceToken(deviceCode, clientId = DEFAULT_PUBLIC_CLIENT_ID) {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode,
    }),
  })

  const payload = await response.json().catch(() => ({}))

  if (response.ok && payload.access_token && payload.refresh_token) {
    return {
      pending: false,
      tokens: {
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
        expires_in: payload.expires_in,
        scope: payload.scope,
      },
    }
  }

  if (payload.error === 'authorization_pending' || payload.error === 'slow_down') {
    return { pending: true }
  }

  if (payload.error === 'expired_token') {
    throw new Error('Waktu otorisasi device code telah kedaluwarsa. Silakan minta kode baru.')
  }

  throw new Error(payload.error_description || payload.error || 'Otorisasi token gagal.')
}

/**
 * Polling token endpoint hingga selesai atau timeout.
 * @param {string} deviceCode
 * @param {object} [options]
 * @param {string} [options.clientId]
 * @param {number} [options.intervalSeconds]
 * @param {number} [options.timeoutSeconds]
 * @param {(status: { attempt: number, elapsedSeconds: number }) => void} [options.onProgress]
 * @returns {Promise<{ access_token: string, refresh_token: string, expires_in: number }>}
 */
export async function pollDeviceToken(deviceCode, options = {}) {
  const clientId = options.clientId || DEFAULT_PUBLIC_CLIENT_ID
  const intervalMs = (options.intervalSeconds || 5) * 1000
  const timeoutMs = (options.timeoutSeconds || 300) * 1000
  const startTime = Date.now()

  let attempt = 0
  while (Date.now() - startTime < timeoutMs) {
    attempt += 1
    options.onProgress?.({
      attempt,
      elapsedSeconds: Math.round((Date.now() - startTime) / 1000),
    })

    const result = await checkDeviceToken(deviceCode, clientId)
    if (!result.pending && result.tokens) {
      return result.tokens
    }

    await sleep(intervalMs)
  }

  throw new Error(`Batas waktu polling otorisasi terlewati (${Math.round(timeoutMs / 1000)} detik).`)
}
