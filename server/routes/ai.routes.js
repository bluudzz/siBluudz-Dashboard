import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db, getSetting, setSetting, getNineRouterConfig } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'

const router = Router()

export function getModelsEndpoint(baseUrl) {
  let cleanUrl = baseUrl.replace(/\/+$/, '')
  if (cleanUrl.endsWith('/chat/completions')) {
    cleanUrl = cleanUrl.replace(/\/chat\/completions$/, '')
  }
  return `${cleanUrl}/models`
}

export async function fetchNineRouterModels(customBaseUrl, customApiKey) {
  const config = getNineRouterConfig()
  const baseUrl = (customBaseUrl || config.baseUrl || 'https://api.9router.com/v1').replace(/\/+$/, '')
  const apiKey = customApiKey || config.apiKey

  if (!apiKey) {
    throw new Error('API Key 9router belum disetel.')
  }

  const endpoint = getModelsEndpoint(baseUrl)
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let parsed
    try { parsed = JSON.parse(errorText) } catch { parsed = null }
    const errMsg = parsed?.error?.message || parsed?.message || errorText || `HTTP ${response.status}`
    throw new Error(`Gagal mendeteksi model (${response.status}): ${errMsg}`)
  }

  const json = await response.json()
  let list = []
  if (Array.isArray(json?.data)) {
    list = json.data.map((m) => (typeof m === 'string' ? m : m?.id || m?.name || m?.model)).filter(Boolean)
  } else if (Array.isArray(json?.models)) {
    list = json.models.map((m) => (typeof m === 'string' ? m : m?.id || m?.name || m?.model)).filter(Boolean)
  } else if (Array.isArray(json)) {
    list = json.map((m) => (typeof m === 'string' ? m : m?.id || m?.name || m?.model)).filter(Boolean)
  }

  const uniqueModels = Array.from(new Set(list)).sort()
  if (uniqueModels.length > 0) {
    setSetting('ninerouter_available_models', JSON.stringify(uniqueModels))
  }
  return uniqueModels
}

export async function callNineRouterChat({ messages, temperature = 0.7, maxTokens = 2000, model: customModel, baseUrl: customBaseUrl, apiKey: customApiKey }) {
  const config = getNineRouterConfig()
  const baseUrl = (customBaseUrl || config.baseUrl || 'https://api.9router.com/v1').replace(/\/+$/, '')
  const apiKey = customApiKey || config.apiKey
  const modelToUse = customModel || config.model

  if (!modelToUse) {
    throw new Error('Model AI belum dipilih. Silakan hubungkan 9router dan pilih model yang tersedia di panel Admin.')
  }

  if (!apiKey) {
    throw new Error('API Key 9router belum dikonfigurasi. Silakan atur di menu Pengaturan Admin.')
  }

  const endpoint = baseUrl.endsWith('/chat/completions') ? baseUrl : `${baseUrl}/chat/completions`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelToUse,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: false,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    let parsed
    try { parsed = JSON.parse(errorText) } catch { parsed = null }
    const errMsg = parsed?.error?.message || parsed?.message || errorText || `HTTP ${response.status}`
    throw new Error(`9router error (${response.status}): ${errMsg}`)
  }

  const resText = await response.text()
  let data
  try {
    data = JSON.parse(resText)
  } catch {
    const lines = resText.split('\n').filter((l) => l.startsWith('data: ') && !l.includes('[DONE]'))
    if (lines.length > 0) {
      const lineJson = lines[lines.length - 1].replace(/^data:\s*/, '')
      data = JSON.parse(lineJson)
    } else {
      throw new Error(`Respon 9router bukan JSON yang valid: ${resText.slice(0, 100)}`)
    }
  }

  return data
}

// Endpoints
router.get('/status', requireUser, (req, res) => {
  const { baseUrl, apiKey, model, freeDailyLimit, proDailyLimit } = getNineRouterConfig()
  const todayRow = db.prepare(`
    select count(*) as count from ai_usage_logs
    where user_id = ? and date(created_at, 'localtime') = date('now', 'localtime')
  `).get(req.user.id)
  const usageToday = todayRow?.count || 0

  const userTier = req.user.tier || (req.user.role === 'admin' ? 'pro' : 'free')
  const defaultLimit = req.user.role === 'admin' ? 9999 : (userTier === 'pro' ? proDailyLimit : freeDailyLimit)
  const dailyLimit = req.user.ai_daily_limit != null ? req.user.ai_daily_limit : defaultLimit
  const remaining = Math.max(0, dailyLimit - usageToday)

  let availableModels = []
  try {
    availableModels = JSON.parse(getSetting('ninerouter_available_models', '[]'))
  } catch {}

  res.json({
    configured: Boolean(apiKey && model),
    model,
    baseUrl,
    tier: userTier,
    role: req.user.role,
    dailyLimit,
    usageToday,
    remaining,
    isUnlimited: req.user.role === 'admin' || dailyLimit >= 9999,
    availableModels,
  })
})

