import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'
import { encryptMailCredentials, decryptMailCredentials } from '../utils/mail-crypto.js'
import { OutlookAccountManager, OutlookAuthError } from './outlook-account-manager.js'
import { requestDeviceCode, checkDeviceToken, DEFAULT_PUBLIC_CLIENT_ID } from './device-auth.js'

const router = Router()

// Cache manager per akun agar access_token tidak di-refresh pada setiap request.
/** @type {Map<string, OutlookAccountManager>} */
const managerCache = new Map()

export function getManager(account) {
  let manager = managerCache.get(account.id)
  if (!manager) {
    const credentials = decryptMailCredentials(account.encrypted_credentials)
    manager = new OutlookAccountManager({
      email: account.email,
      password: credentials.password || '',
      refreshToken: credentials.refresh_token,
      clientId: credentials.client_id,
      onRefreshTokenRotated: (newRefreshToken) => {
        db.prepare('update mail_accounts set encrypted_credentials = ? where id = ?')
          .run(encryptMailCredentials({ ...credentials, refresh_token: newRefreshToken }), account.id)
      },
    })
    managerCache.set(account.id, manager)
  }
  return manager
}

export function outlookErrorStatus(error) {
  if (error instanceof OutlookAuthError) {
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
 * Parse batch format pipa `email|password|refresh_token|client_id` (satu akun per baris)
 * atau objek tunggal { email, password, refreshToken, clientId }.
 */
function parseInputAccounts(body) {
  if (body?.email && body?.refreshToken && body?.clientId) {
    const email = String(body.email).trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Email tidak valid: ${email}`)
    }
    return [{
      email,
      password: String(body.password || '').trim(),
      refreshToken: String(body.refreshToken).trim(),
      clientId: String(body.clientId).trim(),
    }]
  }

  const raw = body?.accounts ?? ''
  const lines = String(raw).split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('Tidak ada data akun Outlook untuk disimpan/diimpor.')
  if (lines.length > 200) throw new Error('Maksimum 200 akun per impor.')
  return lines.map((line) => {
    const parts = line.split('|').map((part) => part.trim())
    if (parts.length < 4 || parts.some((part, index) => index !== 1 && !part)) {
      throw new Error(`Format baris tidak valid (harus email|password|refresh_token|client_id): "${line.slice(0, 80)}"`)
    }
    const [email, password, refreshToken, clientId] = parts
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error(`Email tidak valid: ${email}`)
    }
    return { email, password, refreshToken, clientId }
  })
}

// Impor batch/single akun Outlook: POST { accounts: "email|password|refresh_token|client_id\n..." }
router.post('/accounts/import', requireSameOrigin, requireUser, (req, res) => {
  try {
    const accounts = parseInputAccounts(req.body)
    const inserted = []
    const skipped = []
    const upsert = db.prepare(`
      insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
      values (?, ?, ?, ?, 'graph.microsoft.com', 443, ?, 'oauth2', 'outlook_graph', ?)
      on conflict(user_id, email) do update set
        label = excluded.label,
        username = excluded.username,
        auth_type = 'oauth2',
        provider = 'outlook_graph',
        encrypted_credentials = excluded.encrypted_credentials
    `)
    const selectId = db.prepare('select id from mail_accounts where user_id = ? and email = ?')

    const transaction = db.transaction(() => {
      for (const account of accounts) {
        const encrypted = encryptMailCredentials({
          password: account.password,
          refresh_token: account.refreshToken,
          client_id: account.clientId,
        })
        upsert.run(randomUUID(), req.user.id, account.email, account.email, account.email, encrypted)
        inserted.push({ email: account.email, id: selectId.get(req.user.id, account.email).id })
      }
    })
    transaction()

    for (const { id } of inserted) managerCache.delete(id)
    res.status(201).json({ imported: inserted.length, accounts: inserted, skipped })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Impor gagal.'
    if (message.includes('MAIL_CREDENTIALS_KEY')) {
      return res.status(503).json({ error: message })
    }
    res.status(400).json({ error: message })
  }
})

// Daftar akun Outlook milik user beserta status valid/invalid.
router.get('/accounts', requireUser, (_req, res) => {
  const accounts = db.prepare(`
    select id, label, email, auth_type, provider, created_at
    from mail_accounts
    where user_id = ? and provider = 'outlook_graph'
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
    where id = ? and user_id = ? and provider = 'outlook_graph'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })

  try {
    const creds = decryptMailCredentials(account.encrypted_credentials)
    const email = account.email
    const password = creds.password || ''
    const refreshToken = creds.refresh_token || ''
    const clientId = creds.client_id || DEFAULT_PUBLIC_CLIENT_ID
    const pipeLine = `${email}|${password}|${refreshToken}|${clientId}`

    res.json({
      id: account.id,
      email,
      password,
      refresh_token: refreshToken,
      client_id: clientId,
      pipe_line: pipeLine,
    })
  } catch (error) {
    res.status(500).json({ error: 'Gagal mendekripsi kredensial akun.' })
  }
})

