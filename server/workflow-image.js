import { randomUUID } from 'node:crypto'
import { db, getNineRouterConfig, getSetting } from './db.js'
import { resolveValue } from '../shared/workflow-engine.js'
import { storeWorkflowImage } from './workflow-media.js'

const MAX_PROMPT = 4000

function parseImageResponse(data) {
  const item = Array.isArray(data?.data) ? data.data[0] : null
  if (typeof item?.b64_json === 'string') return {encoded:item.b64_json}
  if (typeof item?.url === 'string') return {url:item.url}
  const message = data?.choices?.[0]?.message
  const candidates = [message?.content,...(Array.isArray(message?.images)?message.images.map(image=>image?.image_url?.url||image?.url):[])]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const dataUri = candidate.match(/data:image\/(?:jpeg|png);base64,([A-Za-z0-9+/=]+)/i)
    if (dataUri) return {encoded:dataUri[1]}
    const remoteUrl = candidate.match(/https:\/\/[^\s)"'<>]+\.(?:jpe?g|png)(?:\?[^\s)"'<>]*)?/i)
    if (remoteUrl) return {url:remoteUrl[0]}
  }
  throw new Error('Model gambar tidak mengembalikan JPEG, PNG, atau URL gambar yang dapat dipakai.')
}

async function requestImage(config,model,prompt,fetchImpl) {
  const base = config.baseUrl.replace(/\/chat\/completions\/?$/,'').replace(/\/+$/,'')
  const isGeminiImage = /^ag\/gemini-[\w.-]*image/i.test(model)
  const endpoint = isGeminiImage ? `${base}/chat/completions` : `${base}/images/generations`
  const body = isGeminiImage
    ? {model,messages:[{role:'user',content:`Buat satu gambar untuk posting Instagram. Hasilkan gambar saja. ${prompt}`}],stream:false}
    : {model,prompt,response_format:'b64_json',output_format:'jpeg',n:1}
  const response = await fetchImpl(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)})
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`Respons model gambar bukan JSON (${response.status}).`) }
  if (!response.ok) throw new Error(`9router gambar (${response.status}): ${String(data?.error?.message||data?.message||'Gagal membuat gambar.').slice(0,300)}`)
  return parseImageResponse(data)
}

export async function runImageNode({node,input},user,{fetchImpl=fetch,storeImage=storeWorkflowImage}={}) {
  const config=getNineRouterConfig()
  if (!config.apiKey) throw new Error('Hubungkan API Key 9router sebelum membuat gambar.')
  const model=String(node.data.model||getSetting('ninerouter_image_model','')).trim()
  if (!model) throw new Error('Pilih model gambar 9router pada node Generate Gambar.')
  if (input.length > 10) throw new Error('Generate Gambar menerima maksimal 10 item per pengujian.')
  const tier=user.tier||(user.role==='admin'?'pro':'free')
  const limit=user.ai_daily_limit??(tier==='pro'?config.proDailyLimit:config.freeDailyLimit)
  const output=[]
  for (const item of input) {
    const count=db.prepare("select count(*) as count from ai_usage_logs where user_id=? and date(created_at,'localtime')=date('now','localtime')").get(user.id).count
    if (user.role!=='admin'&&count>=limit) throw new Error('Kuota AI harian habis. Periksa pengaturan akun Anda.')
    const prompt=String(resolveValue(node.data.prompt||'{{ $json.prompt }}',item.json)).trim()
    if (!prompt||prompt.length>MAX_PROMPT) throw new Error('Prompt gambar wajib diisi, maksimal 4.000 karakter.')
    const image=await requestImage(config,model,prompt,fetchImpl)
    let stored
    if (image.encoded) stored=await storeImage(user.id,image.encoded)
    else {
      let url
      try { url=new URL(image.url) } catch { throw new Error('Model mengembalikan URL gambar tidak valid.') }
      if (url.protocol!=='https:') throw new Error('Model harus mengembalikan URL gambar HTTPS.')
      stored={imageUrl:image.url,previewUrl:image.url,mimeType:/\.png(?:$|\?)/i.test(url.pathname)?'image/png':'image/jpeg'}
    }
    db.prepare('insert into ai_usage_logs (id,user_id,prompt_tokens,completion_tokens,model,type) values (?,?,?,?,?,?)').run(randomUUID(),user.id,0,0,model,'workflow_image')
    output.push({json:{...item.json,imageUrl:stored.imageUrl,imagePreviewUrl:stored.previewUrl,imageMime:stored.mimeType,imageModel:model,imagePrompt:prompt}})
  }
  return output
}
