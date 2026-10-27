import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { resolveValue } from '../shared/workflow-engine.js'

const MAX_RESPONSE_BYTES = 256_000
const MAX_ITEMS = 10

export function publicIpv4(address) {
  if (isIP(address) !== 4) return false
  const [a,b,c] = address.split('.').map(Number)
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113))
}

export function validatePublicUrl(rawUrl) {
  let url
  try { url = new URL(rawUrl) } catch { throw new Error('URL harus berupa alamat HTTPS lengkap.') }
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || isIP(url.hostname) || url.hostname === 'localhost' || url.hostname.endsWith('.local') || url.toString().length > 2048) throw new Error('Hanya URL HTTPS publik tanpa kredensial yang diizinkan.')
  if ([...url.searchParams.keys()].some(key => /(^|[_-])(api[_-]?key|token|secret|password|access[_-]?key|authorization)([_-]|$)/i.test(key))) throw new Error('Kunci akses tidak boleh ditaruh di parameter URL workflow.')
  return url
}

export async function getPublicText(rawUrl,{signal,maxBytes=MAX_RESPONSE_BYTES}={}) {
  const responseLimit=Math.min(1_000_000,Math.max(1,Number(maxBytes)||MAX_RESPONSE_BYTES))
  const url = validatePublicUrl(rawUrl)
  const addresses = await lookup(url.hostname, {family:4,all:true,verbatim:true})
  if (!addresses.length || addresses.some(entry => !publicIpv4(entry.address))) throw new Error('Alamat mengarah ke jaringan privat atau tidak tersedia lewat IPv4 publik.')
  const address = addresses[0].address
  return await new Promise((resolve,reject) => {
    const req = https.request(url, {method:'GET',headers:{'user-agent':'siBluudz-Workflow/1.0','accept':'application/json, application/xml, text/xml, text/plain, text/html, application/rss+xml'},timeout:10_000,lookup:(_hostname,options,callback)=>options.all?callback(null,[{address,family:4}]):callback(null,address,4)}, response => {
      if ((response.statusCode || 0) >= 300 && (response.statusCode || 0) < 400) { response.resume(); reject(new Error('Pengalihan URL tidak diikuti demi keamanan. Gunakan URL tujuan langsung.')); return }
      if ((response.statusCode || 0) < 200 || (response.statusCode || 0) >= 300) { response.resume(); reject(new Error(`Sumber mengembalikan HTTP ${response.statusCode}.`)); return }
      const chunks = []; let size = 0
      response.on('data', chunk => { size += chunk.length; if (size > responseLimit) { req.destroy(new Error(`Respons melebihi ${Math.round(responseLimit/1000)} KB.`)); return } chunks.push(chunk) })
      response.on('end', () => resolve({status:response.statusCode,contentType:String(response.headers['content-type'] || ''),body:Buffer.concat(chunks).toString('utf8')}))
      response.on('error', reject)
    })
    req.on('timeout', () => req.destroy(new Error('Sumber tidak merespons dalam 10 detik.')))
    req.on('error', reject)
    if(signal){
      if(signal.aborted){req.destroy(signal.reason instanceof Error?signal.reason:new Error('Pengujian dihentikan pengguna.'));return}
      signal.addEventListener('abort',()=>req.destroy(signal.reason instanceof Error?signal.reason:new Error('Pengujian dihentikan pengguna.')),{once:true})
    }
    req.end()
  })
}

function decodeXml(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[\da-f]+|\d+);|&(amp|lt|gt|quot|apos|#39);/gi, (full,number,named) => {
    if (number) { const code = number[0].toLowerCase() === 'x' ? Number.parseInt(number.slice(1),16) : Number(number); return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : full }
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",'#39':"'"}[named.toLowerCase()] || full
  })
}
function xmlField(item, name) {
  return decodeXml((item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,'i')) || [undefined,''])[1]).trim()
}
export function newsItems(xml, limit) {
  const matches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0,limit)
  return matches.map(([,item]) => ({title:xmlField(item,'title'),url:xmlField(item,'link'),publishedAt:xmlField(item,'pubDate'),source:xmlField(item,'source')})).filter(item => item.title && item.url)
}

export async function runExternalNode({node,input}, read = getPublicText, {signal}={}) {
  if (input.length > MAX_ITEMS) throw new Error('Node internet menerima maksimal 10 item per pengujian.')
  if (node.type === 'searchContent') return await Promise.all(input.map(async item => {
    const query = String(resolveValue(node.data.query || '{{ $json.topic }}',item.json)).trim()
    if (!query || query.length > 200) throw new Error('Topik pencarian wajib diisi, maksimal 200 karakter.')
    const limit = Math.min(10,Math.max(1,Number(node.data.limit) || 5))
    const url = new URL('https://news.google.com/rss/search')
    url.search = new URLSearchParams({q:query,hl:'id',gl:'ID',ceid:'ID:id'}).toString()
    const response = await read(url.toString(),{signal})
    const sources = newsItems(response.body,limit)
    return {json:{...item.json,query,sources,sourceCount:sources.length,searchedAt:new Date().toISOString()}}
  }))
  if (node.type === 'httpRequest') return await Promise.all(input.map(async item => {
    const url = String(resolveValue(node.data.url || '',item.json)).trim()
    const response = await read(url,{signal})
    let content = response.body
    if (/application\/json/i.test(response.contentType)) { try { content = JSON.parse(response.body) } catch { throw new Error('Sumber mengaku JSON tetapi isinya tidak valid.') } }
    return {json:{...item.json,url,statusCode:response.status,content}}
  }))
  throw new Error('Node internet tidak didukung.')
}
