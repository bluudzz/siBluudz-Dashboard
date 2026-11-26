export const IMAGE_PROMPT_TARGETS = [
  {
    id: 'universal',
    label: 'GPT Image / Gemini Image',
    guidance: 'Prosa visual alami tanpa flag parameter atau istilah sampler',
  },
  {
    id: 'flux',
    label: 'Flux / SDXL',
    guidance: 'Deskripsi rinci terstruktur disertai negative prompt ringkas',
  },
  {
    id: 'midjourney',
    label: 'Midjourney v6+',
    guidance: 'Prompt visual ringkas padat disertai flag --ar dan --style raw',
  },
]

export const IMAGE_PROMPT_STYLES = [
  { id: 'product_studio', label: 'Foto Produk', guidance: 'Fotografi komersial produk nyata' },
  { id: 'editorial', label: 'Editorial / Lifestyle', guidance: 'Adegan natural dalam konteks nyata' },
  { id: 'cinematic', label: 'Sinematik', guidance: 'Framing film dengan atmosfer mendalam' },
  { id: 'illustration', label: 'Ilustrasi / 3D', guidance: 'Render 3D atau ilustrasi terarah' },
  { id: 'minimal_graphic', label: 'Poster / Grafis', guidance: 'Komposisi grafis bersih dengan ruang tipografi' },
]

export const IMAGE_PROMPT_RATIOS = ['4:5', '1:1', '9:16', '16:9', '3:2']

export const IMAGE_PROMPT_LIGHTING = [
  { id: 'natural_morning', label: 'Cahaya Pagi', guidance: 'Sinar jendela lembut dari samping dengan bayangan halus' },
  { id: 'studio_softbox', label: 'Studio Softbox', guidance: 'Pencahayaan lembut merata dengan highlight terkontrol' },
  { id: 'golden_hour', label: 'Golden Hour', guidance: 'Cahaya sore keemasan hangat dengan kontras alami' },
  { id: 'dramatic_lowkey', label: 'Dramatis / Gelap', guidance: 'Aksen cahaya terarah di latar gelap dan kontras tegas' },
  { id: 'clean_bright', label: 'Terang Bersih', guidance: 'Pencahayaan cerah netral bernuansa editorial bersih' },
]

export const IMAGE_PROMPT_LANGUAGES = [
  { id: 'en', label: 'Inggris (Disarankan)' },
  { id: 'id', label: 'Indonesia' },
]

export const IMAGE_PROMPT_STARTERS = [
  {
    id: 'coffee_catalog',
    label: 'Foto Produk Kopi',
    style: 'product_studio',
    ratio: '4:5',
    lighting: 'natural_morning',
    prompt:
      'Kemasan kopi biji sangrai 250g matte hitam di atas meja kayu ek hangat, ditemani beberapa biji kopi dan cangkir keramik di kejauhan.',
    details: 'Fokus tajam pada tekstur kertas label kemasan, latar polos netral, tanpa teks tambahan acak.',
  },
  {
    id: 'skincare_studio',
    label: 'Skincare Studio',
    style: 'product_studio',
    ratio: '1:1',
    lighting: 'studio_softbox',
    prompt:
      'Botol serum kaca frosted dengan pipet perak berdiri di atas balok batu travertine krem, ditemani percikan embun air halus.',
    details: 'Refleksi kaca realistis, warna pastel hangat, komposisi bersih tanpa dekorasi berlebihan.',
  },
  {
    id: 'food_editorial',
    label: 'Editorial Makanan',
    style: 'editorial',
    ratio: '4:5',
    lighting: 'golden_hour',
    prompt:
      'Sepiring croissant mentega segar di meja bistro marmer, kopi latte di sebelah kanan atas, diambil sedikit dari sudut tiga perempat atas.',
    details: 'Tunjukkan tekstur lapisan pastry renyah dan uap hangat tipis, tanpa tangan atau wajah.',
  },
  {
    id: 'minimal_poster',
    label: 'Poster Minimalis',
    style: 'minimal_graphic',
    ratio: '9:16',
    lighting: 'clean_bright',
    prompt:
      'Visual kampanye pameran arsitektur modern menampilkan lengkungan beton terang berpotongan bayangan geometris tegas.',
    details: 'Sisakan ruang kosong sepertiga atas untuk penempatan headline, tanpa teks tempelan dari AI.',
  },
]

export function estimateImagePromptMetrics(text = '') {
  const source = typeof text === 'string' ? text : ''
  const trimmed = source.trim()
  const words = trimmed ? trimmed.split(/\s+/).length : 0
  return { chars: source.length, words }
}