router.post('/generate', requireSameOrigin, requireUser, async (req, res) => {
  try {
    const { apiKey, model, freeDailyLimit, proDailyLimit } = getNineRouterConfig()
    if (!apiKey) {
      return res.status(503).json({
        error: '9router belum dikonfigurasi. Masukkan API Key di panel Kelola Pengguna & AI (khusus Admin).',
      })
    }

    const todayRow = db.prepare(`
      select count(*) as count from ai_usage_logs
      where user_id = ? and date(created_at, 'localtime') = date('now', 'localtime')
    `).get(req.user.id)
    const usageToday = todayRow?.count || 0

    const userTier = req.user.tier || (req.user.role === 'admin' ? 'pro' : 'free')
    const defaultLimit = req.user.role === 'admin' ? 9999 : (userTier === 'pro' ? proDailyLimit : freeDailyLimit)
    const dailyLimit = req.user.ai_daily_limit != null ? req.user.ai_daily_limit : defaultLimit

    if (req.user.role !== 'admin' && dailyLimit < 9999 && usageToday >= dailyLimit) {
      return res.status(429).json({
        error: `Batas kuota harian AI (${dailyLimit} permintaan/hari) untuk akun ${userTier.toUpperCase()} Anda telah tercapai. Hubungi administrator untuk upgrade ke Pro.`,
        usageToday,
        dailyLimit,
        tier: userTier,
      })
    }

    const { prompt, context, type = 'prompt_builder', model: requestedModel } = req.body || {}
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({ error: 'Prompt atau instruksi wajib diisi.' })
    }

    const activeModel = (typeof requestedModel === 'string' && requestedModel.trim())
      ? requestedModel.trim()
      : (model || 'gpt-4o-mini')

    let systemPrompt = 'Anda adalah asisten AI profesional untuk sistem penagihan, prompt engineering, dan produktivitas siBluudz Dashboard.'
    if (type === 'invoice_items') {
      systemPrompt += ' Format output WAJIB menyertakan blok kode JSON yang valid dengan format array items: [{ "description": string, "quantity": number, "price": number, "total": number }] disertai rincian penjelasan singkat.'
    } else if (type === 'proposal_structure') {
      systemPrompt += ' Buat struktur outline dokumen penawaran harga atau lingkup kerja (scope of work) profesional yang terorganisir rapi dengan poin-poin jelas.'
    } else if (type === 'follow_up_message') {
      systemPrompt += ' Buat pesan ramah namun tegas untuk penagihan invoice atau komunikasi klien, siap dikirim via WhatsApp maupun Email.'
    } else if (type === 'prompt_builder') {
      systemPrompt = 'Anda adalah pakar Prompt Engineering terkemuka untuk LLM (ChatGPT, Claude 3.5, Gemini 1.5, DeepSeek). Rancang Master Prompt yang komprehensif, presisi, dan terstruktur rapi dengan metode industri: Role/Persona, Objective, Context, Constraints, Step-by-Step Instructions, Examples, dan Output Format yang siap langsung di-copy dan digunakan.'
    } else if (type === 'image_prompt') {
      systemPrompt = 'Anda adalah Prompt Engineer spesialis AI Image Generation (Midjourney v6, Flux.1, Stable Diffusion XL, DALL-E 3). Ubah ide pengguna menjadi prompt gambar sinematik yang sangat detail dan kaya deskriptor visual (subjek utama, komposisi, pencahayaan, lensa kamera, palet warna, render style). Format output: 1) **Main Prompt** (Bahasa Inggris, siap copy), 2) **Negative Prompt**, 3) **Parameters & Flags** (contoh: --ar 16:9 --v 6.0), 4) **Tips Optimasi**.'
    } else if (type === 'video_prompt') {
      systemPrompt = 'Anda adalah Sutradara & AI Video Prompt Specialist untuk Runway Gen-3 Alpha, Kling AI, Luma Dream Machine, Pika, dan Sora. Buat deskripsi adegan video sinematik dengan camera motion dinamis (dolly, pan, tracking, orbit), subject action yang koheren, lighting atmosferik, dan pacing visual. Format output: 1) **Cinematic Video Prompt** (siap copy), 2) **Camera & Motion Direction**, 3) **Lighting & Mood Atmosphere**.'
    } else if (type === 'prompt_optimizer') {
      systemPrompt = 'Anda adalah AI Prompt Optimizer & Refiner. Analisis prompt dari pengguna, hilangkan ambiguitas, dan sempurnakan menjadi prompt tingkat lanjut dengan ketajaman instruksi tinggi. Format output: 1) **Optimized Prompt** (Versi final terbaik siap copy), 2) **Peningkatan Kunci** (daftar perbaikan yang dilakukan: konteks, batasan, format output).'
    } else if (type === 'prompt_checker') {
      systemPrompt = 'Anda adalah AI Prompt Quality Evaluator & Auditor. Analisis prompt pengguna secara objektif: 1) **Skor Kualitas** (Beri nilai 0-100 untuk Kejelasan, Spesifisitas, dan Batasan), 2) **Analisis Kelebihan & Celah Kelemahan**, 3) **Rekomendasi Perbaikan**, 4) **Versi Sempurna yang Disarankan** (siap copy).'
    } else if (type === 'humanizer') {
      systemPrompt = 'Anda adalah Editor Teks Profesional. Tulis ulang teks yang kaku atau tampak seperti buatan AI menjadi tulisan manusia yang mengalir alami, memiliki variasi ritme kalimat yang hidup, hangat, dan tanpa kata-kata klise generik AI (hindari: "delve", "testament", "tapestry", dll). Pertahankan makna inti namun buat sangat nyaman dibaca.'
    } else if (type === 'website_prompt') {
      systemPrompt = 'Anda adalah Senior Software Architect & Lead UI/UX Engineer. Buat prompt spesifikasi teknis dan arsitektur komprehensif untuk AI Coding Assistant (Cursor, Claude Artifacts, v0.dev, Bolt.new, Lovable). Rincikan: Tech Stack, Komponen UI & Layout, State Management, User Flows, serta Prompt Eksekusi siap copy.'
    }

    const messages = [{ role: 'system', content: systemPrompt }]

    if (context) {
      const contextStr = typeof context === 'string' ? context : JSON.stringify(context, null, 2)
      messages.push({
        role: 'user',
        content: `Berikut adalah konteks data yang tersedia:\n\`\`\`json\n${contextStr.slice(0, 8000)}\n\`\`\``,
      })
    }

    messages.push({ role: 'user', content: prompt.trim() })

    const completion = await callNineRouterChat({ messages, model: activeModel })
    const reply = completion?.choices?.[0]?.message?.content || ''
    const promptTokens = completion?.usage?.prompt_tokens || 0
    const completionTokens = completion?.usage?.completion_tokens || 0

    const logId = randomUUID()
    db.prepare(`
      insert into ai_usage_logs (id, user_id, prompt_tokens, completion_tokens, model, type)
      values (?, ?, ?, ?, ?, ?)
    `).run(logId, req.user.id, promptTokens, completionTokens, activeModel, type)

    const historyId = randomUUID()
    db.prepare(`
      insert into ai_history (id, user_id, type, model, prompt, result)
      values (?, ?, ?, ?, ?, ?)
    `).run(historyId, req.user.id, type, activeModel, prompt.trim(), reply)

    const updatedUsageToday = usageToday + 1
    const remaining = Math.max(0, dailyLimit - updatedUsageToday)

    res.json({
      id: historyId,
      result: reply,
      model: activeModel,
      usage: {
        usageToday: updatedUsageToday,
        dailyLimit,
        remaining,
        tier: userTier,
      },
    })
  } catch (error) {
    console.error('AI Generation error:', error)
    res.status(500).json({
      error: error.message || 'Terjadi kesalahan saat memproses permintaan AI.',
    })
  }
})

router.get('/history', requireUser, (req, res) => {
  const history = db.prepare(`
    select id, type, model, prompt, result, created_at as createdAt
    from ai_history
    where user_id = ?
    order by created_at desc
    limit 60
  `).all(req.user.id)
  res.json({ history })
})

router.delete('/history/:id', requireSameOrigin, requireUser, (req, res) => {
  db.prepare('delete from ai_history where user_id = ? and id = ?')
    .run(req.user.id, req.params.id)
  res.status(204).end()
})

router.delete('/history', requireSameOrigin, requireUser, (req, res) => {
  db.prepare('delete from ai_history where user_id = ?').run(req.user.id)
  res.status(204).end()
})

export default router
