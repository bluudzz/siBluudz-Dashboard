export const WEBSITE_PROJECT_TYPES = [
  { id: 'landing', label: 'Landing Page', guidance: 'Halaman publik, portofolio, atau produk' },
  { id: 'webapp', label: 'Dashboard / App', guidance: 'Aplikasi kerja interaktif dengan navigasi dan state' },
  { id: 'existing_feature', label: 'Fitur Repo Lama', guidance: 'Tambah fitur atau refactor di codebase berjalan' },
  { id: 'fullstack', label: 'Fullstack / API', guidance: 'Frontend terhubung backend REST API dan database' },
]

export const WEBSITE_ASSISTANTS = [
  { id: 'agent', label: 'Antigravity / Claude Code' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'v0_bolt', label: 'v0 / Bolt / Lovable' },
  { id: 'general', label: 'Umum' },
]

export const WEBSITE_STACK_OPTIONS = [
  'React + Vite',
  'Next.js',
  'TypeScript',
  'Tailwind CSS',
  'Node / Express',
  'SQLite / Postgres',
  'HTML/CSS Native',
]

export const WEBSITE_QUALITY_STANDARDS = [
  { id: 'responsive', label: 'Responsif Mobile' },
  { id: 'dual_theme', label: 'Light & Dark Mode' },
  { id: 'a11y', label: 'Aksesibilitas Keyboard' },
  { id: 'no_new_deps', label: 'Tanpa Dependensi Baru' },
  { id: 'tests', label: 'Sertakan Test' },
]

export const WEBSITE_PROMPT_STARTERS = [
  {
    id: 'portfolio',
    label: 'Portofolio Fotografer',
    projectType: 'landing',
    stack: ['React + Vite', 'TypeScript', 'Tailwind CSS'],
    prompt:
      'Buat website portofolio fotografer komersial dengan galeri karya per kategori, halaman detail proyek, profil studio, dan formulir kontak.',
    constraints: 'Fokus pada kecepatan muat gambar, navigasi bersih, dan tanpa animasi berlebihan.',
  },
  {
    id: 'analytics',
    label: 'Dashboard Analitik',
    projectType: 'webapp',
    stack: ['React + Vite', 'TypeScript', 'Tailwind CSS'],
    prompt:
      'Susun aplikasi dashboard analitik penjualan harian dengan filter rentang tanggal, tabel transaksi yang bisa diurutkan, dan ekspor CSV.',
    constraints: 'Sertakan kondisi kosong, loading, dan error yang jelas serta angka rata kanan tabular.',
  },
  {
    id: 'catalog',
    label: 'Katalog UMKM',
    projectType: 'fullstack',
    stack: ['React + Vite', 'TypeScript', 'Node / Express', 'SQLite / Postgres'],
    prompt:
      'Bangun web katalog produk kopi UMKM dengan pencarian cepat, filter kategori, detail varian kemasan, dan ringkasan pesanan menuju WhatsApp.',
    constraints: 'Pastikan nyaman dibuka di ponsel satu tangan dengan tombol sentuh minimal 44px.',
  },
  {
    id: 'feature',
    label: 'Fitur Filter & Export',
    projectType: 'existing_feature',
    stack: ['React + Vite', 'TypeScript'],
    prompt:
      'Tambahkan panel filter multi-kriteria dan tombol ekspor laporan Markdown pada halaman daftar invoice yang sudah berjalan.',
    constraints: 'Gunakan komponen UI yang sudah ada di repo tanpa menambah library eksternal baru.',
  },
]

export function estimateWebsitePromptMetrics(text = '') {
  const source = typeof text === 'string' ? text : ''
  const trimmed = source.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  const approxTokens = words ? Math.max(1, Math.ceil(words * 1.35)) : 0
  return { chars: source.length, words, approxTokens }
}

export function buildWebsitePrompt(input = '', options = {}) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) return ''

  const {
    projectType = 'webapp',
    assistant = 'agent',
    stack = [],
    standards = [],
    constraints = '',
  } = options || {}

  const projectEntry = WEBSITE_PROJECT_TYPES.find((item) => item.id === projectType)
  const assistantEntry = WEBSITE_ASSISTANTS.find((item) => item.id === assistant)
  const stackList = Array.isArray(stack) ? stack.map((item) => String(item).trim()).filter(Boolean) : []
  const standardLabels = Array.isArray(standards)
    ? standards
        .map((id) => WEBSITE_QUALITY_STANDARDS.find((item) => item.id === id)?.label)
        .filter(Boolean)
    : []
  const extraConstraints = typeof constraints === 'string' ? constraints.trim() : ''

  const meta = []
  if (projectEntry) {
    meta.push(`Jenis proyek: ${projectEntry.label} (${projectEntry.guidance})`)
  }
  if (assistantEntry) {
    meta.push(`Target coding assistant: ${assistantEntry.label}`)
  }
  if (stackList.length > 0) {
    meta.push(`Tech stack: ${stackList.join(', ')}`)
  }
  if (standardLabels.length > 0) {
    meta.push(`Standar kualitas: ${standardLabels.join(', ')}`)
  }
  if (extraConstraints) {
    meta.push(`Batasan & konteks repo: ${extraConstraints}`)
  }

  return meta.length > 0 ? `${trimmed}\n\n${meta.join('\n')}` : trimmed
}

