export const EXPORT_TARGET_BYTES = Math.round(2.5 * 1024 * 1024)
export const EXPORT_LOSSLESS_MAX_BYTES = Math.round(3.5 * 1024 * 1024)
export const EXPORT_QUALITY_MAX = 0.98
export const EXPORT_QUALITY_MIN = 0.90
export const EXPORT_SEARCH_STEPS = 5

export function computePngKeepLimit(relitBytes: number): number {
  if (!Number.isFinite(relitBytes) || relitBytes <= 0) return EXPORT_TARGET_BYTES
  return Math.min(EXPORT_LOSSLESS_MAX_BYTES, Math.max(EXPORT_TARGET_BYTES, Math.round(relitBytes * 1.25)))
}

export function selectExportDimensions(
  baseWidth: number,
  baseHeight: number,
  relitWidth: number,
  relitHeight: number
) {
  const baseArea = Math.max(0, baseWidth) * Math.max(0, baseHeight)
  const relitArea = Math.max(0, relitWidth) * Math.max(0, relitHeight)
  if (baseArea >= relitArea && baseWidth > 0 && baseHeight > 0) {
    return { width: baseWidth, height: baseHeight }
  }
  return {
    width: relitWidth > 0 ? relitWidth : baseWidth,
    height: relitHeight > 0 ? relitHeight : baseHeight,
  }
}

export function chooseTargetMime(
  sourceMime: string,
  hasAlpha: boolean
): { mime: 'image/jpeg' | 'image/webp'; ext: 'jpg' | 'webp' } {
  if (sourceMime === 'image/webp' || hasAlpha) {
    return { mime: 'image/webp', ext: 'webp' }
  }
  return { mime: 'image/jpeg', ext: 'jpg' }
}

export async function encodeWithinBudget<T extends { size: number }>(
  encodeAtQuality: (quality: number) => Promise<T | null>,
  maxBytes: number
): Promise<{ blob: T; quality: number } | null> {
  if (maxBytes <= 0) {
    const blob = await encodeAtQuality(0.92)
    return blob ? { blob, quality: 0.92 } : null
  }

  const maxBlob = await encodeAtQuality(EXPORT_QUALITY_MAX)
  if (!maxBlob) return null
  if (maxBlob.size <= maxBytes) {
    return { blob: maxBlob, quality: EXPORT_QUALITY_MAX }
  }

  const minBlob = await encodeAtQuality(EXPORT_QUALITY_MIN)
  if (!minBlob) {
    return { blob: maxBlob, quality: EXPORT_QUALITY_MAX }
  }
  if (minBlob.size > maxBytes) {
    return { blob: minBlob, quality: EXPORT_QUALITY_MIN }
  }

  let low = EXPORT_QUALITY_MIN
  let high = EXPORT_QUALITY_MAX
  let best: { blob: T; quality: number } = { blob: minBlob, quality: EXPORT_QUALITY_MIN }

  for (let step = 0; step < EXPORT_SEARCH_STEPS; step++) {
    const mid = Math.round(((low + high) / 2) * 1000) / 1000
    const candidate = await encodeAtQuality(mid)
    if (!candidate) break
    if (candidate.size <= maxBytes) {
      best = { blob: candidate, quality: mid }
      low = mid
    } else {
      high = mid
    }
  }

  return best
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new Blob([bytes], { type: match[1] })
  } catch {
    return null
  }
}

export function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
) {
  if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
    return
  }
  const scale = Math.min(targetWidth / img.naturalWidth, targetHeight / img.naturalHeight)
  const drawWidth = img.naturalWidth * scale
  const drawHeight = img.naturalHeight * scale
  ctx.drawImage(
    img,
    (targetWidth - drawWidth) / 2,
    (targetHeight - drawHeight) / 2,
    drawWidth,
    drawHeight
  )
}

function loadHtmlImage(src: string, crossOrigin?: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    if (crossOrigin && src.startsWith('http')) img.crossOrigin = crossOrigin
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Gagal memuat gambar untuk ekspor.'))
    img.src = src
  })
}

function canvasHasTransparency(sourceCanvas: HTMLCanvasElement): boolean {
  const probe = document.createElement('canvas')
  probe.width = 64
  probe.height = 64
  const pCtx = probe.getContext('2d')
  if (!pCtx) return false
  pCtx.drawImage(sourceCanvas, 0, 0, 64, 64)
  const { data } = pCtx.getImageData(0, 0, 64, 64)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true
  }
  return false
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
}

