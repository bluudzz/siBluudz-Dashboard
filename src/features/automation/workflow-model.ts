import type { Node, Edge } from '@xyflow/react'
import type { NodeResult, ExecutionResult } from '../../../shared/workflow-engine'

export type WorkflowData = { label: string; result?: NodeResult; running?: boolean; [key:string]: unknown }
export type StudioNode = Node<WorkflowData>
export type { NodeResult, ExecutionResult }
export const PROMPT_TRIGGER_DEFAULT_MODEL='ag/gemini-3.8-flash'
export const RESEARCH_DEFAULT_MODEL='ag/gemini-3.8-flash'
export interface WorkflowItem { id:string; name:string; description?:string; is_active?:number }
export interface RunItem { id:string; status:string; trigger_type:string; started_at:string; completed_at?:string; result: Partial<ExecutionResult> }

export const catalog = [
  {type:'promptTrigger',title:'Prompt Trigger',group:'Pemicu',description:'Tulis perintah; minta AI mengerjakannya atau teruskan langsung.',data:{label:'Prompt Trigger',prompt:'',promptMode:'ai',model:PROMPT_TRIGGER_DEFAULT_MODEL}},
  {type:'chatTrigger',title:'Chat Trigger',group:'Pemicu',description:'Starts the workflow when you send a message through the chat test panel.',data:{label:'Chat Trigger',chatInput:'Help me plan content',sessionId:'test-session'}},
  {type:'trigger',title:'Manual Trigger',group:'Pemicu',description:'Starts the workflow when you click the Run button manually.',data:{label:'Manual Trigger',triggerMode:'manual',sampleData:'{"topic":"Content idea", "approved":true}',cron:'0 10 * * *',interval:'Every day at 10:00 AM'}},
  {type:'set',title:'Atur Data (Edit Fields)',group:'Data',description:'Menambahkan atau mengubah data sebelum diteruskan ke langkah berikutnya.',data:{label:'Atur Data',fields:'{"headline":"Konten: {{ $json.topic }}"}',keepInput:true}},
  {type:'splitOut',title:'Split Out',group:'Data',description:'Membagi hasil AI Agent menjadi beberapa item sesuai jumlah yang Anda pilih.',data:{label:'Split Out',splitCount:'3',sourceField:'output',arrayField:'prompts'}},
  {type:'if',title:'Periksa Kondisi (If)',group:'Logika',description:'Memeriksa data lalu memilih jalur berikutnya berdasarkan kondisi yang Anda buat.',data:{label:'Periksa Kondisi',field:'approved',operator:'equals',value:'true'}},
  {type:'approval',title:'Persetujuan Manual',group:'Logika',description:'Hentikan cabang alur sampai Anda meninjau dan menyetujui konten yang masuk.',data:{label:'Persetujuan Manual',approvedItems:null}},
  {type:'searchContent',title:'Riset Informasi',group:'Data',description:'Susun pencarian, baca banyak sumber internet dan komunitas, lalu kumpulkan fakta.',data:{label:'Riset Informasi',sourceMode:'search',query:'',url:'',model:RESEARCH_DEFAULT_MODEL,maxPages:'12'}},
  {type:'httpRequest',title:'Ambil Halaman/API',group:'Data',description:'Ambil data dari URL HTTPS publik dengan metode GET.',data:{label:'Ambil Halaman/API',url:''}},
  {type:'googleDrive',title:'Google Drive',group:'Data',description:'Pilih gambar dari link berbagi, secara acak atau berdasarkan nama.',data:{label:'Google Drive',accountId:'',operation:'shared',sharedLink:'',selectionMode:'random',nameFilter:'',search:'',fileId:''}},
  {type:'imageGenerate',title:'Generate Gambar',group:'AI',description:'Buat satu gambar per ide atau slide dengan model gambar 9router.',data:{label:'Generate Gambar',model:'',prompt:''}},
  {type:'instagram',title:'Post to Instagram',group:'Publikasi',description:'Terbitkan gambar/carousel/reel/story, baca komentar, atau lihat statistik akun profesional.',data:{label:'Post to Instagram',operation:'publish',accountId:'',caption:'',imageUrl:'',videoUrl:'',coverUrl:'',mediaId:''}},
  {type:'aiAgent',title:'AI Agent',group:'AI',description:'Meminta AI mengolah data dan menyelesaikan tugas sesuai instruksi Anda.',data:{label:'AI Agent',executionMode:'live',aiPrompt:'',systemMessage:'',maxIterations:'3'}},
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