function normalizeStringArray(value, limit = 12) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeFiles(value, limit = 16) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const path = item.trim()
        return path ? { path, purpose: '' } : null
      }
      if (!item || typeof item !== 'object') return null
      const path = typeof item.path === 'string' ? item.path.trim() : ''
      const purpose = typeof item.purpose === 'string' ? item.purpose.trim() : ''
      if (!path && !purpose) return null
      return { path: path || purpose, purpose: path ? purpose : '' }
    })
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeComponents(value, limit = 16) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim()
        return name ? { name, responsibility: '' } : null
      }
      if (!item || typeof item !== 'object') return null
      const name = typeof item.name === 'string' ? item.name.trim() : ''
      const responsibility =
        typeof item.responsibility === 'string' ? item.responsibility.trim() : ''
      if (!name && !responsibility) return null
      return { name: name || responsibility, responsibility: name ? responsibility : '' }
    })
    .filter(Boolean)
    .slice(0, limit)
}

export function parseWebsiteSpec(rawText) {
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

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : ''
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
  const stack = normalizeStringArray(parsed.stack, 10)
  const files = normalizeFiles(parsed.files, 16)
  const components = normalizeComponents(parsed.components, 16)
  const user_flows = normalizeStringArray(parsed.user_flows, 10)
  const acceptance_criteria = normalizeStringArray(parsed.acceptance_criteria, 12)
  const execution_prompt =
    typeof parsed.execution_prompt === 'string'
      ? parsed.execution_prompt.trim()
      : typeof parsed.executionPrompt === 'string'
      ? parsed.executionPrompt.trim()
      : ''

  const rawStates = parsed.states && typeof parsed.states === 'object' ? parsed.states : {}
  const states = {
    empty: typeof rawStates.empty === 'string' ? rawStates.empty.trim() : '',
    loading: typeof rawStates.loading === 'string' ? rawStates.loading.trim() : '',
    error: typeof rawStates.error === 'string' ? rawStates.error.trim() : '',
  }

  const hasStructure =
    files.length > 0 ||
    components.length > 0 ||
    user_flows.length > 0 ||
    acceptance_criteria.length > 0

  if (!execution_prompt && !hasStructure) return null

  return {
    title: title || 'Spesifikasi Teknis & Prompt Coding',
    summary,
    stack,
    files,
    components,
    user_flows,
    states,
    acceptance_criteria,
    execution_prompt,
  }
}

export function formatWebsiteSpecMarkdown(spec) {
  if (!spec || typeof spec !== 'object') return ''
  const parts = [`# ${spec.title || 'Spesifikasi Teknis'}`]
  if (spec.summary) parts.push('', spec.summary)
  if (Array.isArray(spec.stack) && spec.stack.length > 0) {
    parts.push('', '## Tech Stack', ...spec.stack.map((item) => `- ${item}`))
  }
  if (Array.isArray(spec.files) && spec.files.length > 0) {
    parts.push(
      '',
      '## Peta File & Struktur',
      ...spec.files.map((file) =>
        file.purpose ? `- \`${file.path}\`: ${file.purpose}` : `- \`${file.path}\``
      )
    )
  }
  if (Array.isArray(spec.components) && spec.components.length > 0) {
    parts.push(
      '',
      '## Komponen Utama',
      ...spec.components.map((comp) =>
        comp.responsibility ? `- **${comp.name}**: ${comp.responsibility}` : `- **${comp.name}**`
      )
    )
  }
  if (Array.isArray(spec.user_flows) && spec.user_flows.length > 0) {
    parts.push('', '## Alur Pengguna', ...spec.user_flows.map((flow, i) => `${i + 1}. ${flow}`))
  }
  if (spec.states && (spec.states.empty || spec.states.loading || spec.states.error)) {
    parts.push('', '## Kondisi UI')
    if (spec.states.empty) parts.push(`- **Kosong**: ${spec.states.empty}`)
    if (spec.states.loading) parts.push(`- **Memuat**: ${spec.states.loading}`)
    if (spec.states.error) parts.push(`- **Error**: ${spec.states.error}`)
  }
  if (Array.isArray(spec.acceptance_criteria) && spec.acceptance_criteria.length > 0) {
    parts.push(
      '',
      '## Kriteria Selesai',
      ...spec.acceptance_criteria.map((item) => `- [ ] ${item}`)
    )
  }
  if (spec.execution_prompt) {
    parts.push('', '## Prompt Eksekusi', '', spec.execution_prompt)
  }
  return parts.join('\n')
}