// Ekspor Semua Akun Outlook Format Pipa: GET /accounts-export
router.get('/accounts-export', requireUser, (req, res) => {
  const accounts = db.prepare(`
    select id, email, encrypted_credentials, created_at from mail_accounts
    where user_id = ? and provider = 'outlook_graph'
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
      const clientId = creds.client_id || DEFAULT_PUBLIC_CLIENT_ID
      const pipeLine = `${email}|${password}|${refreshToken}|${clientId}`
      items.push({ id: account.id, email, password, refresh_token: refreshToken, client_id: clientId, pipe_line: pipeLine })
      pipeLines.push(pipeLine)
    } catch {
      // skip
    }
  }

  res.json({
    count: items.length,
    accounts: items,
    raw_pipe_text: pipeLines.join('\n'),
  })
})

// Hapus akun Outlook: DELETE /accounts/:id
router.delete('/accounts/:id', requireSameOrigin, requireUser, (req, res) => {
  managerCache.delete(req.params.id)
  const result = db.prepare(`delete from mail_accounts where id = ? and user_id = ? and provider = 'outlook_graph'`)
    .run(req.params.id, req.user.id)
  if (result.changes === 0) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })
  res.status(204).end()
})

// Refresh token manual: POST /accounts/:id/refresh -> { access_token }
router.post('/accounts/:id/refresh', requireSameOrigin, requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'outlook_graph'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })

  try {
    const accessToken = await getManager(account).refreshToken()
    res.json({ access_token: accessToken })
  } catch (error) {
    const { status, code } = outlookErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Refresh gagal.', code })
  }
})

// Inbox: GET /accounts/:id/inbox?limit=5
router.get('/accounts/:id/inbox', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'outlook_graph'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })

  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 5, 1), 50)
  try {
    const messages = await getManager(account).getInboxMessages(limit)
    res.json({ messages })
  } catch (error) {
    const { status, code } = outlookErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal mengambil inbox.', code })
  }
})

// OTP: GET /accounts/:id/otp?service=github&limit=5 -> { code }
router.get('/accounts/:id/otp', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'outlook_graph'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })

  const service = typeof req.query.service === 'string' ? req.query.service.trim() : ''
  const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 5, 1), 50)
  try {
    const code = await getManager(account).getVerificationCode(service || undefined, { limit })
    res.json({ code })
  } catch (error) {
    const { status, code: errorCode } = outlookErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal mencari OTP.', code: errorCode })
  }
})

// Detail Pesan: GET /accounts/:id/messages/:messageId
router.get('/accounts/:id/messages/:messageId', requireUser, async (req, res) => {
  const account = db.prepare(`
    select id, email, encrypted_credentials from mail_accounts
    where id = ? and user_id = ? and provider = 'outlook_graph'
  `).get(req.params.id, req.user.id)
  if (!account) return res.status(404).json({ error: 'Akun Outlook tidak ditemukan.' })

  try {
    const message = await getManager(account).getMessage(req.params.messageId)
    res.json({ message })
  } catch (error) {
    const { status, code } = outlookErrorStatus(error)
    res.status(status).json({ error: error instanceof Error ? error.message : 'Gagal membaca pesan.', code })
  }
})

// Request Device Code: POST /device/code
router.post('/device/code', requireSameOrigin, requireUser, async (req, res) => {
  try {
    const clientId = typeof req.body?.clientId === 'string' && req.body.clientId.trim()
      ? req.body.clientId.trim()
      : DEFAULT_PUBLIC_CLIENT_ID
    const result = await requestDeviceCode({ clientId })
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Gagal meminta device code.' })
  }
})

// Poll Device Token: POST /device/poll
router.post('/device/poll', requireSameOrigin, requireUser, async (req, res) => {
  try {
    const { device_code, client_id, email, password, auto_save } = req.body || {}
    if (!device_code) {
      return res.status(400).json({ error: 'device_code wajib disertakan.' })
    }
    const clientIdToUse = client_id || DEFAULT_PUBLIC_CLIENT_ID
    const status = await checkDeviceToken(device_code, clientIdToUse)
    if (status.pending) {
      return res.json({ pending: true })
    }

    const refreshToken = status.tokens.refresh_token
    const accessToken = status.tokens.access_token
    const cleanEmail = typeof email === 'string' ? email.trim() : ''
    const cleanPassword = typeof password === 'string' ? password.trim() : ''
    const pipeLine = cleanEmail ? `${cleanEmail}|${cleanPassword}|${refreshToken}|${clientIdToUse}` : ''

    let accountId = null
    if (auto_save && cleanEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      const encrypted = encryptMailCredentials({
        password: cleanPassword,
        refresh_token: refreshToken,
        client_id: clientIdToUse,
      })
      const selectId = db.prepare('select id from mail_accounts where user_id = ? and email = ?')
      const existing = selectId.get(req.user.id, cleanEmail)
      if (existing) {
        db.prepare(`
          update mail_accounts set
            auth_type = 'oauth2',
            provider = 'outlook_graph',
            encrypted_credentials = ?
          where id = ?
        `).run(encrypted, existing.id)
        accountId = existing.id
        managerCache.delete(existing.id)
      } else {
        accountId = randomUUID()
        db.prepare(`
          insert into mail_accounts (id, user_id, label, email, host, port, username, auth_type, provider, encrypted_credentials)
          values (?, ?, ?, ?, 'graph.microsoft.com', 443, ?, 'oauth2', 'outlook_graph', ?)
        `).run(accountId, req.user.id, cleanEmail, cleanEmail, cleanEmail, encrypted)
      }
    }

    res.json({
      pending: false,
      refresh_token: refreshToken,
      access_token: accessToken,
      client_id: clientIdToUse,
      pipe_line: pipeLine,
      account_id: accountId,
    })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Polling otorisasi gagal.' })
  }
})

export default router
