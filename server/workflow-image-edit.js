import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import sharp from 'sharp'
import { db, getNineRouterConfig, getSetting } from './db.js'
import { requestImageEdit } from './ai-image-edit.js'
import { resolveValue, workflowInput } from '../shared/workflow-engine.js'
import { publicIpv4, validatePublicUrl } from './workflow-external.js'
import { readWorkflowMedia, storeWorkflowImage } from './workflow-media.js'

const MAX_ITEMS = 10
const MAX_SOURCE_BYTES = 12 * 1024 * 1024
const ASPECT_DIMENSIONS = {
  '4:5': { width: 1080, height: 1350 },
  '1:1': { width: 1080, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
}

function escapeXml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function wrapLines(text, maxChars, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length <= maxChars) {
      current = next
    } else {
      if (current) lines.push(current)
      current = word.slice(0, maxChars)
      if (lines.length >= maxLines) break
    }
  }
  if (current && lines.length < maxLines) lines.push(current)
  return lines.slice(0, maxLines)
}

function buildOverlaySvg(width, height, { title = '', subtitle = '', watermark = '', position = 'bottom' }) {
  const padX = Math.round(width * 0.065)
  const titleSize = Math.max(28, Math.round(width * 0.048))
  const subSize = Math.max(20, Math.round(width * 0.028))
  const wmSize = Math.max(16, Math.round(width * 0.022))
  const maxChars = Math.max(14, Math.floor((width - padX * 2) / (titleSize * 0.56)))
  const titleLines = wrapLines(title, maxChars, 3)
  const subLines = wrapLines(subtitle, Math.floor(maxChars * 1.4), 2)
  const hasCopy = titleLines.length > 0 || subLines.length > 0

  const blockHeight = (titleLines.length * titleSize * 1.25) + (subLines.length * subSize * 1.35) + (hasCopy ? padX : 0)
  const scrimY = position === 'top' ? 0 : position === 'center' ? Math.max(0, Math.round((height - blockHeight - 80) / 2)) : Math.max(0, height - Math.round(blockHeight + padX * 1.6))
  const scrimHeight = height - scrimY

  let cursorY = position === 'top'
    ? padX + titleSize
    : position === 'center'
      ? Math.round((height - blockHeight) / 2) + titleSize
      : Math.max(padX + titleSize, height - Math.round(blockHeight) - Math.round(padX * 0.6) + titleSize)

  const elements = []
  if (hasCopy) {
    elements.push(`<defs><linearGradient id="scrim" x1="0" y1="${position === 'top' ? '0' : '1'}" x2="0" y2="${position === 'top' ? '1' : '0'}"><stop offset="0%" stop-color="#090d14" stop-opacity="${position === 'center' ? '0.62' : '0.82'}"/><stop offset="100%" stop-color="#090d14" stop-opacity="0.12"/></linearGradient></defs>`)
    elements.push(`<rect x="0" y="${scrimY}" width="${width}" height="${position === 'center' ? Math.round(blockHeight + 80) : scrimHeight}" fill="url(#scrim)"/>`)
  }

  for (const line of titleLines) {
    elements.push(`<text x="${padX}" y="${Math.round(cursorY)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#ffffff">${escapeXml(line)}</text>`)
    cursorY += titleSize * 1.25
  }
  if (subLines.length) cursorY += Math.round(subSize * 0.25)
  for (const line of subLines) {
    elements.push(`<text x="${padX}" y="${Math.round(cursorY)}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${subSize}" font-weight="500" fill="#e5ecf4">${escapeXml(line)}</text>`)
    cursorY += subSize * 1.35
  }
  const wm = String(watermark || '').trim().slice(0, 60)
  if (wm) {
    const wmY = position === 'top' ? height - Math.round(padX * 0.65) : Math.round(padX * 0.85)
    elements.push(`<text x="${width - padX}" y="${wmY}" text-anchor="end" font-family="DejaVu Sans, Arial, sans-serif" font-size="${wmSize}" font-weight="600" fill="rgba(255,255,255,0.82)">${escapeXml(wm)}</text>`)
  }
  if (!elements.length) return null
  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${elements.join('')}</svg>`
}

export async function loadSourceImage(userId, itemJson, explicitSource = '', { fetchImpl = fetch, signal } = {}) {
  const candidate = String(explicitSource || itemJson.imageUrl || itemJson.imagePreviewUrl || '').trim()
  if (!candidate) throw new Error('Tidak ada gambar sumber dari langkah sebelumnya.')
  const local = await readWorkflowMedia(userId, candidate)
  if (local) {
    if (!local.mimeType.startsWith('image/')) throw new Error('Media sumber bukan berkas gambar.')
    return local
  }
  const url = validatePublicUrl(candidate)
  if (fetchImpl === fetch) {
    const addresses = await lookup(url.hostname, { family: 4, all: true, verbatim: true })
    if (!addresses.length || addresses.some(entry => !publicIpv4(entry.address))) {
      throw new Error('URL gambar mengarah ke jaringan privat yang tidak diizinkan.')
    }
  }
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
  })
  if (!response.ok) throw new Error(`Gagal mengunduh gambar sumber (HTTP ${response.status}).`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length || buffer.length > MAX_SOURCE_BYTES) throw new Error('Ukuran gambar sumber melebihi batas 12 MB.')
  return { buffer, mimeType: String(response.headers.get('content-type') || 'image/jpeg').split(';')[0] }
}

async function storeDecodedOrUrl(userId, imageStr, storeImage) {
  if (imageStr.startsWith('data:image/')) {
    const comma = imageStr.indexOf(',')
    const header = imageStr.slice(0, comma)
    let raw = Buffer.from(imageStr.slice(comma + 1), 'base64')
    if (!/data:image\/(?:jpeg|png)/i.test(header)) {
      raw = await sharp(raw, { limitInputPixels: 40_000_000 }).flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).toBuffer()
    }
    return await storeImage(userId, raw.toString('base64'))
  }
  const url = validatePublicUrl(imageStr)
  return {
    imageUrl: url.toString(),
    previewUrl: url.toString(),
    mimeType: /\.png(?:$|\?)/i.test(url.pathname) ? 'image/png' : 'image/jpeg',
  }
}

export async function runImageEditNode({ node, input }, user, { editImpl = requestImageEdit, fetchImpl = fetch, storeImage = storeWorkflowImage, signal } = {}) {
  if (input.length > MAX_ITEMS) throw new Error('Edit & Olah Gambar menerima maksimal 10 item per pengujian.')
  const editMode = String(node.data.editMode || 'igFormat')
  if (!['igFormat', 'aiEdit'].includes(editMode)) throw new Error('Mode edit gambar tidak didukung.')

  const output = []
  if (editMode === 'igFormat') {
    const aspectRatio = String(node.data.aspectRatio || '4:5')
    const position = ['top', 'center', 'bottom'].includes(String(node.data.textPosition || 'bottom')) ? String(node.data.textPosition || 'bottom') : 'bottom'
    for (const item of input) {
      if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
      const source = await loadSourceImage(user.id, item.json, '', { fetchImpl, signal })
      let pipeline = sharp(source.buffer, { limitInputPixels: 40_000_000 }).rotate()
      const target = ASPECT_DIMENSIONS[aspectRatio]
      if (target) {
        pipeline = pipeline.resize(target.width, target.height, { fit: 'cover', position: 'centre' })
      } else {
        pipeline = pipeline.resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      }
      const resizedBuffer = await pipeline.jpeg({ quality: 92 }).toBuffer()
      const meta = await sharp(resizedBuffer).metadata()
      const width = meta.width || 1080
      const height = meta.height || 1350
      const title = String(node.data.overlayTitle || '').trim() ? String(resolveValue(node.data.overlayTitle, item.json)) : ''
      const subtitle = String(node.data.overlaySubtitle || '').trim() ? String(resolveValue(node.data.overlaySubtitle, item.json)) : ''
      const watermark = String(node.data.watermark || '').trim() ? String(resolveValue(node.data.watermark, item.json)) : ''
      const svg = buildOverlaySvg(width, height, { title, subtitle, watermark, position })
      const finalBuffer = svg
        ? await sharp(resizedBuffer).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 90 }).toBuffer()
        : resizedBuffer
      const stored = await storeImage(user.id, finalBuffer.toString('base64'), 'image/jpeg')
      output.push({
        json: {
          ...item.json,
          imageUrl: stored.imageUrl,
          imagePreviewUrl: stored.previewUrl,
          imageMime: stored.mimeType,
          editMode: 'igFormat',
          editedWidth: width,
          editedHeight: height,
        },
      })
    }
    return output
  }

  const config = getNineRouterConfig()
  if (!config.apiKey) throw new Error('Hubungkan API Key 9router sebelum mengedit gambar dengan AI.')
  const model = String(node.data.model || getSetting('ninerouter_image_model', '')).trim()
  if (!model) throw new Error('Pilih model gambar 9router pada node Edit & Olah Gambar.')
  const resolution = ['1K', '2K', '4K'].includes(String(node.data.resolution || '')) ? String(node.data.resolution) : undefined
  const tier = user.tier || (user.role === 'admin' ? 'pro' : 'free')
  const limit = user.ai_daily_limit ?? (tier === 'pro' ? config.proDailyLimit : config.freeDailyLimit)

  for (const item of input) {
    const count = db.prepare("select count(*) as count from ai_usage_logs where user_id=? and date(created_at,'localtime')=date('now','localtime')").get(user.id).count
    if (user.role !== 'admin' && count >= limit) throw new Error('Kuota AI harian habis. Periksa pengaturan akun Anda.')
    const latest = workflowInput(item.json)
    const automaticPrompt = latest && typeof latest === 'object' ? latest.prompt : latest
    const selected = String(node.data.prompt || '').trim() ? resolveValue(node.data.prompt, item.json) : automaticPrompt
    if (typeof selected !== 'string' || !selected.trim() || selected.trim().length > 4000) {
      throw new Error('Isi instruksi edit gambar (maksimal 4.000 karakter) atau kirim prompt teks dari langkah sebelumnya.')
    }
    const prompt = selected.trim()
    if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
    const source = await loadSourceImage(user.id, item.json, '', { fetchImpl, signal })
    const normalizedJpeg = await sharp(source.buffer, { limitInputPixels: 40_000_000 }).rotate().jpeg({ quality: 92 }).toBuffer()
    const sceneImage = `data:image/jpeg;base64,${normalizedJpeg.toString('base64')}`
    const edited = await editImpl({ baseUrl: config.baseUrl, apiKey: config.apiKey, model, sceneImage, prompt, resolution })
    const stored = await storeDecodedOrUrl(user.id, edited.image, storeImage)
    db.prepare('insert into ai_usage_logs (id,user_id,prompt_tokens,completion_tokens,model,type) values (?,?,?,?,?,?)').run(randomUUID(), user.id, 0, 0, model, 'workflow_image_edit')
    output.push({
      json: {
        ...item.json,
        prompt,
        imageUrl: stored.imageUrl,
        imagePreviewUrl: stored.previewUrl,
        imageMime: stored.mimeType,
        imageModel: model,
        imagePrompt: prompt,
        editMode: 'aiEdit',
        ...(edited.output?.width ? { editedWidth: edited.output.width, editedHeight: edited.output.height } : {}),
      },
    })
  }
  return output
}
