import sharp from 'sharp'

function providerError(message, status = 502) {
  const error = new Error(message)
  error.status = status
  return error
}

function errorMessage(data, fallback) {
  const message = data?.error?.message || (typeof data?.error === 'string' ? data.error : '') || data?.message
  return typeof message === 'string' && message.trim() ? message.trim().slice(0, 500) : fallback
}

function imageFromResponse(data) {
  const item = data?.data?.[0]
  if (typeof item?.b64_json === 'string' && item.b64_json) {
    const mime = item.b64_json.startsWith('/9j/') ? 'jpeg' : item.b64_json.startsWith('UklGR') ? 'webp' : 'png'
    return `data:image/${mime};base64,${item.b64_json}`
  }
  if (typeof item?.url === 'string' && /^(https?:\/\/|data:image\/)/.test(item.url)) return item.url
  const message = data?.choices?.[0]?.message
  const parts = [...(Array.isArray(message?.content) ? message.content : []), ...(Array.isArray(message?.images) ? message.images : [])]
  for (const part of parts) {
    if (/^(https?:\/\/|data:image\/)/.test(part?.image_url?.url || '')) return part.image_url.url
  }
  const content = typeof message?.content === 'string' ? message.content : parts.map(part => part.text || '').join('\n')
  return content.match(/data:image\/[a-zA-Z]+;base64,[A-Za-z0-9+/=]+/)?.[0]
    || content.match(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/)?.[1]
    || null
}

async function readImageStream(response) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let image = null
  const consume = block => {
    const lines = block.split('\n')
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() || ''
    const raw = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n').trim()
    if (!raw || raw === '[DONE]') return
    let data
    try { data = JSON.parse(raw) } catch { throw providerError('Respons stream gambar 9router tidak valid.') }
    if (event === 'error' || data?.error) throw providerError(`9router: ${errorMessage(data, 'Provider gagal menyelesaikan gambar.')}`)
    // Partial frames are previews; only a final image can complete an edit.
    if (event.includes('partial') || String(data?.type || '').includes('partial')) return
    image = imageFromResponse(data) || image
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        consume(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
      }
      if (done) break
    }
    if (buffer.trim()) consume(buffer)
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  return image
}

export async function requestImageEdit({ baseUrl, apiKey, model, sceneImage, productImage, prompt, resolution, quality }) {
  if (resolution !== undefined && !['1K', '2K', '4K'].includes(resolution)) throw providerError('Resolusi harus 1K, 2K, atau 4K.', 400)
  if (quality !== undefined && !['low', 'medium', 'high', 'auto'].includes(quality)) throw providerError('Kualitas gambar tidak valid.', 400)
  if (typeof sceneImage !== 'string' || !/^data:image\//.test(sceneImage)) throw providerError('Foto sumber wajib diunggah.', 400)
  let metadata
  try { metadata = await sharp(Buffer.from(sceneImage.slice(sceneImage.indexOf(',') + 1), 'base64'), { limitInputPixels: 40000000 }).metadata() }
  catch { throw providerError('Foto sumber tidak dapat dibaca. Unggah ulang PNG/JPG/WEBP yang valid.', 400) }
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8
  const [width, height] = rotated ? [metadata.height, metadata.width] : [metadata.width, metadata.height]
  let divisor = width
  let remainder = height
  while (remainder) [divisor, remainder] = [remainder, divisor % remainder]
  const aspectRatio = width / divisor <= 99 && height / divisor <= 99 ? `${width / divisor}:${height / divisor}` : undefined
  const base = baseUrl.replace(/\/+$/, '').replace(/\/(chat\/completions|models|images\/(?:generations|edits))$/, '')
  const response = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' },
    body: JSON.stringify({
      model, prompt, n: 1, stream: true, output_format: 'png', response_format: 'b64_json', image_detail: 'high', aspect_ratio: aspectRatio,
      ...(resolution ? { image_size: resolution } : {}),
      ...(quality ? { quality } : {}),
      // Sending both image and images duplicates the source in 9router's adapters.
      ...(productImage ? { images: [sceneImage, productImage] } : { image: sceneImage }),
    }),
    signal: AbortSignal.timeout(240000),
  })
  if (!response.ok) {
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = null }
    const fallback = text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || response.statusText || 'Provider gambar tidak tersedia.'
    throw providerError(`9router (${response.status}): ${errorMessage(data, fallback)}`, response.status)
  }
  const contentType = response.headers.get('content-type') || ''
  let image
  if (contentType.includes('text/event-stream')) image = await readImageStream(response)
  else {
    let data
    try { data = await response.json() } catch { throw providerError('9router tidak mengembalikan respons gambar JSON atau SSE yang valid.') }
    if (data?.error) throw providerError(`9router: ${errorMessage(data, 'Provider gagal memproses gambar.')}`)
    image = imageFromResponse(data)
  }
  if (!image) throw providerError('Model tidak mengembalikan gambar hasil edit. Periksa model dan status provider gambar di 9router.')
  let output = null
  let warning
  if (image.startsWith('data:image/')) {
    try {
      const buffer = Buffer.from(image.slice(image.indexOf(',') + 1), 'base64')
      const { width, height, format } = await sharp(buffer, { limitInputPixels: 40000000 }).metadata()
      if (width && height) {
        // Gemini's aspect-ratio presets vary in dimensions; compare pixel area to the requested tier.
        const minimumPixels = resolution ? (Number.parseInt(resolution) * 1024) ** 2 * 0.75 : 0
        output = { width, height, bytes: buffer.length, format, requestedResolution: resolution || null, resolutionMatched: resolution ? width * height >= minimumPixels : null }
      }
    } catch { /* URL and undecodable legacy responses remain usable without a verified size. */ }
  }
  if (resolution && !output?.resolutionMatched) {
    warning = output
      ? `Resolusi ${resolution} diminta, tetapi provider mengembalikan ${output.width} × ${output.height} piksel. Hasil tidak diperbesar otomatis. Periksa dukungan resolusi dan adapter 9router.`
      : `Resolusi ${resolution} diminta, tetapi ukuran gambar dari provider belum dapat diverifikasi.`
  }
  return { image, model, output, ...(warning ? { warning } : {}) }
}
