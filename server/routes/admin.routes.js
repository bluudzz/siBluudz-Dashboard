import { Router } from 'express'
import { db, getSetting, setSetting, getNineRouterConfig } from '../db.js'
import { requireSameOrigin, requireAdmin, userResponse, hashPassword } from '../middleware/auth.js'
import { fetchNineRouterModels, callNineRouterChat } from './ai.routes.js'

const router = Router()

router.get('/users', requireAdmin, (_req, res) => {
  const users = db.prepare(`
    select u.id, u.email, u.username, u.name, u.company, u.phone, u.role, u.tier, u.ai_daily_limit, u.created_at,
           (select count(*) from invoices i where i.user_id = u.id) as invoice_count,
           (select count(*) from ai_usage_logs a where a.user_id = u.id and date(a.created_at, 'localtime') = date('now', 'localtime')) as ai_usage_today
    from users u
    order by u.created_at desc
  `).all()

  const { freeDailyLimit, proDailyLimit } = getNineRouterConfig()
  const formatted = users.map((u) => {
    const defaultLimit = u.role === 'admin' ? 9999 : (u.tier === 'pro' ? proDailyLimit : freeDailyLimit)
    return {
      id: u.id,
      email: u.email,
      username: u.username || '',
      name: u.name,
      company: u.company,
      phone: u.phone,
      role: u.role,
      tier: u.tier || (u.role === 'admin' ? 'pro' : 'free'),
      aiDailyLimit: u.ai_daily_limit != null ? u.ai_daily_limit : defaultLimit,
      aiDailyLimitCustom: u.ai_daily_limit,
      aiUsageToday: u.ai_usage_today || 0,
      invoiceCount: u.invoice_count || 0,
      createdAt: u.created_at,
    }
  })
  res.json({ users: formatted })
})

router.patch('/users/:id', requireSameOrigin, requireAdmin, (req, res) => {
  const targetId = req.params.id
  const targetUser = db.prepare('select * from users where id = ?').get(targetId)
  if (!targetUser) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })

  const { role, tier, aiDailyLimit, name, company, username } = req.body || {}
  const updates = {}

  if (typeof username === 'string') {
    const rawUsername = username.trim()
    if (rawUsername === '') {
      updates.username = null
    } else {
      if (!/^[a-zA-Z0-9_.-]{3,30}$/.test(rawUsername)) {
        return res.status(400).json({ error: 'Username harus 3-30 karakter (hanya huruf, angka, titik, dash, underscore).' })
      }
      const existing = db.prepare('select id from users where lower(username) = ? and id != ?').get(rawUsername.toLowerCase(), targetId)
      if (existing) {
        return res.status(409).json({ error: 'Username tersebut sudah digunakan oleh akun lain.' })
      }
      updates.username = rawUsername
    }
  }

  if (typeof role === 'string' && ['admin', 'user'].includes(role)) {
    if (targetUser.role === 'admin' && role !== 'admin') {
      const adminCount = db.prepare("select count(*) as count from users where role = 'admin'").get().count
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Tidak dapat mendowngrade: Minimal harus ada 1 administrator di sistem.' })
      }
    }
    updates.role = role
  }

  if (typeof tier === 'string' && ['free', 'pro'].includes(tier)) {
    updates.tier = tier
  }

  if (aiDailyLimit === null || aiDailyLimit === '') {
    updates.ai_daily_limit = null
  } else if (Number.isInteger(Number(aiDailyLimit)) && Number(aiDailyLimit) >= 0) {
    updates.ai_daily_limit = Number(aiDailyLimit)
  }

  if (typeof name === 'string') updates.name = name.trim().slice(0, 120)
  if (typeof company === 'string') updates.company = company.trim().slice(0, 120)

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Tidak ada data perubahan yang valid.' })
  }

  const assignments = Object.keys(updates).map((f) => `${f} = @${f}`).join(', ')
  db.prepare(`update users set ${assignments}, updated_at = datetime('now') where id = @id`)
    .run({ ...updates, id: targetId })

  const updatedUser = db.prepare('select * from users where id = ?').get(targetId)
  res.json({ user: userResponse(updatedUser) })
})

router.delete('/users/:id', requireSameOrigin, requireAdmin, (req, res) => {
  const targetId = req.params.id
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'Anda tidak dapat menghapus akun Anda sendiri.' })
  }
  const targetUser = db.prepare('select * from users where id = ?').get(targetId)
  if (!targetUser) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })

  const transaction = db.transaction(() => {
    db.prepare('delete from sessions where user_id = ?').run(targetId)
    db.prepare('delete from invoices where user_id = ?').run(targetId)
    db.prepare('delete from ai_usage_logs where user_id = ?').run(targetId)
    db.prepare('delete from ai_history where user_id = ?').run(targetId)
    db.prepare('delete from users where id = ?').run(targetId)
  })
  transaction()

  res.status(204).end()
})

