import { Router } from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { dataDirectory, db, getNineRouterConfig, getSetting, setSetting } from '../db.js'
import {
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  parseCookies,
  rateLimitAuth,
  requireAdmin,
  requireSameOrigin,
  sessionDurationMs,
  verifyPassword,
} from '../middleware/auth.js'
import { buildRelightPrompt, RELIGHT_PROMPT_VERSION, relightPresets } from '../../shared/relight.js'
import {
  callNineRouterImageEdit,
  fetchNineRouterImageModels,
  getCachedImageModels,
  getImageModelName,
} from './ai.routes.js'

const RELIGHT_COOKIE_NAME = 'relight_session'
const RELIGHT_DEFAULT_LIMIT_KEY = 'relight_default_daily_limit'
const RELIGHT_IMAGE_MODEL_KEY = 'relight_standalone_image_model'
const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]{3,30}$/
const PRESET_IDS = new Set(relightPresets.map((preset) => preset.id))

export const relightSamplesDir = path.join(dataDirectory, 'relight-samples')

function getRelightOrigin(overrideOrigin) {
  return String(overrideOrigin || process.env.RELIGHT_APP_ORIGIN || 'https://relight.sibluudz.my.id').replace(/\/+$/, '')
}

function setRelightSessionCookie(res, token) {
  res.cookie(RELIGHT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: sessionDurationMs,
  })
}

function clearRelightSessionCookie(res) {
  res.clearCookie(RELIGHT_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  })
}

function getDefaultDailyLimit() {
  const parsed = Number.parseInt(getSetting(RELIGHT_DEFAULT_LIMIT_KEY, '10'), 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 10
}

function getStandaloneImageModel() {
  return String(getSetting(RELIGHT_IMAGE_MODEL_KEY, '') || '').trim()
}

function formatRelightUser(user) {
  const usageRow = db
    .prepare(
      `select count(*) as count from relight_usage_logs
       where user_id = ? and date(created_at, 'localtime') = date('now', 'localtime')`
    )
    .get(user.id)
  const usageToday = Number(usageRow?.count || 0)
  const dailyLimit = Number.isInteger(user.daily_limit) ? user.daily_limit : getDefaultDailyLimit()
  const isUnlimited = dailyLimit >= 9999
  const remaining = isUnlimited ? 9999 : Math.max(0, dailyLimit - usageToday)

  return {
    id: user.id,
    username: user.username,
    email: user.email || '',
    name: user.name || '',
    isActive: Boolean(user.is_active),
    dailyLimit,
    usageToday,
    remaining,
    isUnlimited,
    note: user.note || '',
    lastLoginAt: user.last_login_at || '',
    createdAt: user.created_at || '',
  }
}

function readRelightSessionUser(req) {
  const token = parseCookies(req.headers.cookie)[RELIGHT_COOKIE_NAME]
  if (!token) return null
  const tokenHash = hashToken(token)
  const row = db
    .prepare(
      `select u.*
       from relight_sessions s
       join relight_users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`
    )
    .get(tokenHash, Date.now())
  if (!row || row.is_active !== 1) return null
  return { user: row, tokenHash }
}

function buildSampleSummaryMap(samplesDir) {
  const rows = db.prepare('select * from relight_preset_samples').all()
  const map = new Map(rows.map((r) => [r.preset_id, r]))
  return relightPresets.map((preset) => {
    const row = map.get(preset.id)
    const ver = row?.updated_at ? `?v=${encodeURIComponent(row.updated_at)}` : ''
    const hasCustomBefore = Boolean(row?.before_filename)
    const hasCustomAfter = Boolean(row?.after_filename)
    return {
      id: preset.id,
      label: preset.label,
      description: preset.description,
      hasCustomBefore,
      hasCustomAfter,
      beforeUrl: hasCustomBefore && samplesDir ? `/api/relight/samples/${preset.id}/before${ver}` : '',
      afterUrl: hasCustomAfter && samplesDir ? `/api/relight/samples/${preset.id}/after${ver}` : '',
      updatedAt: row?.updated_at || '',
    }
  })
}

async function processSampleImageToFile(dataUri, targetPath) {
  if (typeof dataUri !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/i.test(dataUri)) {
    throw new Error('Format foto contoh harus PNG, JPG, atau WEBP.')
  }
  const encoded = dataUri.slice(dataUri.indexOf(',') + 1)
  if (encoded.length > 12 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Foto contoh tidak valid atau melebihi 8 MB.')
  }
  const inputBuffer = Buffer.from(encoded, 'base64')
  if (!inputBuffer.length || inputBuffer.length > 8 * 1024 * 1024) {
    throw new Error('Ukuran foto contoh maksimal 8 MB.')
  }
  const outputBuffer = await sharp(inputBuffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1200, height: 1500, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 88 })
    .toBuffer()

  await mkdir(path.dirname(targetPath), { recursive: true })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(targetPath, outputBuffer)
}