export function buildImagePrompt(input = '', options = {}) {
  const trimmed = typeof input === 'string' ? input.trim() : ''
  if (!trimmed) return ''

  const {
    target = 'universal',
    style = 'product_studio',
    ratio = '4:5',
    lighting = 'natural_morning',
    language = 'en',
    details = '',
  } = options || {}

  const targetEntry = IMAGE_PROMPT_TARGETS.find((item) => item.id === target)
  const styleEntry = IMAGE_PROMPT_STYLES.find((item) => item.id === style)
  const lightingEntry = IMAGE_PROMPT_LIGHTING.find((item) => item.id === lighting)
  const languageEntry = IMAGE_PROMPT_LANGUAGES.find((item) => item.id === language)
  const cleanRatio = typeof ratio === 'string' && ratio.trim() ? ratio.trim() : '4:5'
  const extraDetails = typeof details === 'string' ? details.trim() : ''

  const meta = []
  if (targetEntry) {
    meta.push(`Target model gambar: ${targetEntry.label} (${targetEntry.guidance})`)
  }
  if (styleEntry) {
    meta.push(`Gaya visual: ${styleEntry.label} (${styleEntry.guidance})`)
  }
  meta.push(`Rasio aspek: ${cleanRatio}`)
  if (lightingEntry) {
    meta.push(`Pencahayaan: ${lightingEntry.label} (${lightingEntry.guidance})`)
  }
  if (languageEntry) {
    meta.push(`Bahasa prompt utama & variasi: ${languageEntry.id === 'en' ? 'Bahasa Inggris' : 'Bahasa Indonesia'}`)
  }
  if (extraDetails) {
    meta.push(`Detail tambahan & hal yang dihindari: ${extraDetails}`)
  }

  return `${trimmed}\n\n${meta.join('\n')}`
}

function normalizeStringArray(value, limit = 8) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, limit)
}

function normalizeVariants(value, limit = 4) {
  if (!Array.isArray(value)) return []
  return value
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null
      const label = typeof item.label === 'string' && item.label.trim() ? item.label.trim() : `Variasi ${idx + 1}`
      const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : ''
      if (!prompt) return null
      return { label, prompt }
    })
    .filter(Boolean)
    .slice(0, limit)
}

export function parseImagePromptSpec(raw = '') {
  if (typeof raw !== 'string' || !raw.trim()) return null

  const cleaned = raw.trim()
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenced ? fenced[1].trim() : cleaned

  const tryParse = (text) => {
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  let parsed = tryParse(candidate)
  if (!parsed) {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      parsed = tryParse(candidate.slice(start, end + 1))
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const main_prompt = typeof parsed.main_prompt === 'string' ? parsed.main_prompt.trim() : ''
  if (!main_prompt) return null

  const rawBreakdown = parsed.breakdown && typeof parsed.breakdown === 'object' ? parsed.breakdown : {}

  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : 'Prompt Visual',
    main_prompt,
    negative_prompt: typeof parsed.negative_prompt === 'string' ? parsed.negative_prompt.trim() : '',
    variants: normalizeVariants(parsed.variants),
    breakdown: {
      subject: typeof rawBreakdown.subject === 'string' ? rawBreakdown.subject.trim() : '',
      composition: typeof rawBreakdown.composition === 'string' ? rawBreakdown.composition.trim() : '',
      lighting: typeof rawBreakdown.lighting === 'string' ? rawBreakdown.lighting.trim() : '',
      color_palette: typeof rawBreakdown.color_palette === 'string' ? rawBreakdown.color_palette.trim() : '',
    },
    parameters: typeof parsed.parameters === 'string' ? parsed.parameters.trim() : '',
    tips: normalizeStringArray(parsed.tips, 6),
  }
}

export function formatImagePromptText(spec) {
  if (!spec || typeof spec !== 'object') return ''
  const parts = []
  if (spec.title) parts.push(spec.title, '')
  if (spec.main_prompt) {
    parts.push('=== MAIN PROMPT ===', spec.main_prompt, '')
  }
  if (spec.negative_prompt) {
    parts.push('=== NEGATIVE PROMPT ===', spec.negative_prompt, '')
  }
  if (spec.parameters) {
    parts.push('=== PARAMETERS ===', spec.parameters, '')
  }
  if (Array.isArray(spec.variants) && spec.variants.length > 0) {
    parts.push('=== VARIASI ===')
    for (const variant of spec.variants) {
      parts.push(`[${variant.label}]`, variant.prompt, '')
    }
  }
  return parts.join('\n').trim()
}
