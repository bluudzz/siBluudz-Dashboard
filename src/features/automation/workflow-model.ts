import type { Node, Edge } from '@xyflow/react'
import type { NodeResult, ExecutionResult } from '../../../shared/workflow-engine'
import { workflowInput, type DataItem } from '../../../shared/workflow-engine.js'

export function workflowInputFields(items:DataItem[]):string[] {
  const sample=items.slice(0,20)
  const hidden=new Set(['constructor','prototype','agentModel','agentRun','toolSteps','model','sessionId','imageModel','imageMime','videoModel','videoMime','videoJobId','splitIndex','statusCode','searchedAt','researchMode','researchPlan','searchProvider','driveSelection','driveHasMore','driveAccount'])
  const seen=new Set([JSON.stringify(sample.map(item=>workflowInput(item.json)))])
  return [...new Set(sample.flatMap(item=>Object.keys(item.json)))].filter(key=>{
    if(key.startsWith('_')||hidden.has(key))return false
    const signature=JSON.stringify(sample.map(item=>item.json[key]))
    if(seen.has(signature))return false
    seen.add(signature)
    return true
  }).slice(0,80)
}

export type WorkflowData = { label: string; result?: NodeResult; running?: boolean; [key:string]: unknown }
export type StudioNode = Node<WorkflowData>
export type { NodeResult, ExecutionResult }
export function workflowImagePreview(json:Record<string,unknown>):string {
  const candidate=json.imagePreviewUrl||json.imageUrl
  return typeof candidate==='string'&&(candidate.startsWith('/api/workflow-media/')||candidate.startsWith('https://'))?candidate:''
}
export function workflowVideoPreview(json:Record<string,unknown>):string {
  const candidate=json.videoPreviewUrl||json.videoUrl
  return typeof candidate==='string'&&(candidate.startsWith('/api/workflow-media/')||candidate.startsWith('https://'))?candidate:''
}
export function workflowNodeImages(node:Pick<StudioNode,'type'|'data'>):string[] {
  if((node.type!=='imageGenerate'&&node.type!=='imageEdit')||node.data.result?.status!=='success')return []
  // ponytail: cap canvas thumbnails at 3; use Output for the full gallery.
  return node.data.result.output.map(item=>workflowImagePreview(item.json)).filter(Boolean).slice(0,3)
}
export const PROMPT_TRIGGER_DEFAULT_MODEL='ag/gemini-3.8-flash'
export const RESEARCH_DEFAULT_MODEL='ag/gemini-3.8-flash'
export interface WorkflowItem { id:string; name:string; description?:string; is_active?:number; webhook_token?:string }
export interface RunItem { id:string; status:string; trigger_type:string; started_at:string; completed_at?:string; result: Partial<ExecutionResult> }