router.post('/users/:id/reset-password', requireSameOrigin, requireAdmin, async (req, res, next) => {
  try {
    const targetId = req.params.id
    const newPassword = req.body?.password
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter.' })
    }
    const targetUser = db.prepare('select * from users where id = ?').get(targetId)
    if (!targetUser) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' })

    const passwordHash = await hashPassword(newPassword)
    db.prepare(`update users set password_hash = ?, updated_at = datetime('now') where id = ?`)
      .run(passwordHash, targetId)

    db.prepare('delete from sessions where user_id = ?').run(targetId)

    res.json({ success: true, message: `Kata sandi untuk ${targetUser.email} berhasil diperbarui.` })
  } catch (error) {
    next(error)
  }
})

router.get('/ai-settings', requireAdmin, (_req, res) => {
  const { baseUrl, apiKey, model, freeDailyLimit, proDailyLimit } = getNineRouterConfig()
  let availableModels = []
  try {
    availableModels = JSON.parse(getSetting('ninerouter_available_models', '[]'))
  } catch {}

  res.json({
    baseUrl,
    model,
    freeDailyLimit,
    proDailyLimit,
    hasApiKey: Boolean(apiKey),
    apiKeyMasked: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : '',
    availableModels,
  })
})

router.post('/ai-settings', requireSameOrigin, requireAdmin, (req, res) => {
  const { baseUrl, apiKey, model, freeDailyLimit, proDailyLimit, availableModels } = req.body || {}

  if (typeof baseUrl === 'string' && baseUrl.trim()) {
    setSetting('ninerouter_base_url', baseUrl.trim())
  }
  if (typeof apiKey === 'string' && apiKey.trim()) {
    setSetting('ninerouter_api_key', apiKey.trim())
  }
  if (typeof model === 'string' && model.trim()) {
    setSetting('ninerouter_model', model.trim())
  }
  if (Number.isInteger(Number(freeDailyLimit)) && Number(freeDailyLimit) >= 0) {
    setSetting('free_ai_daily_limit', String(freeDailyLimit))
  }
  if (Number.isInteger(Number(proDailyLimit)) && Number(proDailyLimit) >= 0) {
    setSetting('pro_ai_daily_limit', String(proDailyLimit))
  }
  if (Array.isArray(availableModels) && availableModels.length > 0) {
    setSetting('ninerouter_available_models', JSON.stringify(availableModels))
  }

  const updated = getNineRouterConfig()
  let savedModels = []
  try {
    savedModels = JSON.parse(getSetting('ninerouter_available_models', '[]'))
  } catch {}

  res.json({
    success: true,
    message: 'Pengaturan 9router berhasil disimpan.',
    config: {
      baseUrl: updated.baseUrl,
      model: updated.model,
      freeDailyLimit: updated.freeDailyLimit,
      proDailyLimit: updated.proDailyLimit,
      hasApiKey: Boolean(updated.apiKey),
      availableModels: savedModels,
    },
  })
})

router.post('/fetch-models', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const config = getNineRouterConfig()
    const baseUrl = req.body?.baseUrl?.trim() || config.baseUrl
    const apiKey = req.body?.apiKey?.trim() || config.apiKey

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API Key 9router belum disetel.' })
    }

    const models = await fetchNineRouterModels(baseUrl, apiKey)
    res.json({
      success: true,
      message: `Berhasil mendeteksi ${models.length} model.`,
      models,
      count: models.length,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Gagal mengambil daftar model dari 9router.',
    })
  }
})

router.post('/test-9router', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const config = getNineRouterConfig()
    const baseUrl = req.body?.baseUrl?.trim() || config.baseUrl
    const apiKey = req.body?.apiKey?.trim() || config.apiKey
    let model = req.body?.model?.trim() || config.model

    if (!apiKey) {
      return res.status(400).json({ success: false, error: 'API Key 9router belum disetel.' })
    }

    const response = await callNineRouterChat({
      messages: [{ role: 'user', content: 'Katakan "OK" jika endpoint terhubung.' }],
      maxTokens: 10,
      baseUrl,
      apiKey,
      model,
    })
    const reply = response?.choices?.[0]?.message?.content || 'OK'

    let detectedModels = []
    try {
      detectedModels = await fetchNineRouterModels(baseUrl, apiKey)
    } catch (modelErr) {
      console.warn('Auto-fetch models during test:', modelErr.message)
    }

    res.json({
      success: true,
      message: 'Koneksi ke 9router berhasil!',
      reply,
      model: response?.model || model,
      availableModels: detectedModels,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Gagal menghubungi 9router.',
    })
  }
})

export default router
