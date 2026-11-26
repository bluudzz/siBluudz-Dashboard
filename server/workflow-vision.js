import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { db, getNineRouterConfig } from './db.js'
import { resolveValue } from '../shared/workflow-engine.js'
import { loadSourceImage } from './workflow-image-edit.js'

const MAX_ITEMS = 10
const DEFAULT_VISION_MODEL = 'ag/gemini-3.8-flash'

function parseVisionQa(rawText) {
  const cleaned = String(rawText || '').trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced ? fenced[1].trim() : cleaned
  const tryParse = str => {
    try { return JSON.parse(str) } catch { return null }
  }
  let parsed = tryParse(candidate)
  if (!parsed) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) parsed = tryParse(candidate.slice(start, end + 1))
  }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const passed = typeof parsed.passed === 'boolean' ? parsed.passed : true
    const score = typeof parsed.score === 'number' && Number.isFinite(parsed.score) ? parsed.score : null
    const summary = typeof parsed.summary === 'string' && parsed.summary.trim() ? parsed.summary.trim() : cleaned
    const issues = Array.isArray(parsed.issues) ? parsed.issues.map(item => String(item)) : []
    return { passed, score, summary, issues }
  }
  return { passed: true, score: null, summary: cleaned, issues: [] }
}

export async function runVisionNode({ node, input }, user, { fetchImpl = fetch, signal } = {}) {
  if (input.length > MAX_ITEMS) throw new Error('Analisis Gambar (Vision) menerima maksimal 10 item per pengujian.')
  const config = getNineRouterConfig()
  if (!config.apiKey) throw new Error('Hubungkan API Key 9router sebelum menggunakan Analisis Gambar.')
  const model = String(node.data.model || config.model || DEFAULT_VISION_MODEL).trim()
  if (!model) throw new Error('Pilih model AI untuk Analisis Gambar.')
  const qaMode = node.data.qaMode !== false
  const tier = user.tier || (user.role === 'admin' ? 'pro' : 'free')
  const limit = user.ai_daily_limit ?? (tier === 'pro' ? config.proDailyLimit : config.freeDailyLimit)
  const base = config.baseUrl.replace(/\/chat\/completions\/?$/, '').replace(/\/+$/, '')

  const output = []
  for (const item of input) {
    const count = db.prepare("select count(*) as count from ai_usage_logs where user_id=? and date(created_at,'localtime')=date('now','localtime')").get(user.id).count
    if (user.role !== 'admin' && count >= limit) throw new Error('Kuota AI harian habis. Periksa pengaturan akun Anda.')
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')

    const source = await loadSourceImage(user.id, item.json, '', { fetchImpl, signal })
    const jpeg = await sharp(source.buffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer()
    const dataUri = `data:image/jpeg;base64,${jpeg.toString('base64')}`

    const basePrompt = String(node.data.prompt || '').trim()
      ? String(resolveValue(node.data.prompt, item.json)).trim()
      : 'Analisis gambar ini, nilai kualitas visualnya, dan periksa apakah ada teks cacat atau objek aneh.'
    if (basePrompt.length > 4000) throw new Error('Instruksi analisis gambar maksimal 4.000 karakter.')

    const fullPrompt = qaMode
      ? `${basePrompt}\n\nBalas HANYA dengan JSON valid tanpa markdown: {"passed": true/false, "score": 1-10, "summary": "ringkasan singkat dalam Bahasa Indonesia", "issues": ["daftar masalah bila ada"]}`
      : basePrompt

    const response = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: [{ type: 'text', text: fullPrompt }, { type: 'image_url', image_url: { url: dataUri } }] }],
        stream: false,
      }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    })
    const raw = await response.text()
    let body
    try { body = JSON.parse(raw) } catch { throw new Error(`Respons AI Vision tidak valid (${response.status}).`) }
    if (!response.ok) throw new Error(`9router Vision (${response.status}): ${String(body?.error?.message || body?.message || 'Gagal menganalisis gambar.').slice(0, 300)}`)

    const content = body?.choices?.[0]?.message?.content
    const textReply = typeof content === 'string'
      ? content.trim()
      : Array.isArray(content)
        ? content.filter(part => part?.type === 'text').map(part => String(part.text || '')).join('\n').trim()
        : ''
    if (!textReply) throw new Error('Model Vision mengembalikan jawaban kosong.')

    db.prepare('insert into ai_usage_logs (id,user_id,prompt_tokens,completion_tokens,model,type) values (?,?,?,?,?,?)').run(
      randomUUID(),
      user.id,
      Number(body.usage?.prompt_tokens || 0),
      Number(body.usage?.completion_tokens || 0),
      model,
      'workflow_vision',
    )

    const parsed = qaMode ? parseVisionQa(textReply) : { passed: true, score: null, summary: textReply, issues: [] }
    output.push({
      json: {
        ...item.json,
        output: parsed.summary,
        prompt: parsed.summary,
        visionPassed: parsed.passed,
        visionScore: parsed.score,
        visionSummary: parsed.summary,
        visionIssues: parsed.issues,
        visionModel: model,
      },
    })
  }
  return output
}
