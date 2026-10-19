import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import { randomBytes, randomUUID } from 'node:crypto'
import { db } from '../db.js'
import {
  appOrigin,
  sessionCookieName,
  parseCookies,
  clearSessionCookie,
  requireSameOrigin,
  rateLimitAuth,
  requireUser,
  createUserSession,
  userResponse,
  hashPassword,
  verifyPassword,
  normalizeEmail,
  isValidEmail,
  assignRole,
  hashToken,
} from '../middleware/auth.js'

const router = Router()

export const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
export const googleClient = googleEnabled
  ? new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_ORIGIN || 'http://localhost:5173'}/api/auth/google/callback`,
  )
  : null

router.get('/config', (_req, res) => {
  res.json({ googleEnabled })
})

router.post('/auth/register', requireSameOrigin, rateLimitAuth, async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email)
    const password = req.body?.password
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 120) : ''
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Masukkan alamat email yang valid.' })
    if (typeof password !== 'string' || password.length < 10) {
      return res.status(400).json({ error: 'Kata sandi harus memiliki minimal 10 karakter.' })
    }
    if (!name) return res.status(400).json({ error: 'Nama lengkap wajib diisi.' })
    const userId = randomUUID()
    const passwordHash = await hashPassword(password)
    try {
      db.prepare('insert into users (id, email, password_hash, name, role) values (?, ?, ?, ?, ?)')
        .run(userId, email, passwordHash, name, assignRole(email))
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'Email tersebut sudah terdaftar.' })
      }
      throw error
    }
    await createUserSession(userId, res)
    res.status(201).json({ user: userResponse(db.prepare('select * from users where id = ?').get(userId)) })
  } catch (error) {
    next(error)
  }
})

router.post('/auth/login', requireSameOrigin, rateLimitAuth, async (req, res, next) => {
  try {
    const identifier = typeof req.body?.identifier === 'string'
      ? req.body.identifier.trim().toLowerCase()
      : normalizeEmail(req.body?.email)
    const password = req.body?.password
    if (!identifier || typeof password !== 'string') {
      return res.status(400).json({ error: 'Email/username atau kata sandi tidak valid.' })
    }
    const user = db.prepare(`
      select * from users 
      where lower(email) = ? or (username is not null and lower(username) = ?)
    `).get(identifier, identifier)
    if (!user?.password_hash || !(await verifyPassword(password, user.password_hash))) {
      return res.status(401).json({ error: 'Email/username atau kata sandi salah.' })
    }
    await createUserSession(user.id, res)
    res.json({ user: userResponse(user) })
  } catch (error) {
    next(error)
  }
})

router.post('/auth/logout', requireSameOrigin, requireUser, (req, res) => {
  db.prepare('delete from sessions where token_hash = ?').run(req.sessionTokenHash)
  clearSessionCookie(res)
  res.status(204).end()
})

router.get('/auth/status', (req, res) => {
  const token = parseCookies(req.headers.cookie)[sessionCookieName]
  if (!token) return res.json({ authenticated: false })
  const user = db.prepare(`
    select users.id, users.email, users.username, users.name, users.company, users.phone, users.address, users.role, users.tier, users.ai_daily_limit, users.password_hash
    from sessions join users on users.id = sessions.user_id
    where sessions.token_hash = ? and sessions.expires_at > ?
  `).get(hashToken(token), Date.now())
  if (!user) {
    clearSessionCookie(res)
    return res.json({ authenticated: false })
  }
  const invoices = db.prepare('select data from invoices where user_id = ? order by updated_at desc')
    .all(user.id)
    .map((row) => JSON.parse(row.data))
  res.json({ authenticated: true, user: userResponse(user), invoices })
})

router.get('/me', requireUser, (req, res) => {
  const invoices = db.prepare('select data from invoices where user_id = ? order by updated_at desc')
    .all(req.user.id)
    .map((row) => JSON.parse(row.data))
  res.json({ user: userResponse(req.user), invoices })
})

router.patch('/profile', requireSameOrigin, requireUser, (req, res) => {
  const fields = ['name', 'company', 'phone', 'address']
  const updates = Object.fromEntries(fields
    .filter((field) => typeof req.body?.[field] === 'string')
    .map((field) => [field, req.body[field].trim().slice(0, 500)]))

  if (typeof req.body?.username === 'string') {
    const rawUsername = req.body.username.trim()
    if (rawUsername === '') {
      updates.username = null
    } else {
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(rawUsername)) {
        return res.status(400).json({ error: 'Username harus 3-30 karakter (hanya huruf, angka, titik, dash, underscore).' })
      }
      const existing = db.prepare('select id from users where lower(username) = ? and id != ?').get(rawUsername.toLowerCase(), req.user.id)
      if (existing) {
        return res.status(409).json({ error: 'Username tersebut sudah digunakan oleh akun lain.' })
      }
      updates.username = rawUsername
    }
  }

  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Tidak ada perubahan profil yang valid.' })

  const assignments = Object.keys(updates).map((field) => `${field} = @${field}`).join(', ')
  try {
    db.prepare(`update users set ${assignments}, updated_at = datetime('now') where id = @id`)
      .run({ ...updates, id: req.user.id })
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Username tersebut sudah terdaftar.' })
    }
    throw err
  }
  res.json({ user: userResponse(db.prepare('select * from users where id = ?').get(req.user.id)) })
})

router.post('/profile/password', requireSameOrigin, requireUser, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    if (typeof newPassword !== 'string' || newPassword.length < 10) {
      return res.status(400).json({ error: 'Kata sandi baru harus memiliki minimal 10 karakter.' })
    }
    const currentUser = db.prepare('select password_hash from users where id = ?').get(req.user.id)
    if (currentUser?.password_hash) {
      if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, currentUser.password_hash))) {
        return res.status(400).json({ error: 'Kata sandi saat ini salah.' })
      }
    }
    const newHash = await hashPassword(newPassword)
    db.prepare(`update users set password_hash = ?, updated_at = datetime('now') where id = ?`)
      .run(newHash, req.user.id)
    res.json({ ok: true, message: 'Kata sandi berhasil diperbarui.' })
  } catch (error) {
    next(error)
  }
})

router.get('/auth/google', (_req, res) => {
  if (!googleClient) return res.status(503).json({ error: 'Login Google belum dikonfigurasi.' })
  const state = randomBytes(24).toString('hex')
  res.cookie('sibluudz_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 10 * 60 * 1000,
  })
  const url = googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
  })
  res.redirect(url)
})

router.get('/auth/google/callback', async (req, res, next) => {
  try {
    const cookies = parseCookies(req.headers.cookie)
    const stateCookie = cookies.sibluudz_oauth_state
    res.clearCookie('sibluudz_oauth_state', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google/callback',
    })
    if (!googleClient || !stateCookie || stateCookie !== req.query.state || !req.query.code) {
      return res.redirect(`${appOrigin}/?authError=google`)
    }

    const { tokens } = await googleClient.getToken(String(req.query.code))
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.email || !payload.email_verified || !payload.sub) {
      return res.redirect(`${appOrigin}/?authError=google`)
    }

    const email = normalizeEmail(payload.email)
    const existingUser = db.prepare('select * from users where email = ?').get(email)
    let userId
    if (existingUser) {
      userId = existingUser.id
      db.prepare(`
        update users set google_sub = coalesce(google_sub, ?), name = case when name = '' then ? else name end,
        updated_at = datetime('now') where id = ?
      `).run(payload.sub, payload.name || '', userId)
    } else {
      userId = randomUUID()
      db.prepare('insert into users (id, email, google_sub, name, role) values (?, ?, ?, ?, ?)')
        .run(userId, email, payload.sub, payload.name || '', assignRole(email))
    }
    await createUserSession(userId, res)
    res.redirect(appOrigin)
  } catch (error) {
    next(error)
  }
})

export default router