export function createRelightPublicRouter(deps = {}) {
  const router = Router()
  const samplesDir = deps.samplesDir || relightSamplesDir

  const requireRelightSameOrigin = (req, res, next) => {
    const origin = req.get('origin')
    const allowedOrigin = getRelightOrigin(deps.relightOrigin)
    let isAllowedLocal = false
    if (process.env.NODE_ENV !== 'production' && origin) {
      try {
        const parsed = new URL(origin)
        isAllowedLocal =
          parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
      } catch {
        isAllowedLocal = false
      }
    }
    if (origin !== allowedOrigin && !isAllowedLocal) {
      return res.status(403).json({ error: 'Permintaan lintas situs ditolak.' })
    }
    next()
  }

  const requireRelightUser = (req, res, next) => {
    const session = readRelightSessionUser(req)
    if (!session) {
      clearRelightSessionCookie(res)
      return res.status(401).json({ error: 'Silakan masuk dengan akun Relight Studio Anda.' })
    }
    req.relightUser = session.user
    req.relightSessionTokenHash = session.tokenHash
    next()
  }

  router.get('/auth/me', (req, res) => {
    const session = readRelightSessionUser(req)
    if (!session) {
      if (parseCookies(req.headers.cookie)[RELIGHT_COOKIE_NAME]) {
        clearRelightSessionCookie(res)
      }
      return res.json({ authenticated: false })
    }
    res.json({ authenticated: true, user: formatRelightUser(session.user) })
  })

  router.post('/auth/login', requireRelightSameOrigin, rateLimitAuth, async (req, res, next) => {
    try {
      const identifier = String(req.body?.identifier || '').trim().toLowerCase()
      const password = typeof req.body?.password === 'string' ? req.body.password : ''

      if (!identifier || !password) {
        return res.status(400).json({ error: 'Username/email dan kata sandi wajib diisi.' })
      }

      const user = db
        .prepare('select * from relight_users where lower(username) = ? or lower(email) = ?')
        .get(identifier, identifier)

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return res.status(401).json({ error: 'Username/email atau kata sandi salah.' })
      }

      if (user.is_active !== 1) {
        return res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan oleh administrator.' })
      }

      const token = randomBytes(32).toString('base64url')
      db.prepare('insert into relight_sessions (token_hash, user_id, expires_at) values (?, ?, ?)').run(
        hashToken(token),
        user.id,
        Date.now() + sessionDurationMs
      )
      db.prepare(`update relight_users set last_login_at = datetime('now') where id = ?`).run(user.id)
      setRelightSessionCookie(res, token)

      const freshUser = db.prepare('select * from relight_users where id = ?').get(user.id)
      res.json({ user: formatRelightUser(freshUser) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/auth/logout', requireRelightSameOrigin, (req, res) => {
    const token = parseCookies(req.headers.cookie)[RELIGHT_COOKIE_NAME]
    if (token) {
      db.prepare('delete from relight_sessions where token_hash = ?').run(hashToken(token))
    }
    clearRelightSessionCookie(res)
    res.status(204).end()
  })

  router.get('/samples/:presetId/:side', async (req, res) => {
    const { presetId, side } = req.params
    if (!PRESET_IDS.has(presetId) || !['before', 'after'].includes(side)) {
      return res.status(404).end()
    }
    const row = db
      .prepare('select before_filename, after_filename from relight_preset_samples where preset_id = ?')
      .get(presetId)
    const filename = side === 'before' ? row?.before_filename : row?.after_filename
    if (!filename || path.basename(filename) !== filename) {
      return res.status(404).end()
    }
    try {
      const content = await readFile(path.join(samplesDir, filename))
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('X-Content-Type-Options', 'nosniff')
      res.end(content)
    } catch {
      res.status(404).end()
    }
  })

  router.get('/presets', requireRelightUser, (req, res) => {
    const { apiKey } = getNineRouterConfig()
    res.json({
      configured: Boolean(apiKey),
      presets: buildSampleSummaryMap(samplesDir),
      user: formatRelightUser(req.relightUser),
    })
  })

  router.post('/process', requireRelightSameOrigin, requireRelightUser, async (req, res) => {
    try {
      const config = getNineRouterConfig()
      if (!config.apiKey) {
        return res.status(503).json({ error: 'Layanan AI 9router belum dikonfigurasi oleh admin.' })
      }

      const formatted = formatRelightUser(req.relightUser)
      if (!formatted.isUnlimited && formatted.usageToday >= formatted.dailyLimit) {
        return res.status(429).json({
          error: `Kuota harian Relight Anda (${formatted.dailyLimit} foto/hari) sudah habis. Coba lagi besok atau hubungi admin.`,
          usage: {
            usageToday: formatted.usageToday,
            dailyLimit: formatted.dailyLimit,
            remaining: 0,
          },
        })
      }

      const { sourceImage, settings = {}, instructions = '', resolution: requestedResolution } = req.body || {}
      if (requestedResolution !== undefined && !['1K', '2K', '4K'].includes(requestedResolution)) {
        return res.status(400).json({ error: 'Resolusi harus 1K, 2K, atau 4K.' })
      }
      if (typeof sourceImage !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(sourceImage)) {
        return res.status(400).json({ error: 'Unggah foto sumber PNG, JPG, atau WEBP.' })
      }
      if (typeof instructions !== 'string') {
        return res.status(400).json({ error: 'Arahan tambahan tidak valid.' })
      }

      let prompt
      try {
        prompt = buildRelightPrompt(settings, instructions, requestedResolution)
        const encoded = sourceImage.slice(sourceImage.indexOf(',') + 1)
        if (encoded.length > 8 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
          throw new Error('Foto sumber tidak valid atau melebihi 6 MB.')
        }
        const buffer = Buffer.from(encoded, 'base64')
        if (buffer.length > 6 * 1024 * 1024) {
          throw new Error('Ukuran foto maksimal 6 MB.')
        }
        const metadata = await sharp(buffer, { limitInputPixels: 40_000_000 }).metadata()
        if (!['png', 'jpeg', 'webp'].includes(metadata.format) || (metadata.pages || 1) > 1) {
          throw new Error('Gunakan satu foto PNG/JPG/WEBP statis.')
        }
      } catch (validationErr) {
        return res.status(400).json({
          error: /Pengaturan|Arahan|foto|Foto|Gunakan|Ukuran/.test(validationErr.message)
            ? validationErr.message
            : 'Foto tidak dapat dibaca. Unggah ulang PNG/JPG/WEBP yang valid (maksimal 40 megapiksel).',
        })
      }

      let activeModel = getStandaloneImageModel() || getImageModelName()
      if (!activeModel) {
        const models = deps.resolveImageModels
          ? await deps.resolveImageModels()
          : await fetchNineRouterImageModels().catch(() => getCachedImageModels())
        activeModel = models[0] || 'ag/gemini-3.1-flash-image'
      }

      const resolution = /^(ag|antigravity)\/gemini-.*image/i.test(activeModel)
        ? requestedResolution === '4K'
          ? '4K'
          : '2K'
        : requestedResolution
      const quality = /^(cx|codex)\//i.test(activeModel) ? 'high' : undefined

      const { image, model: usedModel, output, warning } = deps.callImageEdit
        ? await deps.callImageEdit({
            ...config,
            sceneImage: sourceImage,
            prompt,
            model: activeModel,
            resolution,
            quality,
          })
        : await callNineRouterImageEdit({
            sceneImage: sourceImage,
            prompt,
            model: activeModel,
            resolution,
            quality,
          })

      db.prepare(
        `insert into relight_usage_logs (id, user_id, preset, model, resolution)
         values (?, ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        req.relightUser.id,
        String(settings?.preset || 'strobist'),
        usedModel || activeModel,
        resolution || ''
      )

      const updatedUsageToday = formatted.usageToday + 1
      const remaining = formatted.isUnlimited ? 9999 : Math.max(0, formatted.dailyLimit - updatedUsageToday)

      res.json({
        image,
        model: usedModel || activeModel,
        promptVersion: RELIGHT_PROMPT_VERSION,
        output,
        ...(warning ? { warning } : {}),
        usage: {
          usageToday: updatedUsageToday,
          dailyLimit: formatted.dailyLimit,
          remaining,
        },
      })
    } catch (error) {
      console.error('Standalone Relight error:', error)
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500
      res.status(status).json({ error: error.message || 'Gagal memproses relight foto.' })
    }
  })

  return router
}

export function createRelightAdminRouter(deps = {}) {
  const router = Router()
  const samplesDir = deps.samplesDir || relightSamplesDir

  router.get('/overview', requireAdmin, (_req, res) => {
    const users = db
      .prepare(
        `select u.*,
                (select count(*) from relight_usage_logs l where l.user_id = u.id and date(l.created_at, 'localtime') = date('now', 'localtime')) as usage_today,
                (select count(*) from relight_usage_logs l where l.user_id = u.id) as usage_total
         from relight_users u
         order by u.created_at desc`
      )
      .all()
      .map((u) => {
        const usageToday = Number(u.usage_today || 0)
        const dailyLimit = Number.isInteger(u.daily_limit) ? u.daily_limit : getDefaultDailyLimit()
        return {
          id: u.id,
          username: u.username,
          email: u.email || '',
          name: u.name || '',
          isActive: Boolean(u.is_active),
          dailyLimit,
          usageToday,
          usageTotal: Number(u.usage_total || 0),
          remaining: dailyLimit >= 9999 ? 9999 : Math.max(0, dailyLimit - usageToday),
          note: u.note || '',
          lastLoginAt: u.last_login_at || '',
          createdAt: u.created_at || '',
        }
      })

    const { apiKey, baseUrl } = getNineRouterConfig()
    res.json({
      users,
      config: {
        defaultDailyLimit: getDefaultDailyLimit(),
        imageModel: getStandaloneImageModel(),
        globalImageModel: getImageModelName(),
        availableImageModels: getCachedImageModels(),
        hasApiKey: Boolean(apiKey),
        baseUrl,
        relightUrl: getRelightOrigin(deps.relightOrigin),
      },
      samples: buildSampleSummaryMap(samplesDir),
    })
  })

  router.post('/users', requireSameOrigin, requireAdmin, async (req, res, next) => {
    try {
      const rawUsername = String(req.body?.username || '').trim()
      const rawEmail = normalizeEmail(req.body?.email || '')
      const name = String(req.body?.name || '').trim().slice(0, 120)
      const password = typeof req.body?.password === 'string' ? req.body.password : ''
      const note = String(req.body?.note || '').trim().slice(0, 300)
      const isActive = req.body?.isActive === false ? 0 : 1
      const rawLimit = req.body?.dailyLimit
      const dailyLimit =
        rawLimit === undefined || rawLimit === null || rawLimit === ''
          ? getDefaultDailyLimit()
          : Number(rawLimit)

      if (!USERNAME_PATTERN.test(rawUsername)) {
        return res.status(400).json({
          error: 'Username wajib 3-30 karakter (hanya huruf, angka, titik, dash, underscore).',
        })
      }
      if (rawEmail && !isValidEmail(rawEmail)) {
        return res.status(400).json({ error: 'Format email tidak valid.' })
      }
      if (password.length < 6 || password.length > 200) {
        return res.status(400).json({ error: 'Kata sandi minimal 6 karakter.' })
      }
      if (!Number.isInteger(dailyLimit) || dailyLimit < 0 || dailyLimit > 100000) {
        return res.status(400).json({ error: 'Batas kuota harian harus berupa bilangan bulat >= 0.' })
      }

      const dupUsername = db
        .prepare('select id from relight_users where lower(username) = ?')
        .get(rawUsername.toLowerCase())
      if (dupUsername) {
        return res.status(409).json({ error: 'Username tersebut sudah digunakan di Relight Studio.' })
      }
      if (rawEmail) {
        const dupEmail = db.prepare('select id from relight_users where lower(email) = ?').get(rawEmail)
        if (dupEmail) {
          return res.status(409).json({ error: 'Email tersebut sudah terdaftar di Relight Studio.' })
        }
      }

      const id = randomUUID()
      const passwordHash = await hashPassword(password)
      db.prepare(
        `insert into relight_users (id, username, email, name, password_hash, is_active, daily_limit, note)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, rawUsername, rawEmail || null, name || rawUsername, passwordHash, isActive, dailyLimit, note)

      const created = db.prepare('select * from relight_users where id = ?').get(id)
      res.status(201).json({ user: formatRelightUser(created) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/users/:id', requireSameOrigin, requireAdmin, (req, res) => {
    const targetId = req.params.id
    const target = db.prepare('select * from relight_users where id = ?').get(targetId)
    if (!target) {
      return res.status(404).json({ error: 'User Relight tidak ditemukan.' })
    }

    const { username, email, name, dailyLimit, note, isActive } = req.body || {}
    const updates = {}

    if (typeof username === 'string') {
      const clean = username.trim()
      if (!USERNAME_PATTERN.test(clean)) {
        return res.status(400).json({
          error: 'Username wajib 3-30 karakter (hanya huruf, angka, titik, dash, underscore).',
        })
      }
      const dup = db
        .prepare('select id from relight_users where lower(username) = ? and id != ?')
        .get(clean.toLowerCase(), targetId)
      if (dup) {
        return res.status(409).json({ error: 'Username tersebut sudah dipakai akun lain.' })
      }
      updates.username = clean
    }

    if (typeof email === 'string') {
      const cleanEmail = normalizeEmail(email)
      if (cleanEmail && !isValidEmail(cleanEmail)) {
        return res.status(400).json({ error: 'Format email tidak valid.' })
      }
      if (cleanEmail) {
        const dupEmail = db
          .prepare('select id from relight_users where lower(email) = ? and id != ?')
          .get(cleanEmail, targetId)
        if (dupEmail) {
          return res.status(409).json({ error: 'Email tersebut sudah dipakai akun lain.' })
        }
      }
      updates.email = cleanEmail || null
    }

    if (typeof name === 'string') {
      updates.name = name.trim().slice(0, 120)
    }
    if (typeof note === 'string') {
      updates.note = note.trim().slice(0, 300)
    }
    if (dailyLimit !== undefined) {
      const parsed = Number(dailyLimit)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
        return res.status(400).json({ error: 'Batas kuota harian harus bilangan bulat >= 0.' })
      }
      updates.daily_limit = parsed
    }
    if (typeof isActive === 'boolean') {
      updates.is_active = isActive ? 1 : 0
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'Tidak ada perubahan yang dikirim.' })
    }

    const assignments = Object.keys(updates)
      .map((field) => `${field} = @${field}`)
      .join(', ')
    db.prepare(`update relight_users set ${assignments}, updated_at = datetime('now') where id = @id`).run({
      ...updates,
      id: targetId,
    })

    if (updates.is_active === 0) {
      db.prepare('delete from relight_sessions where user_id = ?').run(targetId)
    }

    const updated = db.prepare('select * from relight_users where id = ?').get(targetId)
    res.json({ user: formatRelightUser(updated) })
  })

  router.post('/users/:id/reset-password', requireSameOrigin, requireAdmin, async (req, res, next) => {
    try {
      const targetId = req.params.id
      const target = db.prepare('select * from relight_users where id = ?').get(targetId)
      if (!target) {
        return res.status(404).json({ error: 'User Relight tidak ditemukan.' })
      }

      const newPassword = typeof req.body?.password === 'string' ? req.body.password : ''
      if (newPassword.length < 6 || newPassword.length > 200) {
        return res.status(400).json({ error: 'Kata sandi baru minimal 6 karakter.' })
      }

      const passwordHash = await hashPassword(newPassword)
      db.prepare(`update relight_users set password_hash = ?, updated_at = datetime('now') where id = ?`).run(
        passwordHash,
        targetId
      )
      db.prepare('delete from relight_sessions where user_id = ?').run(targetId)

      res.json({ success: true, message: `Kata sandi untuk @${target.username} berhasil diperbarui.` })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/users/:id', requireSameOrigin, requireAdmin, (req, res) => {
    const targetId = req.params.id
    const target = db.prepare('select id from relight_users where id = ?').get(targetId)
    if (!target) {
      return res.status(404).json({ error: 'User Relight tidak ditemukan.' })
    }
    db.prepare('delete from relight_users where id = ?').run(targetId)
    res.status(204).end()
  })

  router.post('/config', requireSameOrigin, requireAdmin, (req, res) => {
    const { defaultDailyLimit, imageModel } = req.body || {}
    if (defaultDailyLimit !== undefined) {
      const parsed = Number(defaultDailyLimit)
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100000) {
        return res.status(400).json({ error: 'Kuota harian default harus bilangan bulat >= 0.' })
      }
      setSetting(RELIGHT_DEFAULT_LIMIT_KEY, String(parsed))
    }
    if (typeof imageModel === 'string') {
      setSetting(RELIGHT_IMAGE_MODEL_KEY, imageModel.trim())
    }
    res.json({
      success: true,
      config: {
        defaultDailyLimit: getDefaultDailyLimit(),
        imageModel: getStandaloneImageModel(),
        globalImageModel: getImageModelName(),
      },
    })
  })

  router.put('/samples/:presetId', requireSameOrigin, requireAdmin, async (req, res) => {
    const { presetId } = req.params
    if (!PRESET_IDS.has(presetId)) {
      return res.status(404).json({ error: 'Preset tidak dikenali.' })
    }

    const { beforeImage, afterImage } = req.body || {}
    if (!beforeImage && !afterImage) {
      return res.status(400).json({ error: 'Unggah minimal satu foto Before atau After.' })
    }

    const existing = db
      .prepare('select before_filename, after_filename from relight_preset_samples where preset_id = ?')
      .get(presetId)
    let beforeFilename = existing?.before_filename || ''
    let afterFilename = existing?.after_filename || ''

    try {
      if (beforeImage) {
        beforeFilename = `${presetId}-before.jpg`
        await processSampleImageToFile(beforeImage, path.join(samplesDir, beforeFilename))
      }
      if (afterImage) {
        afterFilename = `${presetId}-after.jpg`
        await processSampleImageToFile(afterImage, path.join(samplesDir, afterFilename))
      }
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Gagal memproses foto contoh.' })
    }

    db.prepare(
      `insert into relight_preset_samples (preset_id, before_filename, after_filename, updated_at)
       values (?, ?, ?, datetime('now'))
       on conflict(preset_id) do update set
         before_filename = excluded.before_filename,
         after_filename = excluded.after_filename,
         updated_at = datetime('now')`
    ).run(presetId, beforeFilename, afterFilename)

    const sample = buildSampleSummaryMap(samplesDir).find((item) => item.id === presetId)
    res.json({ sample })
  })

  router.delete('/samples/:presetId', requireSameOrigin, requireAdmin, async (req, res) => {
    const { presetId } = req.params
    if (!PRESET_IDS.has(presetId)) {
      return res.status(404).json({ error: 'Preset tidak dikenali.' })
    }
    const existing = db
      .prepare('select before_filename, after_filename from relight_preset_samples where preset_id = ?')
      .get(presetId)
    for (const filename of [existing?.before_filename, existing?.after_filename]) {
      if (filename && path.basename(filename) === filename) {
        await unlink(path.join(samplesDir, filename)).catch(() => {})
      }
    }
    db.prepare('delete from relight_preset_samples where preset_id = ?').run(presetId)
    res.status(204).end()
  })

  return router
}

export const relightPublicRouter = createRelightPublicRouter()
export const relightAdminRouter = createRelightAdminRouter()
