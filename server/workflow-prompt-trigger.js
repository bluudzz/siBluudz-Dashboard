import { randomUUID } from 'node:crypto'
import { db, getNineRouterConfig } from './db.js'

export async function runPromptTrigger({node},user,{fetchImpl=fetch}={}) {
  const originalPrompt=String(node.data.prompt||'').trim()
  if(!originalPrompt||originalPrompt.length>16000)throw new Error('Tulis prompt pemicu, maksimal 16.000 karakter.')
  const config=getNineRouterConfig()
  const model=String(node.data.model||config.model||'').trim()
  if(!model)throw new Error('Pilih model AI 9router pada Prompt Trigger atau atur model utama di pengaturan AI.')
  if(!config.apiKey)throw new Error('Hubungkan API Key 9router sebelum memakai mode AI.')
  const tier=user.tier||(user.role==='admin'?'pro':'free')
  const limit=user.ai_daily_limit??(tier==='pro'?config.proDailyLimit:config.freeDailyLimit)
  const count=db.prepare("select count(*) as count from ai_usage_logs where user_id=? and date(created_at,'localtime')=date('now','localtime')").get(user.id).count
  if(user.role!=='admin'&&count>=limit)throw new Error('Kuota AI harian habis. Periksa pengaturan akun Anda.')
  const base=config.baseUrl.replace(/\/chat\/completions\/?$/,'').replace(/\/+$/,'')
  const response=await fetchImpl(`${base}/chat/completions`,{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.apiKey}`},
    body:JSON.stringify({model,messages:[{role:'user',content:originalPrompt}],stream:false}),
    signal:AbortSignal.timeout(90_000),
  })
  const raw=await response.text()
  let body
  try{body=JSON.parse(raw)}catch{throw new Error(`Respons AI tidak valid (${response.status}).`)}
  if(!response.ok)throw new Error(`9router (${response.status}): ${String(body?.error?.message||body?.message||'AI gagal memproses prompt.').slice(0,300)}`)
  const content=body?.choices?.[0]?.message?.content
  const output=typeof content==='string'?content.trim():Array.isArray(content)?content.filter(part=>part?.type==='text').map(part=>String(part.text||'')).join('\n').trim():''
  if(!output||output.length>32000)throw new Error('AI tidak memberikan hasil teks yang valid (maksimal 32.000 karakter).')
  db.prepare('insert into ai_usage_logs (id,user_id,prompt_tokens,completion_tokens,model,type) values (?,?,?,?,?,?)').run(randomUUID(),user.id,Number(body.usage?.prompt_tokens||0),Number(body.usage?.completion_tokens||0),model,'workflow_prompt_trigger')
  return [{json:{prompt:output,output,originalPrompt,model}}]
}
