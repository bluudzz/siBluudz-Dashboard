export const PROMPT_CHECKER_GOALS = [
  { id: 'general', label: 'Umum', guidance: 'Tugas umum asisten AI' },
  { id: 'coding', label: 'Coding / Agent', guidance: 'Spesifikasi kode, arsitektur, atau eksekusi agent' },
  { id: 'writing', label: 'Penulisan', guidance: 'Copywriting, artikel, email, atau naskah' },
  { id: 'analysis', label: 'Analisis', guidance: 'Riset, evaluasi data, atau pengambilan keputusan' },
  { id: 'image', label: 'Visual', guidance: 'Prompt pembuatan atau pengeditan gambar' },
]

export const PROMPT_CHECKER_FOCUSES = [
  { id: 'clarity', label: 'Kejelasan' },
  { id: 'anti_hallucination', label: 'Anti-halusinasi' },
  { id: 'output_format', label: 'Format output' },
  { id: 'token_efficiency', label: 'Efisiensi token' },
  { id: 'strict_constraints', label: 'Batasan ketat' },
]

const CONTEXT_RE =
  /\b(sebagai|untuk|audiens|konteks|proyek|peran|pengguna|target|act as|context|role|for|react|website|aplikasi|produk|tim|bisnis|klien|stakeholder|sistem|server|database)\b/i
const TASK_RE =
  /\b(buat|susun|evaluasi|analisis|tulis|jelaskan|ubah|perbaiki|bandingkan|rancang|audit|cari|ringkas|create|build|write|analyze|review|explain|generate|refactor|design|implement|debug)\b/i
const FORMAT_RE =
  /\b(format|json|markdown|tabel|poin|daftar|list|bullet|langkah|step|struktur|paragraf|kode|code|yaml|csv|ringkas|singkat|bagian|schema|typescript|html)\b/i
const CONSTRAINT_RE =
  /\b(jangan|hindari|tanpa|maksimal|minimal|maks|min|wajib|harus|batasan|kecuali|prioritas|hanya|stop|avoid|never|must|only|limit|without|max|min|strict|pertahankan|dilarang)\b/i

export function analyzePromptLocally(text = '') {
  const source = typeof text === 'string' ? text : ''
  const trimmed = source.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  const approxTokens = words ? Math.max(1, Math.ceil(words * 1.35)) : 0

  const checks = [
    {
      id: 'context',
      label: 'Konteks & peran',
      passed: words >= 12 || CONTEXT_RE.test(trimmed),
    },
    {
      id: 'task',
      label: 'Tugas spesifik',
      passed: words >= 5 && TASK_RE.test(trimmed),
    },
    {
      id: 'format',
      label: 'Format output',
      passed: FORMAT_RE.test(trimmed),
    },
    {
      id: 'constraints',
      label: 'Batasan',
      passed: CONSTRAINT_RE.test(trimmed),
    },
  ]

  const passedCount = checks.filter((item) => item.passed).length

  return {
    chars: source.length,
    words,
    approxTokens,
    passedCount,
    totalChecks: checks.length,
    checks,
  }
}

export function buildCheckerPrompt(prompt = '', options = {}) {
  const trimmed = typeof prompt === 'string' ? prompt.trim() : ''
  if (!trimmed) return ''

  const { goal = 'general', focuses = [], extraCriteria = '' } = options || {}
  const goalEntry = PROMPT_CHECKER_GOALS.find((item) => item.id === goal)
  const focusLabels = Array.isArray(focuses)
    ? focuses
        .map((id) => PROMPT_CHECKER_FOCUSES.find((item) => item.id === id)?.label)
        .filter(Boolean)
    : []
  const criteria = typeof extraCriteria === 'string' ? extraCriteria.trim() : ''

  const meta = []
  if (goalEntry && goalEntry.id !== 'general') {
    meta.push(`Tujuan prompt: ${goalEntry.label} (${goalEntry.guidance})`)
  }
  if (focusLabels.length > 0) {
    meta.push(`Fokus audit: ${focusLabels.join(', ')}`)
  }
  if (criteria) {
    meta.push(`Kriteria tambahan: ${criteria}`)
  }

  return meta.length > 0 ? `${trimmed}\n\n${meta.join('\n')}` : trimmed
}

function clampScore(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  return Math.min(100, Math.max(0, Math.round(num)))
}

function normalizeStringArray(value, limit = 8) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeIssues(value, limit = 8) {
  if (!Array.isArray(value)) return []
  const allowedSeverities = new Set(['high', 'medium', 'low'])
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const title = item.trim()
        return title ? { title, detail: '', severity: 'medium' } : null
      }
      if (!item || typeof item !== 'object') return null
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const detail = typeof item.detail === 'string' ? item.detail.trim() : ''
      if (!title && !detail) return null
      const rawSeverity = typeof item.severity === 'string' ? item.severity.toLowerCase() : 'medium'
      const severity = allowedSeverities.has(rawSeverity) ? rawSeverity : 'medium'
      return { title: title || detail, detail: title ? detail : '', severity }
    })
    .filter(Boolean)
    .slice(0, limit)
}

export function parsePromptEvaluation(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return null

  const fenced = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced ? fenced[1] : rawText
  const jsonMatch = candidate.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return null
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const rawScores = parsed.scores && typeof parsed.scores === 'object' ? parsed.scores : {}
  const overallParsed = clampScore(parsed.overall)
  const clarity = clampScore(rawScores.clarity) ?? overallParsed
  const specificity = clampScore(rawScores.specificity) ?? overallParsed
  const constraints = clampScore(rawScores.constraints) ?? overallParsed

  const improvedPrompt =
    typeof parsed.improved_prompt === 'string'
      ? parsed.improved_prompt.trim()
      : typeof parsed.improvedPrompt === 'string'
      ? parsed.improvedPrompt.trim()
      : ''

  const hasValidScores = clarity !== null && specificity !== null && constraints !== null
  if (!hasValidScores && !improvedPrompt) return null

  const scores = {
    clarity: clarity ?? 0,
    specificity: specificity ?? 0,
    constraints: constraints ?? 0,
  }

  const overall =
    overallParsed ?? Math.round((scores.clarity + scores.specificity + scores.constraints) / 3)

  return {
    overall,
    scores,
    summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
    strengths: normalizeStringArray(parsed.strengths),
    issues: normalizeIssues(parsed.issues),
    recommendations: normalizeStringArray(parsed.recommendations),
    improved_prompt: improvedPrompt,
  }
}
