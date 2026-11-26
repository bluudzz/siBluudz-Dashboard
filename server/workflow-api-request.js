import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { resolveValue } from '../shared/workflow-engine.js'
import { publicIpv4, validatePublicUrl } from './workflow-external.js'

const MAX_RESPONSE_BYTES = 512_000
const MAX_ITEMS = 10
const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding'])

export async function safeHttpsRequest(rawUrl, { method = 'GET', headers = {}, body = '', signal, maxBytes = MAX_RESPONSE_BYTES, timeoutMs = 20_000, requestImpl } = {}) {
  const upperMethod = String(method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(upperMethod)) throw new Error('Metode HTTP tidak didukung.')
  const url = validatePublicUrl(rawUrl)
  if (requestImpl) {
    return await requestImpl(url.toString(), { method: upperMethod, headers, body, signal })
  }
  const addresses = await lookup(url.hostname, { family: 4, all: true, verbatim: true })
  if (!addresses.length || addresses.some(entry => !publicIpv4(entry.address))) {
    throw new Error('Alamat mengarah ke jaringan privat atau tidak tersedia lewat IPv4 publik.')
  }
  const address = addresses[0].address
  const cleanHeaders = { 'user-agent': 'siBluudz-Workflow/1.0', accept: 'application/json, text/plain, text/html, */*' }
  for (const [k, v] of Object.entries(headers || {})) {
    const lower = String(k).toLowerCase().trim()
    if (!lower || FORBIDDEN_HEADERS.has(lower) || /[\r\n]/.test(lower) || /[\r\n]/.test(String(v))) continue
    cleanHeaders[lower] = String(v)
  }
  const payload = body && ['POST', 'PUT', 'PATCH'].includes(upperMethod) ? String(body) : ''
  if (payload && !cleanHeaders['content-type']) cleanHeaders['content-type'] = 'application/json'
  if (payload) cleanHeaders['content-length'] = String(Buffer.byteLength(payload, 'utf8'))

  const responseLimit = Math.min(2_000_000, Math.max(1, Number(maxBytes) || MAX_RESPONSE_BYTES))
  return await new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: upperMethod,
      headers: cleanHeaders,
      timeout: timeoutMs,
      lookup: (_hostname, options, callback) => options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4),
    }, response => {
      const status = response.statusCode || 0
      if (status >= 300 && status < 400) {
        response.resume()
        reject(new Error('Pengalihan URL tidak diikuti demi keamanan. Gunakan URL tujuan langsung.'))
        return
      }
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > responseLimit) {
          req.destroy(new Error(`Respons melebihi ${Math.round(responseLimit / 1000)} KB.`))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        status,
        headers: response.headers || {},
        contentType: String(response.headers?.['content-type'] || ''),
        body: Buffer.concat(chunks).toString('utf8'),
      }))
      response.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Permintaan HTTP melewati batas waktu.')))
    req.on('error', reject)
    if (signal) {
      if (signal.aborted) {
        req.destroy(signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.'))
        return
      }
      signal.addEventListener('abort', () => req.destroy(signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')), { once: true })
    }
    if (payload) req.write(payload)
    req.end()
  })
}

export async function runApiRequestNode({ node, input }, { requestImpl, signal } = {}) {
  if (input.length > MAX_ITEMS) throw new Error('HTTP / Webhook Request menerima maksimal 10 item per pengujian.')
  const method = String(node.data.method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error('Metode HTTP tidak didukung.')

  const output = []
  for (const item of input) {
    const rawUrl = String(resolveValue(node.data.url || '{{ $json.url }}', item.json)).trim()
    let parsedHeaders = {}
    if (String(node.data.headers || '').trim()) {
      const rawHeaders = typeof node.data.headers === 'string' ? JSON.parse(node.data.headers) : node.data.headers
      if (!rawHeaders || typeof rawHeaders !== 'object' || Array.isArray(rawHeaders)) throw new Error('Headers harus berupa objek JSON.')
      parsedHeaders = resolveValue(rawHeaders, item.json)
    }
    let bodyText = ''
    if (['POST', 'PUT', 'PATCH'].includes(method) && String(node.data.body || '').trim()) {
      if (typeof node.data.body === 'string') {
        try {
          const parsedTemplate = JSON.parse(node.data.body)
          bodyText = JSON.stringify(resolveValue(parsedTemplate, item.json))
        } catch {
          const resolved = resolveValue(node.data.body, item.json)
          bodyText = typeof resolved === 'string' ? JSON.stringify(JSON.parse(resolved)) : JSON.stringify(resolved)
        }
      } else {
        bodyText = JSON.stringify(resolveValue(node.data.body, item.json))
      }
    }
    const response = await safeHttpsRequest(rawUrl, { method, headers: parsedHeaders, body: bodyText, signal, requestImpl })
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`HTTP ${response.status}: ${String(response.body || 'Permintaan ditolak server tujuan.').slice(0, 240)}`)
    }
    let responseBody = response.body
    if (/application\/json/i.test(response.contentType) && response.body.trim()) {
      try { responseBody = JSON.parse(response.body) } catch { /* Keep raw text when server returns malformed JSON */ }
    }
    output.push({
      json: {
        ...item.json,
        url: rawUrl,
        method,
        statusCode: response.status,
        responseHeaders: response.headers,
        responseBody,
        output: responseBody,
      },
    })
  }
  return output
}
