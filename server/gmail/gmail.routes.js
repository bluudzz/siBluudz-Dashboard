import '../env.js'
import { Router } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { appOrigin, parseCookies, requireSameOrigin, requireUser, sessionCookieName, hashToken } from '../middleware/auth.js'
import { encryptMailCredentials, decryptMailCredentials } from '../utils/mail-crypto.js'
import { GmailAccountManager, GmailAuthError } from './gmail-account-manager.js'

const router = Router()

export const getGoogleMailClientId = () => process.env.GOOGLE_MAIL_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
export const getGoogleMailClientSecret = () => process.env.GOOGLE_MAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
export const isGoogleMailEnabled = () => Boolean(getGoogleMailClientId() && getGoogleMailClientSecret())

export const googleMailClientId = getGoogleMailClientId()
export const googleMailClientSecret = getGoogleMailClientSecret()
export const googleMailEnabled = isGoogleMailEnabled()

const googleMailScope = 'https://mail.google.com/ https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
const googleMailStateCookie = 'sibluudz_gmail_oauth_state'
const googleMailRedirectUri = () => process.env.GOOGLE_MAIL_REDIRECT_URI || `${appOrigin}/api/gmail/oauth/callback`

/** @type {Map<string, GmailAccountManager>} */
const managerCache = new Map()

export function getManager(account) {
  let manager = managerCache.get(account.id)
  if (!manager) {
    const credentials = decryptMailCredentials(account.encrypted_credentials)
    manager = new GmailAccountManager({
      email: account.email,
      password: credentials.password || '',
      refreshToken: credentials.refresh_token,
      clientId: credentials.client_id,
      clientSecret: credentials.client_secret,
      onRefreshTokenRotated: (newRefreshToken) => {
        db.prepare('update mail_accounts set encrypted_credentials = ? where id = ?')
          .run(encryptMailCredentials({ ...credentials, refresh_token: newRefreshToken }), account.id)
      },
    })
    managerCache.set(account.id, manager)
  }
  return manager
}

export function gmailErrorStatus(error) {
  if (error instanceof GmailAuthError) {
    if (error.code === 'INVALID_GRANT') return { status: 401, code: 'INVALID_GRANT' }
    if (error.code === 'TIMEOUT') return { status: 504, code: 'TIMEOUT' }
    if (error.code === 'NETWORK') return { status: 502, code: 'NETWORK' }
    return { status: 502, code: error.code }
  }
  if (error instanceof Error && error.message.includes('MAIL_CREDENTIALS_KEY')) {
    return { status: 503, code: 'ENCRYPTION_KEY' }
  }
  return { status: 500, code: 'INTERNAL' }
}

/**
 * Parse batch format pipa:
 * 4 segmen: email|refresh_token|client_id|client_secret
 * 5 segmen: email|password|refresh_token|client_id|client_secret
 */
function parseInputAccounts(body) {
  if (body?.email && body?.refreshToken && body?.clientId && body?.clientSecret) {
    const email = String(body.email).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Email tidak valid: ${email}`)
    }
    return [{
      email,
      password: String(body.password || '').trim(),
      refreshToken: String(body.refreshToken).trim(),
      clientId: String(body.clientId).trim(),
      clientSecret: String(body.clientSecret).trim(),
    }]
  }

  const raw = body?.accounts ?? ''
  const lines = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('Tidak ada data akun Gmail untuk disimpan/diimpor.')
  if (lines.length > 500) throw new Error('Maksimum 500 akun per batch impor.')

  return lines.map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    let email = ''
    let password = ''
    let refreshToken = ''
    let clientId = ''
    let clientSecret = ''

    if (parts.length === 4) {
      ;[email, refreshToken, clientId, clientSecret] = parts
    } else if (parts.length >= 5) {
      ;[email, password, refreshToken, clientId, clientSecret] = parts
    } else {
      throw new Error(`Format baris tidak valid (harus email|refresh_token|client_id|client_secret atau email|password|refresh_token|client_id|client_secret): "${line.slice(0, 80)}"`)
    }

    if (!email || !refreshToken || !clientId || !clientSecret) {
      throw new Error(`Kolom data tidak lengkap pada baris: "${line.slice(0, 80)}"`)
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Email tidak valid: ${email}`)
    }

    return { email, password, refreshToken, clientId, clientSecret }
  })
}

// Konfigurasi status OAuth Google Mail
router.get('/config', (_req, res) => {
  res.json({
    enabled: isGoogleMailEnabled(),
    clientId: getGoogleMailClientId(),
  })
})

