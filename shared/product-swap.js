export const PRODUCT_SWAP_SCENARIOS = [
  {
    id: 'exact_replace',
    label: 'Ganti objek persis',
    guidance: 'Mengganti objek utama pada posisi, sudut, dan perspektif foto referensi.',
    directive:
      'Replace the target subject in Image 1 directly with Image 2 at the exact position, camera angle, and perspective while completely removing any remnant of the original object.',
  },
  {
    id: 'handheld',
    label: 'Dipegang tangan',
    guidance: 'Menyesuaikan genggaman jari dan proporsi produk di tangan model.',
    directive:
      'Place Image 2 naturally inside the hand or grip shown in Image 1. Adjust finger occlusion, wrist angle, contact shadows, and physical scale realistically around the new product.',
  },
  {
    id: 'tabletop',
    label: 'Di meja / flat-lay',
    guidance: 'Menjaga kontak permukaan, bayangan dasar, dan pantulan meja.',
    directive:
      'Seat Image 2 solidly onto the tabletop or flat-lay surface from Image 1 with accurate ground contact shadows, ambient occlusion, and subtle surface reflections.',
  },
  {
    id: 'apparel',
    label: 'Apparel / dipakai',
    guidance: 'Mengikuti kontur tubuh, lipatan kain, dan drape alami.',
    directive:
      'Fit the apparel or wearable item from Image 2 onto the subject in Image 1 with natural body contour, realistic fabric drape, folds, and preserved weave/print alignment.',
  },
]

export const PRODUCT_SWAP_FIDELITY = [
  {
    id: 'strict',
    label: 'Ketat · jaga logo & warna',
    directive:
      'Preserve 100% of Image 2 exact brand logo, typography, label graphics, colorway, stitching, and physical geometry without altering text or proportions.',
  },
  {
    id: 'balanced',
    label: 'Seimbang · selaras cahaya',
    directive:
      'Preserve Image 2 identity, logo, and shape while allowing subtle specular highlights and warm/cool light wrapping so it blends seamlessly with Image 1 ambient tones.',
  },
]

export const PRODUCT_SWAP_SCALE = [
  {
    id: 'match_reference',
    label: 'Ikuti referensi',
    directive: 'Match the bounding footprint and visual weight of the original subject in Image 1.',
  },
  {
    id: 'prominent',
    label: 'Lebih menonjol',
    directive: 'Render Image 2 slightly larger (~10-15%) as the clear hero focal point without breaking perspective.',
  },
  {
    id: 'natural',
    label: 'Proporsi realistis',
    directive: 'Size Image 2 to realistic real-world physical proportions relative to surrounding props in Image 1.',
  },
]

export const PRODUCT_SWAP_RESOLUTIONS = [
  { id: '', label: 'Otomatis' },
  { id: '1K', label: '1K' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
]

export const PRODUCT_SWAP_QUICK_CHIPS = [
  { label: 'Jaga logo & teks', text: 'Jaga bentuk logo, tulisan label, dan warna kemasan asli tetap tajam terbaca.' },
  { label: 'Hapus objek lama bersih', text: 'Hapus seluruh sisa objek lama di latar referensi tanpa meninggalkan bekas.' },
  { label: 'Bayangan natural', text: 'Sesuaikan bayangan dasar dan arah cahaya mengikuti foto referensi.' },
  { label: 'Pertahankan latar & pose', text: 'Jangan ubah komposisi latar, properti lain, maupun pose tangan atau model.' },
]

export const defaultProductSwapSettings = {
  scenario: 'exact_replace',
  fidelity: 'strict',
  scale: 'match_reference',
}

export function normalizeProductSwapSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Pengaturan ganti produk tidak valid.')
  }

  const scenario = input.scenario || defaultProductSwapSettings.scenario
  const fidelity = input.fidelity || defaultProductSwapSettings.fidelity
  const scale = input.scale || defaultProductSwapSettings.scale

  if (!PRODUCT_SWAP_SCENARIOS.some((item) => item.id === scenario)) {
    throw new Error('Skenario penempatan produk tidak valid.')
  }
  if (!PRODUCT_SWAP_FIDELITY.some((item) => item.id === fidelity)) {
    throw new Error('Pengaturan kesetiaan produk tidak valid.')
  }
  if (!PRODUCT_SWAP_SCALE.some((item) => item.id === scale)) {
    throw new Error('Pengaturan skala objek tidak valid.')
  }

  return { scenario, fidelity, scale }
}

export function buildProductSwapPrompt(settings = {}, instructions = '', resolution) {
  if (typeof instructions !== 'string') {
    throw new Error('Arahan penggantian produk harus berupa teks.')
  }
  const cleanInstructions = instructions.trim()
  if (cleanInstructions.length > 4000) {
    throw new Error('Arahan penggantian produk maksimal 4.000 karakter.')
  }

  const normalized = normalizeProductSwapSettings(settings)
  const scenarioEntry = PRODUCT_SWAP_SCENARIOS.find((item) => item.id === normalized.scenario)
  const fidelityEntry = PRODUCT_SWAP_FIDELITY.find((item) => item.id === normalized.fidelity)
  const scaleEntry = PRODUCT_SWAP_SCALE.find((item) => item.id === normalized.scale)

  const structuredInstruction = {
    task: 'HIGH_FIDELITY_PRODUCT_REPLACEMENT',
    input_images: {
      image_1: 'Reference scene determining background, props, hands/model, lighting, and perspective.',
      image_2: 'Exact replacement product to insert seamlessly into the scene.',
    },
    placement_scenario: {
      mode: normalized.scenario,
      rule: scenarioEntry.directive,
    },
    execution_rules: {
      clean_removal:
        'Remove every trace, shadow artifact, or leftover edge of the replaced subject from Image 1.',
      identity_preservation: fidelityEntry.directive,
      scale_rule: scaleEntry.directive,
      environmental_blending:
        'Harmonize directional key light, contact shadows, ambient occlusion, and material reflections to match Image 1.',
      scene_lock:
        'Keep the surrounding background, secondary props, pose, and framing of Image 1 untouched.',
      technical_finish: [
        'Sharp micro-textures and clean material edges with natural depth of field',
        'Zero distortion, zero garbled label text, zero AI haze or halo cutouts',
      ],
    },
    ...(resolution ? { output_target: `Native ${resolution} high-resolution composite preserving Image 1 aspect ratio.` } : {}),
    ...(cleanInstructions ? { user_guidance: cleanInstructions } : {}),
  }

  return [
    '```json',
    JSON.stringify(structuredInstruction, null, 2),
    '```',
    'Execute this composite faithfully and output only the final product photograph.',
  ].join('\n')
}
