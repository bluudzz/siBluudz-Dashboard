import { Router } from 'express'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'
import { db } from '../db.js'
import { appOrigin, parseCookies, requireSameOrigin, requireUser, sessionCookieName, hashToken } from '../middleware/auth.js'
import { getManager as getOutlookManager, outlookErrorStatus } from '../outlook/outlook.routes.js'

const router = Router()

export const microsoftEnabled = Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET)
const microsoftScope = 'offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All'
const microsoftStateCookie = 'sibluudz_mail_oauth_state'
const accessibleTokenCache = new Map()

const microsoftBaseUrl = () => `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID || 'common'}/oauth2/v2.0`
const microsoftRedirectUri = () => process.env.MICROSOFT_REDIRECT_URI || `${appOrigin}/api/mail/oauth/callback`

function getMailEncryptionKey() {
  const encodedKey = process.env.MAIL_CREDENTIALS_KEY
  if (!encodedKey) {
    throw new Error('MAIL_CREDENTIALS_KEY belum dikonfigurasi di .env.local.')
  }
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) {
    throw new Error('MAIL_CREDENTIALS_KEY harus berupa Base64 dari 32 byte acak.')
  }
  return key
}

function encryptMailCredentials(credentials) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getMailEncryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ])
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  })
}

function decryptMailCredentials(encrypted) {
  const payload = JSON.parse(encrypted)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMailEncryptionKey(),
    Buffer.from(payload.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(plaintext)
}

async function microsoftTokenRequest(params) {
  const response = await fetch(`${microsoftBaseUrl()}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID,
      client_secret: process.env.MICROSOFT_CLIENT_SECRET,
      scope: microsoftScope,
      ...params,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || 'Token Microsoft ditolak.')
    error.code = 'MICROSOFT_TOKEN_FAILED'
    throw error
  }
  return payload
}

// Returns a usable IMAP access token, refreshing and re-encrypting when expired.
async function resolveMailAccessToken(account) {
  const credentials = decryptMailCredentials(account.encrypted_credentials)
  if (account.auth_type !== 'oauth2') return { password: credentials.password }

  const cached = accessibleTokenCache.get(account.id)
  if (cached && cached.expiresAt > Date.now() + 60_000) return { accessToken: cached.accessToken }

  const tokens = await microsoftTokenRequest({
    grant_type: 'refresh_token',
    refresh_token: credentials.refresh_token,
  })
  const accessToken = tokens.access_token
  const expiresAt = Date.now() + (Number(tokens.expires_in) || 3600) * 1000
  accessibleTokenCache.set(account.id, { accessToken, expiresAt })

  if (tokens.refresh_token && tokens.refresh_token !== credentials.refresh_token) {
    db.prepare('update mail_accounts set encrypted_credentials = ? where id = ?')
      .run(encryptMailCredentials({ refresh_token: tokens.refresh_token }), account.id)
  }
  return { accessToken, expiresAt }
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) {
    const octets = address.split('.').map(Number)
    const [first, second] = octets
    return first === 0 || first === 10 || first === 127 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && (second === 0 || second === 88 || second === 168)) ||
      (first === 198 && (second === 18 || second === 19)) ||
      (first === 198 && second === 51 && octets[2] === 100) ||
      (first === 203 && second === 0 && octets[2] === 113) ||
      first >= 224
  }
  const normalized = address.toLowerCase()
  if (normalized.startsWith('::ffff:')) {
    const mappedIpv4 = normalized.slice('::ffff:'.length)
    return isIP(mappedIpv4) === 4 ? isPrivateAddress(mappedIpv4) : true
  }
  if (isIP(address) !== 6) return true
  const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16)
  return normalized === '::' || normalized === '::1' ||
    normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
    normalized.startsWith('fea') || normalized.startsWith('feb') ||
    normalized.startsWith('ff') || normalized.startsWith('2002:') ||
    normalized.startsWith('2001:db8:') || firstHextet < 0x2000 || firstHextet > 0x3fff
}

async function validateImapHost(host) {
  const normalizedHost = host.trim().toLowerCase()
  if (!normalizedHost || normalizedHost === 'localhost' || normalizedHost.endsWith('.local') || isIP(normalizedHost)) {
    throw new Error('Host IMAP harus berupa hostname publik, bukan IP lokal.')
  }
  const records = await lookup(normalizedHost, { all: true, verbatim: true })
  if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('Host IMAP mengarah ke jaringan privat atau tidak valid.')
  }
}

function createImapClient(account, auth) {
  return new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.username, ...auth },
    logger: false,
    socketTimeout: 15000,
  })
}

async function withImapMailbox(account, action) {
  await validateImapHost(account.host)
  const auth = await resolveMailAccessToken(account)
  const client = createImapClient(account, auth)
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX', { readOnly: true })
    try {
      return await action(client)
    } finally {
      lock.release()
    }
  } finally {
    if (client.usable) await client.logout()
    else client.close()
  }
}

// Endpoints
router.get('/accounts', requireUser, (req, res) => {
  const accounts = db.prepare(`
    select id, label, email, host, port, username, auth_type, provider, created_at
    from mail_accounts
    where user_id = ?
    order by created_at desc
  `).all(req.user.id)
  res.json({ accounts })
})

router.post('/accounts', requireSameOrigin, requireUser, async (req, res) => {
  const { label, email, host, port = 993, username, password } = req.body || {}
  const cleanedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const cleanedHost = typeof host === 'string' ? host.trim().toLowerCase() : ''
  const cleanedUsername = typeof username === 'string' ? username.trim() : ''
  const cleanedLabel = typeof label === 'string' && label.trim() ? label.trim() : cleanedEmail
  const cleanedPassword = typeof password === 'string' ? password.trim() : ''

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanedEmail) ||
      !cleanedHost || cleanedHost.length > 253 ||
      !Number.isInteger(port) || port !== 993 ||
      !cleanedUsername || cleanedUsername.length > 254 ||
      !cleanedPassword || cleanedPassword.length > 4096 ||
      cleanedLabel.length > 80) {
    return res.status(400).json({ error: 'Periksa email, label, username, password/sandi aplikasi, hostname, dan port IMAP TLS 993.' })
  }
  const duplicate = db.prepare('select 1 from mail_accounts where user_id = ? and email = ?').get(req.user.id, cleanedEmail)
  if (duplicate) return res.status(409).json({ error: 'Akun email tersebut sudah terdaftar.' })

  try {
    await validateImapHost(cleanedHost)
    const temporaryAccount = { host: cleanedHost, port, username: cleanedUsername }
    const client = createImapClient(temporaryAccount, { pass: cleanedPassword })
    try {
      await client.connect()
      const lock = await client.getMailboxLock('INBOX', { readOnly: true })
      lock.release()
    } finally {
      if (client.usable) await client.logout()
      else client.close()
    }

    const id = randomUUID()
    const encryptedCredentials = encryptMailCredentials({ password: cleanedPassword })
    db.prepare(`
      insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
      values (?, ?, ?, ?, ?, ?, ?, 'password', 'custom', ?)
    `).run(id, req.user.id, cleanedLabel, cleanedEmail, cleanedHost, port, cleanedUsername, encryptedCredentials)
    res.status(201).json({
      account: { id, label: cleanedLabel, email: cleanedEmail, host: cleanedHost, port, username: cleanedUsername, auth_type: 'password', provider: 'custom' },
    })
  } catch (error) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Alamat email tersebut sudah terdaftar.' })
    }
    const message = error instanceof Error ? error.message : 'Kesalahan koneksi IMAP.'
    if (message.includes('MAIL_CREDENTIALS_KEY')) {
      return res.status(503).json({ error: message })
    }
    let friendlyMessage = message
    if (/no password configured/i.test(message)) {
      friendlyMessage = 'Password atau Sandi Aplikasi belum diisi atau tidak valid.'
    } else if (/invalid credentials|authenticationfailed|authentication failure|login is disabled/i.test(message)) {
      if (cleanedHost.includes('google') || cleanedHost.includes('gmail')) {
        friendlyMessage = 'Login ditolak oleh Gmail. Gmail mewajibkan "Sandi Aplikasi" (App Password 16 karakter), bukan password akun Google biasa. Buat di: https://myaccount.google.com/apppasswords'
      } else if (cleanedHost.includes('yahoo')) {
        friendlyMessage = 'Login ditolak oleh Yahoo. Yahoo mewajibkan App Password dari menu Keamanan Akun Yahoo.'
      } else if (cleanedHost.includes('office365') || cleanedHost.includes('outlook')) {
        friendlyMessage = 'Login ditolak oleh Microsoft. Sejak Sept 2024, Microsoft melarang password biasa untuk IMAP. Wajib aktifkan Verifikasi 2 Langkah di akun Microsoft, lalu buat "Kata Sandi Aplikasi" (App Password) di https://account.live.com/proofs/manage/additional'
      } else {
        friendlyMessage = 'Username atau password email salah. Periksa kembali kredensial Anda.'
      }
    }
    return res.status(502).json({ error: `Tidak dapat memverifikasi akun IMAP: ${friendlyMessage}` })
  }
})

router.delete('/accounts/:id', requireSameOrigin, requireUser, (req, res) => {
  accessibleTokenCache.delete(req.params.id)
  const result = db.prepare('delete from mail_accounts where id = ? and user_id = ?')
    .run(req.params.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Akun email tidak ditemukan.' })
  res.status(204).end()
})

router.get('/oauth/microsoft/status', requireUser, (_req, res) => {
  res.json({ enabled: microsoftEnabled })
})

// Starts the Microsoft OAuth2 consent flow for IMAP (XOAUTH2).
router.get('/oauth/microsoft', requireSameOrigin, requireUser, (req, res) => {
  if (!microsoftEnabled) {
    return res.status(503).json({ error: 'OAuth2 Microsoft belum dikonfigurasi. Isi MICROSOFT_CLIENT_ID dan MICROSOFT_CLIENT_SECRET di .env.local.' })
  }
  const state = randomBytes(24).toString('hex')
  res.cookie(microsoftStateCookie, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/mail/oauth/callback',
    maxAge: 10 * 60 * 1000,
  })
  const url = new URL(`${microsoftBaseUrl()}/authorize`)
  url.search = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID,
    response_type: 'code',
    redirect_uri: microsoftRedirectUri(),
    response_mode: 'query',
    scope: microsoftScope,
    state,
    prompt: 'select_account',
  })
  res.redirect(url.toString())
})

router.get('/oauth/callback', async (req, res, next) => {
  const failure = (reason) => res.redirect(`${appOrigin}/?mailOAuthError=${encodeURIComponent(reason)}`)
  try {
    const stateCookie = parseCookies(req.headers.cookie)[microsoftStateCookie]
    res.clearCookie(microsoftStateCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/mail/oauth/callback',
    })
    if (!microsoftEnabled || !stateCookie || stateCookie !== req.query.state || !req.query.code) {
      return failure('state')
    }

    // requireUser is inlined because the callback cannot run requireSameOrigin (cross-site redirect).
    const sessionToken = parseCookies(req.headers.cookie)[sessionCookieName]
    const session = sessionToken
      ? db.prepare(`select users.id from sessions join users on users.id = sessions.user_id
        where sessions.token_hash = ? and sessions.expires_at > ?`).get(hashToken(sessionToken), Date.now())
      : null
    if (!session) return failure('session')

    const tokens = await microsoftTokenRequest({
      grant_type: 'authorization_code',
      code: String(req.query.code),
      redirect_uri: microsoftRedirectUri(),
    })
    if (!tokens.refresh_token) return failure('refresh_token')

    const profile = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }).then((response) => (response.ok ? response.json() : null)).catch(() => null)
    const email = (profile?.mail || profile?.userPrincipalName || '').toLowerCase()
    if (!email) return failure('profile')

    const host = 'outlook.office365.com'
    const port = 993
    const encryptedCredentials = encryptMailCredentials({ refresh_token: tokens.refresh_token })
    const existing = db.prepare('select id from mail_accounts where user_id = ? and email = ?').get(session.id, email)
    if (existing) {
      accessibleTokenCache.delete(existing.id)
      db.prepare(`update mail_accounts set host = ?, port = ?, username = ?, auth_type = 'oauth2',
        provider = 'outlook', encrypted_credentials = ? where id = ?`)
        .run(host, port, email, encryptedCredentials, existing.id)
    } else {
      db.prepare(`insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
        values (?, ?, ?, ?, ?, ?, ?, 'oauth2', 'outlook', ?)`)
        .run(randomUUID(), session.id, email, email, host, port, email, encryptedCredentials)
    }
    res.redirect(`${appOrigin}/?mailOAuth=success`)
  } catch (error) {
    console.error('Microsoft mail OAuth failed:', error)
    return failure('token')
  }
})

router.get('/accounts/:id/messages', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, host, port, username, auth_type, provider, encrypted_credentials
    from mail_accounts where id = ? and user_id = ?
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun email tidak ditemukan.' })

  if (account.provider === 'outlook_graph') {
    try {
      const manager = getOutlookManager(account)
      const rawMessages = await manager.getInboxMessages(20)
      const messages = rawMessages.map((m) => ({
        uid: m.id,
        subject: m.subject || '(Tanpa subjek)',
        from: m.from ? [{ name: m.fromName || '', address: m.from }] : [],
        date: m.receivedDateTime || null,
        unread: !m.isRead,
        snippet: m.bodyPreview || '',
      }))
      return res.json({ messages })
    } catch (error) {
      const { status, code } = outlookErrorStatus(error)
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Gagal mengambil inbox Outlook.',
        code,
      })
    }
  }

  try {
    const messages = await withImapMailbox(account, async (client) => {
      const total = client.mailbox.exists
      if (!total) return []
      const start = Math.max(1, total - 19)
      const result = []
      for await (const message of client.fetch(`${start}:${total}`, {
        envelope: true,
        internalDate: true,
        flags: true,
      })) {
        result.push({
          uid: message.uid,
          subject: message.envelope?.subject || '(Tanpa subjek)',
          from: message.envelope?.from?.map((address) => ({
            name: address.name || '',
            address: address.address || '',
          })) || [],
          date: message.internalDate?.toISOString() || null,
          unread: !message.flags?.has('\\Seen'),
        })
      }
      return result.reverse()
    })
    res.json({ messages })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kesalahan koneksi IMAP.'
    if (error?.code === 'MICROSOFT_TOKEN_FAILED') {
      return res.status(401).json({ error: 'Sesi Microsoft sudah dicabut atau kedaluwarsa. Hubungkan ulang akun lewat tombol "Hubungkan dengan Microsoft".' })
    }
    res.status(502).json({ error: `Gagal mengambil inbox: ${message}` })
  }
})

router.get('/accounts/:id/messages/:uid', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, host, port, username, auth_type, provider, encrypted_credentials
    from mail_accounts where id = ? and user_id = ?
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun email tidak ditemukan.' })

  if (account.provider === 'outlook_graph') {
    try {
      const message = await getOutlookManager(account).getMessage(req.params.uid)
      return res.json({ message })
    } catch (error) {
      const { status, code } = outlookErrorStatus(error)
      return res.status(status).json({
        error: error instanceof Error ? error.message : 'Gagal membuka email Outlook.',
        code,
      })
    }
  }

  const uid = Number(req.params.uid)
  if (!Number.isSafeInteger(uid) || uid < 1) {
    return res.status(400).json({ error: 'ID pesan tidak valid.' })
  }

  try {
    const message = await withImapMailbox(account, async (client) => {
      const fetched = await client.fetchOne(uid, { source: true }, { uid: true })
      if (!fetched?.source) return null
      const parsed = await simpleParser(fetched.source)
      const htmlText = typeof parsed.html === 'string'
        ? parsed.html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]*>/g, ' ')
        : ''
      return {
        subject: parsed.subject || '(Tanpa subjek)',
        from: parsed.from?.text || '',
        date: parsed.date?.toISOString() || null,
        text: (parsed.text || htmlText).slice(0, 40000),
      }
    })
    if (!message) return res.status(404).json({ error: 'Pesan tidak ditemukan atau sudah dihapus.' })
    res.json({ message })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Kesalahan koneksi IMAP.'
    res.status(502).json({ error: `Gagal membuka email: ${message}` })
  }
})

export default router