// Mulai alur OAuth Google Web: GET /oauth/authorize
router.get('/oauth/authorize', requireUser, (_req, res) => {
  const clientId = getGoogleMailClientId()
  const clientSecret = getGoogleMailClientSecret()
  if (!clientId || !clientSecret) {
    return res.status(503).json({ error: 'GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_SECRET belum dikonfigurasi di server.' })
  }
  const state = randomBytes(24).toString('hex')
  res.cookie(googleMailStateCookie, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/gmail/oauth/callback',
    maxAge: 10 * 60 * 1000,
  })
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleMailRedirectUri(),
    response_type: 'code',
    scope: googleMailScope,
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
  })
  res.redirect(url.toString())
})

// Callback dari Google setelah pengguna memberikan izin: GET /oauth/callback
router.get('/oauth/callback', async (req, res) => {
  const failure = (reason) => res.redirect(`${appOrigin}/?gmailOAuthError=${encodeURIComponent(reason)}`)
  try {
    const cookies = parseCookies(req.headers.cookie)
    const stateCookie = cookies[googleMailStateCookie]
    res.clearCookie(googleMailStateCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/gmail/oauth/callback',
    })

    const clientId = getGoogleMailClientId()
    const clientSecret = getGoogleMailClientSecret()
    if (!clientId || !clientSecret || !stateCookie || stateCookie !== req.query.state || !req.query.code) {
      return failure('state')
    }

    // Validasi session token user
    const sessionToken = cookies[sessionCookieName]
    const session = sessionToken
      ? db.prepare(`select users.id from sessions join users on users.id = sessions.user_id
        where sessions.token_hash = ? and sessions.expires_at > ?`).get(hashToken(sessionToken), Date.now())
      : null
    if (!session) return failure('session')

    // Tukar kode otorisasi menjadi refresh_token & access_token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleMailRedirectUri(),
        grant_type: 'authorization_code',
      }),
    })

    const tokens = await tokenRes.json().catch(() => ({}))
    if (!tokenRes.ok || !tokens.access_token) {
      return failure(tokens.error_description || tokens.error || 'token_exchange_failed')
    }

    // Ambil profile email pengguna
    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const userInfo = await userinfoRes.json().catch(() => ({}))
    const email = String(userInfo.email || '').trim().toLowerCase()
    if (!email) return failure('email_not_found')

    // Simpan ke mail_accounts
    const refreshToken = tokens.refresh_token || ''
    const encrypted = encryptMailCredentials({
      password: '',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    })

    const upsert = db.prepare(`
      insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
      values (?, ?, ?, ?, 'gmail.googleapis.com', 443, ?, 'oauth2', 'gmail_api', ?)
      on conflict(user_id, email) do update set
        label = excluded.label,
        username = excluded.username,
        auth_type = 'oauth2',
        provider = 'gmail_api',
        encrypted_credentials = excluded.encrypted_credentials
    `)
    upsert.run(randomUUID(), session.id, email, email, email, encrypted)

    const existing = db.prepare('select id from mail_accounts where user_id = ? and email = ?').get(session.id, email)
    if (existing?.id) managerCache.delete(existing.id)

    res.redirect(`${appOrigin}/?gmailOAuth=success&email=${encodeURIComponent(email)}`)
  } catch (error) {
    console.error('Gmail OAuth callback error:', error)
    return failure('internal')
  }
})

// Impor batch/single akun Gmail: POST /accounts/import
router.post('/accounts/import', requireSameOrigin, requireUser, (req, res) => {
  try {
    const accounts = parseInputAccounts(req.body)
    const inserted = []
    const upsert = db.prepare(`
      insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
      values (?, ?, ?, ?, 'gmail.googleapis.com', 443, ?, 'oauth2', 'gmail_api', ?)
      on conflict(user_id, email) do update set
        label = excluded.label,
        username = excluded.username,
        auth_type = 'oauth2',
        provider = 'gmail_api',
        encrypted_credentials = excluded.encrypted_credentials
    `)
    const selectId = db.prepare('select id from mail_accounts where user_id = ? and email = ?')

    const transaction = db.transaction(() => {
      for (const account of accounts) {
        const encrypted = encryptMailCredentials({
          password: account.password,
          refresh_token: account.refreshToken,
          client_id: account.clientId,
          client_secret: account.clientSecret,
        })
        upsert.run(randomUUID(), req.user.id, account.email, account.email, account.email, encrypted)
        inserted.push({ email: account.email, id: selectId.get(req.user.id, account.email).id })
      }
    })
    transaction()

    for (const { id } of inserted) managerCache.delete(id)
    res.status(201).json({ imported: inserted.length, accounts: inserted })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impor akun Gmail gagal.'
    if (message.includes('MAIL_CREDENTIALS_KEY')) {
      return res.status(503).json({ error: message })
    }
    res.status(400).json({ error: message })
  }
})