export const catalog = [
  {type:'promptTrigger',title:'Prompt Trigger',group:'Pemicu',description:'Tulis perintah; minta AI mengerjakannya atau teruskan langsung.',data:{label:'Prompt Trigger',prompt:'',promptMode:'ai',model:PROMPT_TRIGGER_DEFAULT_MODEL}},
  {type:'chatTrigger',title:'Chat Trigger',group:'Pemicu',description:'Starts the workflow when you send a message through the chat test panel.',data:{label:'Chat Trigger',chatInput:'Help me plan content',sessionId:'test-session'}},
  {type:'trigger',title:'Manual / Jadwal Trigger',group:'Pemicu',description:'Mulai alur manual atau berjalan otomatis sesuai jadwal cron (WIB).',data:{label:'Manual Trigger',triggerMode:'manual',sampleData:'{"topic":"Content idea", "approved":true}',cron:'0 10 * * *',interval:'Setiap hari 10:00 WIB'}},
  {type:'webhookTrigger',title:'Webhook Trigger',group:'Pemicu',description:'Mulai alur otomatis ketika ada data JSON dikirim ke URL webhook.',data:{label:'Webhook Trigger',sampleData:'{"topic":"Event baru","source":"external"}'}},
  {type:'set',title:'Atur Data (Edit Fields)',group:'Data',description:'Menambahkan atau mengubah data sebelum diteruskan ke langkah berikutnya.',data:{label:'Atur Data',fields:'{"headline":"Konten: {{ $json.topic }}"}',keepInput:true}},
  {type:'merge',title:'Gabungkan Data (Merge)',group:'Data',description:'Gabungkan hasil dari 2 cabang atau rangkum banyak item menjadi 1 objek.',data:{label:'Gabungkan Data',mode:'combineByPosition',aggregateField:'items'}},
  {type:'jsonParse',title:'Parse JSON / Pecah Array',group:'Data',description:'Urai teks JSON dari AI/API atau pecah daftar array apa saja menjadi item.',data:{label:'Parse JSON',parseMode:'parse',sourceField:'output',arrayPath:'',keepInput:true}},
  {type:'splitOut',title:'Split Out',group:'Data',description:'Membagi hasil AI Agent menjadi beberapa item sesuai jumlah yang Anda pilih.',data:{label:'Split Out',splitCount:'3',sourceField:'output',arrayField:'prompts'}},
  {type:'searchContent',title:'Riset Informasi',group:'Data',description:'Susun pencarian, baca banyak sumber internet dan komunitas, lalu kumpulkan fakta.',data:{label:'Riset Informasi',sourceMode:'search',query:'',url:'',model:RESEARCH_DEFAULT_MODEL,maxPages:'12'}},
  {type:'apiRequest',title:'HTTP / Webhook Request',group:'Data',description:'Kirim permintaan GET, POST, PUT, PATCH, atau DELETE ke API HTTPS eksternal.',data:{label:'HTTP Request',method:'GET',url:'',headers:'{}',body:''}},
  {type:'httpRequest',title:'Ambil Halaman/API',group:'Data',description:'Ambil data dari URL HTTPS publik dengan metode GET.',data:{label:'Ambil Halaman/API',url:''}},
  {type:'googleDrive',title:'Google Drive',group:'Data',description:'Pilih gambar atau video dari link berbagi Google Drive.',data:{label:'Google Drive',accountId:'',operation:'shared',mediaFilter:'images',sharedLink:'',selectionMode:'random',nameFilter:'',search:'',fileId:''}},
  {type:'if',title:'Periksa Kondisi (If)',group:'Logika',description:'Memeriksa data lalu memilih jalur berikutnya berdasarkan kondisi yang Anda buat.',data:{label:'Periksa Kondisi',field:'approved',operator:'equals',value:'true'}},
  {type:'switch',title:'Router / Switch',group:'Logika',description:'Arahkan data ke hingga 4 cabang berbeda (Case 1–3 dan Fallback).',data:{label:'Router / Switch',field:'type',rule1Operator:'equals',rule1Value:'carousel',rule2Operator:'equals',rule2Value:'reels',rule3Operator:'',rule3Value:''}},
  {type:'wait',title:'Tunda (Wait)',group:'Logika',description:'Beri jeda beberapa detik sebelum melanjutkan ke langkah berikutnya.',data:{label:'Tunda',durationSeconds:'5'}},
  {type:'approval',title:'Persetujuan Manual',group:'Logika',description:'Hentikan cabang alur sampai Anda meninjau dan menyetujui konten yang masuk.',data:{label:'Persetujuan Manual',approvedItems:null}},
  {type:'imageGenerate',title:'Generate Gambar',group:'AI',description:'Buat satu gambar per ide atau slide dengan model gambar 9router.',data:{label:'Generate Gambar',model:'',prompt:''}},
  {type:'imageEdit',title:'Edit & Olah Gambar',group:'AI',description:'Sesuaikan rasio IG 4:5 + teks overlay, atau edit gambar memakai AI.',data:{label:'Edit & Olah Gambar',editMode:'igFormat',aspectRatio:'4:5',overlayTitle:'',overlaySubtitle:'',watermark:'',textPosition:'bottom',model:'',prompt:'',resolution:'1K'}},
  {type:'videoGenerate',title:'Generate Video (Google Flow)',group:'AI',description:'Buat video Veo / Omni Flash memakai Google Flow lokal tanpa biaya API.',data:{label:'Generate Video · Google Flow',accountId:'',model:'ui-default',aspectRatio:'9:16',upscale:'none',prompt:'',useInputImage:true,flowProject:'',referenceImagePath:'',timeoutSeconds:'480'}},
  {type:'aiVision',title:'Analisis Gambar (Vision)',group:'AI',description:'Periksa kualitas atau baca isi gambar memakai model AI multimodal.',data:{label:'Analisis Gambar',model:PROMPT_TRIGGER_DEFAULT_MODEL,prompt:'Periksa kualitas visual, keterbacaan, dan kesesuaian gambar dengan brief.',qaMode:true}},
  {type:'aiAgent',title:'AI Agent',group:'AI',description:'Meminta AI mengolah data dan menyelesaikan tugas sesuai instruksi Anda.',data:{label:'AI Agent',executionMode:'live',aiPrompt:'',systemMessage:'',maxIterations:'3'}},
  {type:'instagram',title:'Post to Instagram',group:'Publikasi',description:'Terbitkan gambar/carousel/reel/story, baca komentar, atau lihat statistik akun profesional.',data:{label:'Post to Instagram',operation:'publish',accountId:'',caption:'',imageUrl:'',videoUrl:'',coverUrl:'',mediaId:''}},
  {type:'notify',title:'Kirim Notifikasi',group:'Publikasi',description:'Kirim pesan atau ringkasan hasil workflow ke Telegram, Discord, atau Webhook.',data:{label:'Kirim Notifikasi',channelId:'',message:'',includeImage:false}},
  {type:'chatModel',title:'Model AI · 9router',group:'Gunakan AI',description:'Pilih model AI yang akan digunakan oleh AI Agent.',data:{label:'Model AI · 9router',model:'',temperature:'0.7'}},
  {type:'memory',title:'Memory',group:'Gunakan AI',description:'Menyimpan pesan sebelumnya agar AI Agent dapat memahami konteks percakapan.',data:{label:'Memory',sessionKey:'{{ $json.sessionId }}',windowSize:'5'}},
  {type:'tool',title:'Tools',group:'Gunakan AI',description:'Memberi kemampuan tambahan kepada AI Agent, seperti membaca brief atau menghitung teks.',data:{label:'Tools',toolType:'knowledge',description:'Baca brief brand yang disediakan pengguna.',content:''}},
] as const
export const availableCatalog = catalog.filter(item => !['chatModel','memory','tool','httpRequest'].includes(item.type))
export function formatModelLabel(id?: string): string {
  if (!id) return ''
  const clean = id.replace(/^(customendpoint\/)?9Router[^/]*\//i, '')
  const imageQuality: Record<string, string> = {
    'sdwebui/flux-1-dev': 'Flux 1 Dev · terbaik',
    'sdwebui/flux-1-schnell': 'Flux 1 Schnell · cepat',
    'sdwebui/sd3.5-large': 'SD 3.5 Large',
    'sdwebui/sd3.5': 'SD 3.5',
    'sdwebui/sdxl-base-1.0': 'SDXL Base 1.0',
    'sdwebui/realistic-vision': 'Realistic Vision',
    'sdwebui/sd15': 'SD 1.5 · lama',
  }
  const known = imageQuality[clean]
  if (known) return `[MUSE] ${known}`
  const prefixes: [RegExp, string][] = [
    [/^ag\//i, '[AG] '],
    [/^cx\//i, '[CX] '],
    [/^gptweb\//i, '[GPTWEB] '],
    [/^omnirush\//i, '[OMNIRUSH] '],
    [/^ds\//i, '[DS] '],
    [/^(gold\/)?tig\//i, '[TIG] '],
    [/^river\//i, '[RIVER] '],
    [/^yeta\//i, '[YETA] '],
    [/^oc\//i, '[OC] '],
    [/^sdwebui\//i, '[MUSE] '],
    [/^muse-image\//i, '[MUSE] '],
    [/^muse\//i, '[MUSE] '],
    [/^groq\//i, '[GROQ] '],
    [/^cf\//i, '[CF] '],
    [/^(openrouter|or)\//i, '[OR] '],
    [/^ollama\//i, '[OLLAMA] '],
    [/^vllm\//i, '[VLLM] '],
  ]
  for (const [reg, tag] of prefixes) {
    if (reg.test(clean)) {
      const rest = clean.replace(reg, '')
      return `${tag}${rest.includes('/') ? rest.split('/').pop()! : rest}`
    }
  }
  return clean
}
export function ports(type?:string) {
  const inputs:Record<string,string> = {aiAgent:'prompt'}
  const outputs:Record<string,string> = {trigger:'time',aiAgent:'agentOutput'}
  return {input:inputs[type||'']||'in',output:outputs[type||'']||'out'}
}
export function serializableGraph(nodes:StudioNode[],edges:Edge[]) {
  return {nodes:nodes.map(node=>{const {result:_result,running:_running,status:_status,lastOutput:_lastOutput,onTestNode:_onTestNode,...data}=node.data; return {id:node.id,type:node.type,position:node.position,data}}),edges:edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,sourceHandle:edge.sourceHandle,targetHandle:edge.targetHandle}))}
}
export function graphStamp(name:string,nodes:StudioNode[],edges:Edge[]) { return JSON.stringify({name,...serializableGraph(nodes,edges)}) }
export async function workflowRequest<T>(path:string,init?:RequestInit):Promise<T> {
  let response:Response
  try{response=await fetch('/api/workflows'+path,{...init,credentials:'same-origin',headers:{...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}})}
  catch{throw new Error('Tidak dapat terhubung ke server workflow. Periksa koneksi dan layanan backend.')}
  if(response.status===204)return undefined as T
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    const gatewayMessage=response.status===502?'Proxy tidak mendapat jawaban dari backend workflow (502). Coba lagi; jika berulang, periksa status proses backend dan log proxy di VPS.':response.status===503?'Backend workflow sedang tidak tersedia (503). Coba lagi setelah layanan aktif.':response.status===504?'Backend workflow terlalu lama merespons (504). Periksa batas waktu proxy dan log backend di VPS.':`Permintaan workflow gagal (${response.status}).`
    const error=Object.assign(new Error(data.error||gatewayMessage),{code:data.code||'',status:response.status})
    throw error
  }
  return data as T
}
