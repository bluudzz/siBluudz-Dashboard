import { relightMasterPromptV3 } from './relight-master-prompt.js'

export const RELIGHT_PROMPT_VERSION = 'universal-master-v3'

export const relightPresets = [
  { id: 'strobist', label: 'Strobist Flash', description: 'Flash terarah, subjek lebih terang, ambient lebih rendah.', prompt: 'Professional off-camera strobist flash with controlled ambient underexposure. Use the selected light direction; in Auto, choose a 30–45 degree angle slightly above the subject. Set subject and background exposure using the selected intensity targets. Preserve existing environmental lights and atmosphere; do not turn day into night.' },
  { id: 'direct_flash', label: 'Direct Flash', description: 'Flash frontal dengan karakter spontan dan kontras jelas.', prompt: 'Direct on-camera flash close to the camera axis, crisp frontal illumination, realistic falloff and shadows behind the subject. Preserve facial dimension and avoid clipped skin or reflective highlights.' },
  { id: 'film_flash', label: 'Film Flash', description: 'Karakter flash film, dengan tekstur foto asli.', prompt: 'Film-camera flash lighting with restrained warm highlights, gentle highlight rolloff and natural contrast. Preserve the original grain; do not add film grain, blur, vintage filters or synthetic texture.' },
  { id: 'softbox', label: 'Softbox', description: 'Cahaya luas dan lembut untuk potret atau produk.', prompt: 'Large softbox lighting: broad diffused directional light, smooth transitions and controlled specular highlights. Retain depth and original surface texture without smoothing skin or flattening the scene.' },
  { id: 'backlit_rim', label: 'Backlit Rim', description: 'Cahaya tepi dari belakang untuk pemisahan subjek.', prompt: 'Backlit rim lighting: light from behind the subject, restrained edge highlights and sufficient natural fill to retain face and material detail. No glowing outlines, halos or invented background light fixtures.' },
  { id: 'slow_shutter', label: 'Slow Shutter', description: 'Flash langsung dengan efek slow shutter dan jejak gerak dinamis.', prompt: "Turn the uploaded photo into a hyper-realistic experimental fashion, photograph captured with a slow shutter and direct camera flash. Create strong, dynamic motion trails but still preserve the body's natural shape and details without altering the face." },
  { id: 'smart_hdr', label: 'Smart HDR', description: 'Dynamic range luas, warna natural kaya, detail tajam ala iPhone 17 Pro Smart HDR.', prompt: 'Apply a rich, natural color grade with deep greens, warm golden-hour highlights, a clean blue sky, accurate skin tones, and soft neutral shadows without an orange or yellow cast. Enhance dynamic range, local contrast, texture, and detail to an iPhone 17 Pro Smart HDR look while keeping it fully photorealistic. Give that image as it is, not AI-generated artwork.' },
]

export const relightOptions = {
  intensity: [
    { id: 'subtle', label: 'Halus', prompt: 'Subtle intensity: a gentle but unmistakably visible local relight compared with the source. Change directional highlights and shadows, not only global brightness. Keep all source detail.' },
    { id: 'medium', label: 'Sedang', prompt: 'Medium intensity: a clearly visible lighting transformation with directional highlights, shaped shadows and distinct subject/ambient separation. An almost unchanged source or a global brightness adjustment is not an acceptable result.' },
    { id: 'strong', label: 'Kuat', prompt: 'Strong intensity: a pronounced, immediately visible lighting transformation, stronger than Medium, with decisive directional highlights and shadow separation. Reduce the effect only within threatened detail or protected information regions; retain strong relighting elsewhere. Do not return an almost unchanged source.' },
  ],
  temperature: [
    { id: 'neutral', label: 'Netral', prompt: 'Neutral light temperature, approximately 5000–5600 K where appropriate. Preserve existing ambient color and material hues.' },
    { id: 'warm', label: 'Hangat', prompt: 'Use warm illumination with restrained amber highlights; do not apply a global yellow filter or change intrinsic material colors.' },
    { id: 'cool', label: 'Dingin', prompt: 'Use cool illumination with restrained blue highlights; retain believable skin and original material colors.' },
  ],
  shadows: [
    { id: 'normal', label: 'Normal', prompt: 'Use the selected lighting preset’s natural shadow softness, consistent with source size and scene geometry.' },
    { id: 'soft', label: 'Lembut', prompt: 'Use soft shadows with broad penumbra and smooth, dimensional transitions.' },
    { id: 'hard', label: 'Keras', prompt: 'Use hard, clearly defined shadows with physically plausible edges; preserve shadow detail.' },
  ],
  pattern: [
    { id: 'none', label: 'Tanpa', prompt: 'Do not add decorative shadow patterns.' },
    { id: 'window', label: 'Jendela', prompt: 'Cast a plausible window-frame shadow pattern on existing surfaces, following their depth and light direction. Do not add a physical window.' },
    { id: 'blinds', label: 'Krei', prompt: 'Cast parallel window-blinds shadow bands conforming to existing surface geometry. Do not add blinds or objects.' },
    { id: 'leaves', label: 'Daun', prompt: 'Cast natural dappled leaves shadow patterns with realistic softness and direction. Do not add foliage or change the scene.' },
  ],
  direction: [
    { id: 'auto', label: 'Otomatis', prompt: 'Choose light direction adaptively from the source scene and selected preset. Keep the same physically consistent direction across all subjects.' },
    { id: 'left', label: 'Kiri', prompt: 'Main illumination comes from camera-left; adapt elevation and falloff to source geometry.' },
    { id: 'right', label: 'Kanan', prompt: 'Main illumination comes from camera-right; adapt elevation and falloff to source geometry.' },
    { id: 'front', label: 'Depan', prompt: 'Main illumination comes from near the camera axis; retain facial depth and believable shadows.' },
    { id: 'back', label: 'Belakang', prompt: 'Main illumination comes from behind the subject; retain readable facial detail with restrained fill.' },
  ],
}

