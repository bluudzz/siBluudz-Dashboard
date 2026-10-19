import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { db, getNineRouterConfig } from '../db.js'

const scrypt = promisify(scryptCallback)

export const sessionCookieName = 'sibluudz_session'
export const sessionDurationMs = 1000 * 60 * 60 * 24 * 14
export const appOrigin = process.env.APP_ORIGIN || 'http://localhost:5173'

const authAttempts = new Map()

export const hashToken = (token) => createHash('sha256').update(token).digest('hex')

export function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => {
    const separator = part.indexOf('=')
    if (separator < 0) return ['', '']
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]
  }).filter(([key]) => key))
}

export function setSessionCookie(res, token) {
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionDurationMs,
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(sessionCookieName, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

export function requireSameOrigin(req, res, next) {
  const origin = req.get('origin')
  let isAllowedLocalOrigin = false
  if (process.env.NODE_ENV !== 'production' && origin) {
    try {
      const parsed = new URL(origin)
      isAllowedLocalOrigin = parsed.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    } catch {
      isAllowedLocalOrigin = false
    }
  }
  if (origin !== appOrigin && !isAllowedLocalOrigin) {
    return res.status(403).json({ error: 'Permintaan lintas situs ditolak.' })
  }
  next()
}

export function rateLimitAuth(req, res, next) {
  const now = Date.now()
  const ip = req.ip
  const attempts = (authAttempts.get(ip) ?? []).filter((time) => now - time < 15 * 60 * 1000)
  if (attempts.length >= 15) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' })
  attempts.push(now)
  authAttempts.set(ip, attempts)
  next()
}

export function requireUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[sessionCookieName]
  if (!token) return res.status(401).json({ error: 'Silakan masuk terlebih dahulu.' })
  const session = db.prepare(`
    select users.id, users.email, users.username, users.name, users.company, users.phone, users.address, users.role, users.tier, users.ai_daily_limit, users.password_hash
    from sessions join users on users.id = sessions.user_id
    where sessions.token_hash = ? and sessions.expires_at > ?
  `).get(hashToken(token), Date.now())
  if (!session) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Sesi berakhir. Silakan masuk kembali.' })
  }
  req.user = session
  req.sessionTokenHash = hashToken(token)
  next()
}

export function requireAdmin(req, res, next) {
  requireUser(req, res, () => {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Akses ditolak: Hanya administrator yang diizinkan.' })
    }
    next()
  })
}

export async function createUserSession(userId, res) {
  const token = randomBytes(32).toString('base64url')
  db.prepare('insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + sessionDurationMs)
  setSessionCookie(res, token)
}

export function userResponse(user) {
  let todayCount = 0
  try {
    const row = db.prepare(`
      select count(*) as count from ai_usage_logs
      where user_id = ? and date(created_at, 'localtime') = date('now', 'localtime')
    `).get(user.id)
    todayCount = row?.count || 0
  } catch (err) {
    console.warn('Failed to query ai usage count:', err)
  }

  const { freeDailyLimit, proDailyLimit } = getNineRouterConfig()
  const defaultLimit = user.role === 'admin' ? 9999 : (user.tier === 'pro' ? proDailyLimit : freeDailyLimit)
  const actualLimit = user.ai_daily_limit != null ? user.ai_daily_limit : defaultLimit

  return {
    id: user.id,
    email: user.email,
    username: user.username || '',
    name: user.name,
    company: user.company,
    phone: user.phone,
    address: user.address,
    role: user.role,
    tier: user.tier || (user.role === 'admin' ? 'pro' : 'free'),
    aiDailyLimit: actualLimit,
    aiUsageToday: todayCount,
    hasPassword: Boolean(user.password_hash),
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${Buffer.from(derived).toString('hex')}`
}

export async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':')
  if (!salt || !hash) return false
  const expected = Buffer.from(hash, 'hex')
  const actual = Buffer.from(await scrypt(password, salt, expected.length))
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254
}

export function assignRole(email) {
  return process.env.ADMIN_EMAIL && normalizeEmail(process.env.ADMIN_EMAIL) === email ? 'admin' : 'user'
}