function extFromMimeOrUrl(mime: string, fallbackExt?: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  const clean = fallbackExt?.replace(/^\./, '').toLowerCase()
  if (clean === 'jpeg') return 'jpg'
  return clean || 'png'
}

export async function exportRelightImage({
  sourceDataUrl,
  resultImageUrl,
  strength,
  resultFormat,
}: {
  sourceDataUrl: string
  resultImageUrl: string
  strength: number
  resultFormat?: string
}): Promise<{ blob: Blob; ext: string; width: number; height: number } | null> {
  const sourceBlob = dataUrlToBlob(sourceDataUrl)
  const sourceMime = sourceBlob?.type || 'image/png'

  if (strength <= 0 && sourceBlob) {
    return {
      blob: sourceBlob,
      ext: extFromMimeOrUrl(sourceMime),
      width: 0,
      height: 0,
    }
  }

  if (strength >= 100) {
    let rawBlob: Blob | null = null
    if (resultImageUrl.startsWith('data:image/')) {
      rawBlob = dataUrlToBlob(resultImageUrl)
    } else if (resultImageUrl.startsWith('http')) {
      try {
        const response = await fetch(resultImageUrl)
        if (response.ok) rawBlob = await response.blob()
      } catch {
        return null
      }
    }
    if (!rawBlob) return null

    const rawExt = extFromMimeOrUrl(rawBlob.type, resultFormat)
    if (rawBlob.size <= EXPORT_LOSSLESS_MAX_BYTES) {
      return { blob: rawBlob, ext: rawExt, width: 0, height: 0 }
    }

    const tempUrl = URL.createObjectURL(rawBlob)
    try {
      const relitImg = await loadHtmlImage(tempUrl)
      const width = relitImg.naturalWidth
      const height = relitImg.naturalHeight
      if (width <= 0 || height <= 0) {
        return { blob: rawBlob, ext: rawExt, width: 0, height: 0 }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return { blob: rawBlob, ext: rawExt, width, height }
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(relitImg, 0, 0, width, height)

      const hasAlpha = sourceMime === 'image/png' && canvasHasTransparency(canvas)
      const { mime, ext } = chooseTargetMime(sourceMime, hasAlpha)
      const encoded = await encodeWithinBudget((q) => canvasToBlob(canvas, mime, q), EXPORT_TARGET_BYTES)
      if (encoded && encoded.blob.size < rawBlob.size) {
        return { blob: encoded.blob, ext, width, height }
      }
      return { blob: rawBlob, ext: rawExt, width, height }
    } finally {
      URL.revokeObjectURL(tempUrl)
    }
  }

  const relitBytes = resultImageUrl.startsWith('data:image/')
    ? (dataUrlToBlob(resultImageUrl)?.size ?? 0)
    : 0
  const pngKeepLimit = computePngKeepLimit(relitBytes)

  const [baseImg, relitImg] = await Promise.all([
    loadHtmlImage(sourceDataUrl),
    loadHtmlImage(resultImageUrl, 'anonymous'),
  ])
  const { width, height } = selectExportDimensions(
    baseImg.naturalWidth,
    baseImg.naturalHeight,
    relitImg.naturalWidth,
    relitImg.naturalHeight
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Kanvas browser tidak tersedia untuk menggabungkan hasil.')

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.globalAlpha = 1
  drawContain(ctx, baseImg, width, height)
  ctx.globalAlpha = strength / 100
  drawContain(ctx, relitImg, width, height)

  const pngBlob = await canvasToBlob(canvas, 'image/png')
  if (pngBlob && pngBlob.size <= pngKeepLimit) {
    return { blob: pngBlob, ext: 'png', width, height }
  }

  const hasAlpha = sourceMime === 'image/png' && canvasHasTransparency(canvas)
  const { mime, ext } = chooseTargetMime(sourceMime, hasAlpha)
  const encoded = await encodeWithinBudget((q) => canvasToBlob(canvas, mime, q), EXPORT_TARGET_BYTES)
  if (encoded && (!pngBlob || encoded.blob.size < pngBlob.size)) {
    return { blob: encoded.blob, ext, width, height }
  }
  if (pngBlob) {
    return { blob: pngBlob, ext: 'png', width, height }
  }
  throw new Error('Gagal merender file gambar komposit.')
}