export const defaultRelightSettings = {
  preset: 'strobist', intensity: 'medium', temperature: 'neutral', shadows: 'normal', pattern: 'none', direction: 'auto',
}

export function normalizeRelightSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pengaturan lighting tidak valid.')
  const result = {}
  for (const [key, fallback] of Object.entries(defaultRelightSettings)) {
    const value = input[key] ?? fallback
    const options = key === 'preset' ? relightPresets : relightOptions[key]
    if (!options.some(option => option.id === value)) throw new Error(`Pengaturan ${key} tidak valid.`)
    result[key] = value
  }
  return result
}

const strobistExposure = {
  subtle: 'SUBJECT EXPOSURE: +0.25 to +0.5 EV. AMBIENT BACKGROUND: -0.25 to -0.5 EV.',
  medium: 'SUBJECT EXPOSURE: +0.5 to +1 EV. AMBIENT BACKGROUND: -1 to -1.5 EV.',
  strong: 'SUBJECT EXPOSURE: +1 to +1.5 EV. AMBIENT BACKGROUND: -1.5 to -2 EV.',
}

const lightingTargets = {
  strobist: 'Subjek utama terlihat diterangi flash terarah, lebih terang dan berdimensi. Background relatif lebih gelap dengan detail serta atmosfer asli tetap terlihat.',
  direct_flash: 'Karakter flash dekat sumbu kamera terlihat jelas: subjek tersorot langsung, highlight tegas dan bayangan jatuh pada permukaan di belakangnya, dengan falloff realistis.',
  film_flash: 'Karakter flash kamera film terlihat melalui sorotan subjek, highlight dengan rolloff lembut dan kontras spontan. Grain asli tetap utuh, tanpa filter vintage atau grain tambahan.',
  softbox: 'Cahaya luas membungkus subjek dari arah terpilih, menghasilkan highlight lembut, bayangan berdimensi dan transisi yang jelas berbeda dari sumber. Background tidak wajib digelapkan.',
  backlit_rim: 'Cahaya belakang menghasilkan rim highlight yang terlihat pada rambut dan tepi subjek sesuai bentuk aslinya, dengan fill cukup untuk mempertahankan detail wajah. Tanpa halo buatan.',
  slow_shutter: 'Flash langsung kamera dikombinasikan dengan efek slow shutter dan jejak gerak (motion trails) dinamis bergaya fashion eksperimental. Bentuk tubuh alami, detail subjek, dan wajah tetap dipertahankan secara fotorealistik tanpa mengubah identitas.',
  smart_hdr: 'Color grade natural kaya dengan hijau mendalam, highlight hangat golden-hour yang lembut, langit biru bersih, warna kulit akurat, bayangan netral tanpa cast oranye/kuning, serta dynamic range, kontras lokal, tekstur, dan detail fotorealistik khas iPhone 17 Pro Smart HDR.',
}

