export interface PresetSamplePair {
  beforeUrl: string
  afterUrl: string
}

interface PresetPalette {
  bgBefore: string
  bgAfterTop: string
  bgAfterBottom: string
  skinBefore: string
  skinAfter: string
  keyLight: string
  rimLight: string
  accent: string
  tag: string
  motionTrail?: boolean
  rimGlow?: boolean
  flashPop?: boolean
  softDiffuse?: boolean
  hdrSky?: boolean
}

const PRESET_PALETTES: Record<string, PresetPalette> = {
  strobist: {
    bgBefore: '#6c737c',
    bgAfterTop: '#18212b',
    bgAfterBottom: '#2d3744',
    skinBefore: '#c69e82',
    skinAfter: '#f2c8a2',
    keyLight: '#ffd29d',
    rimLight: '#7ab8ff',
    accent: '#f59e0b',
    tag: 'Strobist',
    flashPop: true,
  },
  direct_flash: {
    bgBefore: '#7d7a74',
    bgAfterTop: '#222120',
    bgAfterBottom: '#3e3b38',
    skinBefore: '#c49d84',
    skinAfter: '#ffe4cf',
    keyLight: '#ffffff',
    rimLight: '#e5e7eb',
    accent: '#f8fafc',
    tag: 'Direct Flash',
    flashPop: true,
  },
  film_flash: {
    bgBefore: '#6d665c',
    bgAfterTop: '#241e19',
    bgAfterBottom: '#43362c',
    skinBefore: '#b8947b',
    skinAfter: '#eec29c',
    keyLight: '#ffcf96',
    rimLight: '#e2a36b',
    accent: '#fbbf24',
    tag: 'Film 35mm',
    flashPop: true,
  },
  softbox: {
    bgBefore: '#73767a',
    bgAfterTop: '#3b424c',
    bgAfterBottom: '#626c7a',
    skinBefore: '#c59d82',
    skinAfter: '#f7cfb1',
    keyLight: '#fff3e4',
    rimLight: '#cbd5e1',
    accent: '#fde68a',
    tag: 'Softbox',
    softDiffuse: true,
  },
  backlit_rim: {
    bgBefore: '#696e75',
    bgAfterTop: '#161b24',
    bgAfterBottom: '#463322',
    skinBefore: '#b9937a',
    skinAfter: '#d9aa87',
    keyLight: '#ffc178',
    rimLight: '#ff9d42',
    accent: '#fb923c',
    tag: 'Backlit Rim',
    rimGlow: true,
  },
  slow_shutter: {
    bgBefore: '#666b75',
    bgAfterTop: '#141524',
    bgAfterBottom: '#301d3b',
    skinBefore: '#bf9880',
    skinAfter: '#f6d0b4',
    keyLight: '#ffb870',
    rimLight: '#e879f9',
    accent: '#f472b6',
    tag: 'Slow Shutter',
    motionTrail: true,
  },
  smart_hdr: {
    bgBefore: '#797f85',
    bgAfterTop: '#2d6ea3',
    bgAfterBottom: '#6e8c68',
    skinBefore: '#be987f',
    skinAfter: '#f2c19c',
    keyLight: '#ffe7c4',
    rimLight: '#93c5fd',
    accent: '#38bdf8',
    tag: 'Smart HDR',
    hdrSky: true,
  },
}

function toSvgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function renderPortraitScene(palette: PresetPalette, mode: 'before' | 'after'): string {
  const isAfter = mode === 'after'
  const idSuffix = `${palette.tag.replace(/[^a-z0-9]/gi, '').toLowerCase()}_${mode}`

  const defs = isAfter
    ? `
      <linearGradient id="bg_${idSuffix}" x1="0" y1="0" x2="0.2" y2="1">
        <stop offset="0%" stop-color="${palette.bgAfterTop}" />
        <stop offset="100%" stop-color="${palette.bgAfterBottom}" />
      </linearGradient>
      <radialGradient id="spot_${idSuffix}" cx="0.62" cy="0.34" r="0.58">
        <stop offset="0%" stop-color="${palette.keyLight}" stop-opacity="0.48" />
        <stop offset="55%" stop-color="${palette.accent}" stop-opacity="0.16" />
        <stop offset="100%" stop-color="#000000" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="face_${idSuffix}" x1="0.85" y1="0.1" x2="0.15" y2="0.95">
        <stop offset="0%" stop-color="${palette.keyLight}" />
        <stop offset="52%" stop-color="${palette.skinAfter}" />
        <stop offset="100%" stop-color="#8b6248" />
      </linearGradient>
      <linearGradient id="coat_${idSuffix}" x1="0.8" y1="0" x2="0.1" y2="1">
        <stop offset="0%" stop-color="#3c4452" />
        <stop offset="55%" stop-color="#1e232b" />
        <stop offset="100%" stop-color="#11141a" />
      </linearGradient>
    `
    : `
      <linearGradient id="bg_${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${palette.bgBefore}" />
        <stop offset="100%" stop-color="#585e66" />
      </linearGradient>
      <linearGradient id="face_${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${palette.skinBefore}" />
        <stop offset="100%" stop-color="#ab876d" />
      </linearGradient>
      <linearGradient id="coat_${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#454950" />
        <stop offset="100%" stop-color="#383c42" />
      </linearGradient>
    `

  const extras = !isAfter
    ? ''
    : `
      ${palette.hdrSky ? `<circle cx="290" cy="88" r="56" fill="#ffd99a" opacity="0.55" />` : ''}
      ${palette.rimGlow ? `<ellipse cx="180" cy="215" rx="108" ry="138" fill="none" stroke="${palette.rimLight}" stroke-width="10" opacity="0.72" />` : ''}
      ${palette.softDiffuse ? `<ellipse cx="245" cy="175" rx="135" ry="160" fill="${palette.keyLight}" opacity="0.22" />` : ''}
      ${palette.flashPop ? `<ellipse cx="182" cy="185" rx="115" ry="130" fill="url(#spot_${idSuffix})" />` : ''}
      ${
        palette.motionTrail
          ? `
        <path d="M55 340 C95 250, 145 210, 175 180" stroke="${palette.rimLight}" stroke-width="14" stroke-linecap="round" opacity="0.34" fill="none" />
        <path d="M298 120 C268 185, 240 245, 290 325" stroke="${palette.accent}" stroke-width="10" stroke-linecap="round" opacity="0.42" fill="none" />
        <ellipse cx="152" cy="188" rx="46" ry="58" fill="${palette.rimLight}" opacity="0.16" />
      `
          : ''
      }
    `

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 450" width="360" height="450">
    <defs>${defs}</defs>
    <rect width="360" height="450" fill="url(#bg_${idSuffix})" />
    ${isAfter ? `<rect width="360" height="450" fill="url(#spot_${idSuffix})" />` : ''}
    ${extras}
    <!-- subtle studio architecture -->
    <rect x="26" y="42" width="110" height="240" rx="8" fill="#ffffff" opacity="${isAfter ? '0.04' : '0.07'}" />
    <rect x="228" y="64" width="96" height="190" rx="8" fill="#000000" opacity="${isAfter ? '0.16' : '0.05'}" />

    <!-- subject silhouette & portrait -->
    <path d="M72 450 C76 346, 114 294, 180 294 C246 294, 284 346, 288 450 Z" fill="url(#coat_${idSuffix})" />
    <path d="M148 295 L180 344 L212 295 Z" fill="${isAfter ? '#f1ede6' : '#c6c9ce'}" />
    <rect x="160" y="246" width="40" height="58" rx="18" fill="url(#face_${idSuffix})" />

    <!-- hair & head -->
    <path d="M124 176 C122 110, 238 110, 236 176 L232 208 C222 150, 138 150, 128 208 Z" fill="${isAfter ? '#161311' : '#2d2b2a'}" />
    <ellipse cx="180" cy="186" rx="50" ry="64" fill="url(#face_${idSuffix})" />
    <path d="M130 162 C136 118, 224 118, 230 164 C210 142, 152 142, 130 162 Z" fill="${isAfter ? '#1c1815' : '#312f2d'}" />

    <!-- facial features -->
    <circle cx="162" cy="182" r="4" fill="#231c18" />
    <circle cx="198" cy="182" r="4" fill="#231c18" />
    ${isAfter ? `<circle cx="163.5" cy="180.5" r="1.4" fill="#ffffff" /><circle cx="199.5" cy="180.5" r="1.4" fill="#ffffff" />` : ''}
    <path d="M166 216 Q180 225 194 216" stroke="#7d4f3d" stroke-width="3" fill="none" stroke-linecap="round" />

    ${
      isAfter
        ? `<path d="M225 144 C236 170, 234 212, 214 238" stroke="${palette.keyLight}" stroke-width="3" fill="none" opacity="0.85" stroke-linecap="round" />
           <path d="M132 148 C126 178, 129 214, 144 236" stroke="${palette.rimLight}" stroke-width="${palette.rimGlow ? '4.5' : '2'}" fill="none" opacity="0.72" stroke-linecap="round" />`
        : ''
    }
  </svg>`

  return toSvgDataUrl(svg)
}

const DEFAULT_SAMPLE_CACHE: Record<string, PresetSamplePair> = Object.fromEntries(
  Object.entries(PRESET_PALETTES).map(([id, palette]) => [
    id,
    {
      beforeUrl: renderPortraitScene(palette, 'before'),
      afterUrl: renderPortraitScene(palette, 'after'),
    },
  ])
)

export function getPresetDefaultSamples(presetId: string): PresetSamplePair {
  return DEFAULT_SAMPLE_CACHE[presetId] || DEFAULT_SAMPLE_CACHE.strobist
}

export function resolvePresetSamples(preset: {
  id: string
  beforeUrl?: string
  afterUrl?: string
}): PresetSamplePair {
  const fallback = getPresetDefaultSamples(preset.id)
  return {
    beforeUrl: preset.beforeUrl || fallback.beforeUrl,
    afterUrl: preset.afterUrl || fallback.afterUrl,
  }
}