// Daftar akun Gmail milik user
router.get('/accounts', requireUser, (_req, res) => {
  const accounts = db.prepare(`
    select id, label, email, auth_type, provider, created_at
    from mail_accounts
    where user_id = ? and provider = 'gmail_api'
    order by created_at desc
  `).all(_req.user.id)

  res.json({
    accounts: accounts.map((account) => {
      const manager = managerCache.get(account.id)
      return { ...account, status: manager?.status || 'valid', invalid_reason: manager?.invalidReason || null }
    }),
  })
})

// Detail Kredensial Dekripsi: GET /accounts/:id/credentials
router.get('/accounts/:id/credentials', requireUser, (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'gmail_api'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })

  try {
    const creds = decryptMailCredentials(account.encrypted_credentials)
    const email = account.email
    const password = creds.password || ''
    const refreshToken = creds.refresh_token || ''
    const clientId = creds.client_id || ''
    const clientSecret = creds.client_secret || ''
    const pipeLine = password
      ? `${email}|${password}|${refreshToken}|${clientId}|${clientSecret}`
      : `${email}|${refreshToken}|${clientId}|${clientSecret}`

    res.json({
      id: account.id,
      email,
      password,
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      pipe_line: pipeLine,
    })
  } catch {
    res.status(500).json({ error: 'Gagal mendekripsi kredensial akun Gmail.' })
  }
})

// Ekspor Semua Akun Gmail Format Pipa: GET /accounts-export
router.get('/accounts-export', requireUser, (req, res) => {
  const accounts = db.prepare(`
    select id, email, encrypted_credentials, created_at from mail_accounts
    where user_id = ? and provider = 'gmail_api'
    order by created_at desc
  `).all(req.user.id)

  const items = []
  const pipeLines = []
  for (const account of accounts) {
    try {
      const creds = decryptMailCredentials(account.encrypted_credentials)
      const email = account.email
      const password = creds.password || ''
      const refreshToken = creds.refresh_token || ''
      const clientId = creds.client_id || ''
      const clientSecret = creds.client_secret || ''
      const pipeLine = password
        ? `${email}|${password}|${refreshToken}|${clientId}|${clientSecret}`
        : `${email}|${refreshToken}|${clientId}|${clientSecret}`

      items.push({
        id: account.id,
        email,
        password,
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        pipe_line: pipeLine,
      })
      pipeLines.push(pipeLine)
    } catch {
      // ignore
    }
  }

  res.json({
    count: items.length,
    accounts: items,
    raw_pipe_text: pipeLines.join('\n'),
  })
})

// Hapus akun Gmail: DELETE /accounts/:id
router.delete('/accounts/:id', requireSameOrigin, requireUser, (req, res) => {
  managerCache.delete(req.params.id)
  const result = db.prepare(`delete from mail_accounts where id = ? and user_id = ? and provider = 'gmail_api'`)
    .run(req.params.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })
  res.status(204).end()
})

// Refresh token manual: POST /accounts/:id/refresh -> { access_token }
router.post('/accounts/:id/refresh', requireSameOrigin, requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'gmail_api'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })

  try {
    const accessToken = await getManager(account).refreshToken()
    res.json({ access_token: accessToken })
  } catch (error) {
    const { status, code } = gmailErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Refresh token Google gagal.', code })
  }
})

// Inbox: GET /accounts/:id/inbox?limit=5
router.get('/accounts/:id/inbox', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'gmail_api'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })

  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 5, 1), 50)
  try {
    const messages = await getManager(account).getInboxMessages(limit)
    res.json({ messages })
  } catch (error) {
    const { status, code } = gmailErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal mengambil inbox Gmail.', code })
  }
})

// OTP: GET /accounts/:id/otp?service=github&limit=5 -> { code }
router.get('/accounts/:id/otp', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'gmail_api'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })

  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 5, 1), 20)
  try {
    const code = await getManager(account).getVerificationCode(req.query.service, { limit })
    res.json({ code })
  } catch (error) {
    const { status, code } = gmailErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal memindai OTP.', code })
  }
})

// Pesan spesifik: GET /accounts/:id/messages/:messageId
router.get('/accounts/:id/messages/:messageId', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'gmail_api'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Gmail tidak ditemukan.' })

  try {
    const message = await getManager(account).getMessage(req.params.messageId)
    res.json({ message })
  } catch (error) {
    const { status, code } = gmailErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal membuka email Gmail.', code })
  }
})

export default router