export function buildRelightPrompt(input = {}, instructions = '', resolution) {
  if (resolution !== undefined && !['1K', '2K', '4K'].includes(resolution)) throw new Error('Resolusi harus 1K, 2K, atau 4K.')
  const settings = normalizeRelightSettings(input)
  if (typeof instructions !== 'string' || instructions.length > 4000) throw new Error('Arahan tambahan maksimal 4000 karakter.')
  const preset = relightPresets.find(item => item.id === settings.preset)
  const choices = Object.fromEntries(Object.entries(relightOptions).map(([key, options]) => [key, options.find(option => option.id === settings[key])]))
  const target = lightingTargets[settings.preset]
  const exposure = settings.preset === 'strobist' ? strobistExposure[settings.intensity] : ''
  const recipe = [
    `LIGHTING PRESET: ${preset.label}. ${preset.prompt}`,
    ...Object.entries(choices).map(([key, option]) => `${key.toUpperCase()}: ${option.label}. ${option.prompt}`),
    exposure,
    'Kontrol arah, intensitas, warna, karakter dan pola bayangan yang dipilih menggantikan default pencahayaan preset. Kontrol tidak mengubah aturan preservasi isi, identitas atau informasi.',
  ].filter(Boolean).join('\n\n')
  const output = resolution
    ? `Generate at native ${resolution} output resolution. Preserve original orientation and aspect ratio, normalized object positions, framing and geometry. Resolusi pilihan menggantikan hanya batas dimensi piksel asli. Jangan crop, stretch, atau membuat detail sintetis untuk memperbesar preview.`
    : 'Preserve original pixel dimensions, orientation and aspect ratio. Do not crop, resize, upscale or downscale.'
  const block = (heading, content) => `### ${heading}\n\n${content}\n\n---\n\n`
  const genericLight = text => text.replace(/\bflash\b/gi, 'cahaya utama').replace(/strobist/gi, preset.label)
  const body = relightMasterPromptV3.split(/(?=^### )/m).map(original => {
    if (original.startsWith('### TUGAS UTAMA')) return block('TUGAS UTAMA', `Edit pencahayaan foto yang diunggah menggunakan ${preset.label}. Gunakan foto sumber sebagai satu-satunya sumber kebenaran visual.\n\n**HASIL WAJIB MENUNJUKKAN PERUBAHAN PENCAHAYAAN YANG JELAS DAN TERLIHAT DIBANDINGKAN FOTO ASLI.**\n\n${target}\n\nDUA TARGET WAJIB: perubahan lighting lokal terlihat jelas, dan seluruh isi, identitas, pose, geometri, teks, angka, logo serta detail asli dipertahankan. Jangan membuat ulang adegan. Perubahan highlight, bayangan dan tonalitas akibat cahaya baru diizinkan; preservasi tidak berarti mempertahankan pencahayaan lama.`)
    if (original.startsWith('### 1.')) return original.replace(/Tentukan secara otomatis[\s\S]*?(?=\*\*Jangan mengubah waktu)/, `Gunakan kontrol arah: ${choices.direction.label}. ${choices.direction.prompt}\n\nJika Otomatis, analisis geometri dan sumber cahaya untuk memilih arah paling realistis. Jika arah dipilih pengguna, gunakan arah itu secara konsisten.\n\n`)
    if (original.startsWith('### 2.')) return block('2. PENGATURAN PENCAHAYAAN TERPILIH', `${recipe}\n\nJangan menampilkan lampu, softbox, reflektor, light stand atau peralatan fotografi tambahan.`)
    if (original.startsWith('### 3.')) return block('3. KESEIMBANGAN SUBJEK DAN AMBIENT', `${target}\n\n${exposure || 'Sesuaikan ambient dengan karakter preset dan intensitas pilihan. Jangan memaksakan background lebih gelap untuk semua gaya.'}\n\nTarget exposure bersifat adaptif terhadap headroom highlight dan detail shadow. Pertahankan sumber cahaya ruangan, warna ambient, langit, cuaca dan waktu asli. Kurangi efek hanya di area yang akan kehilangan informasi; perubahan lighting pada area lain tetap harus terlihat jelas.`)
    if (original.startsWith('### 4.')) return genericLight(original)
    if (original.startsWith('### 5.')) return genericLight(original).replace('- Background mempertahankan ambient yang lebih rendah.', '- Background mengikuti keseimbangan ambient dari preset dan intensitas terpilih.')
    if (original.startsWith('### 9.')) return block('9. WARNA DAN TONALITAS', `${choices.temperature.prompt}\n\nPerubahan warna hanya akibat pencahayaan pada permukaan, bukan mengecat ulang material. Pertahankan warna kulit alami, highlight terkontrol, shadow berdetail, gradasi halus dan saturasi realistis. Jangan menerapkan filter global kuning/biru, HDR berlebihan, orange-teal grading, vintage filter, artificial glow, halo, highlight clipping, crushed blacks atau skin whitening.`)
    if (original.startsWith('### 10.')) return block('10. TARGET PERUBAHAN VISUAL YANG WAJIB TERLIHAT', `**HASIL EDIT TIDAK BOLEH HANYA TERLIHAT SEPERTI FOTO ASLI DENGAN BRIGHTNESS SEDIKIT BERBEDA.**\n\n${target}\n\n${choices.intensity.prompt}\n\n${exposure}\n\nPeriksa highlight terarah, bentuk dan arah bayangan, falloff serta pemisahan tonal. Jika perubahan belum jelas, tingkatkan perubahan lokal pada area aman sesuai intensitas, bukan mengubah isi atau brightness global.`)
    if (original.startsWith('### 11.')) return genericLight(original)
    if (original.startsWith('### 12.')) return original.replace(/#### A\. VALIDASI PENCAHAYAAN[\s\S]*?(?=#### B\.)/, `#### A. VALIDASI PENCAHAYAAN\n\n${target}\n\nPastikan arah, warna, intensitas, karakter serta pola bayangan sesuai pilihan. Bandingkan dengan sumber: perubahan harus terlihat pada highlight, shadow, falloff dan bentuk cahaya, bukan hanya brightness global. Jika belum terlihat, tingkatkan efek secara selektif di area aman.\n\n`)
    if (original.startsWith('### 13.')) return original.replace('Hasil harus memperlihatkan perubahan pencahayaan strobist yang jelas, terutama melalui perbedaan exposure subjek dan background.', `Hasil harus memperlihatkan perubahan pencahayaan ${preset.label} yang jelas. ${target}`).replace('seluruh karakter strobist.', `seluruh karakter ${preset.label}.`)
    if (original.startsWith('### 14.')) return block('14. OUTPUT FINAL', `Hasilkan foto dengan gaya **${preset.label}**, intensitas **${choices.intensity.label}**, warna **${choices.temperature.label}**, bayangan **${choices.shadows.label}**, pola **${choices.pattern.label}**, arah **${choices.direction.label}**.\n\n${target}\n\n${output}\n\nGunakan foto asli sebagai dasar. Never add, remove, replace, move or reconstruct scene elements. Pertahankan identity, pose, source pixels, source-derived microdetail, teks, angka, logo, struktur serta komposisi sesuai aturan di atas. Lighting changes are permitted and required on safe regions.\n\n${instructions.trim() ? `ARAHAN LIGHTING TAMBAHAN (tunduk pada kontrol pilihan dan seluruh aturan preservasi):\n${instructions.trim()}\n\n` : ''}Kembalikan hanya foto hasil edit, utamakan PNG lossless. Tanpa teks tambahan, bingkai, watermark baru, peralatan fotografi atau layout perbandingan.\n\n**FINAL DIRECTIVE: transformasi lighting wajib terlihat sesuai intensitas pilihan. Jangan mengembalikan foto sumber yang hampir tidak berubah. Kurangi efek hanya pada detail yang terancam; pertahankan transformasi pada area aman lainnya.**\n\n**PRESERVE THE ORIGINAL IMAGE CONTENT AND SOURCE-DERIVED MICRODETAIL. TRANSFORM THE LIGHTING, NOT THE SCENE.**`)
    if (!original.startsWith('### ')) return original.replace(/^## PROFESSIONAL STROBIST FLASH.*$/m, `## ${preset.label.toUpperCase()} - VISIBLE LIGHTING TRANSFORMATION & STRICT ORIGINAL IMAGE PRESERVATION`)
    return original
  }).join('')
  if (!resolution) return body
  return body
    .replace('- Resolusi dan dimensi piksel.\n', '')
    .replace('- Pertahankan dimensi piksel asli, orientasi, framing, dan rasio aspek jika perangkat memungkinkan.', `- ${output}`)
    .replace('- Dimensi gambar tidak berubah.', '- Dimensi hasil sesuai resolusi pilihan; orientasi dan rasio aspek sumber dipertahankan.')
}
