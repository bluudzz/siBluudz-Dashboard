import type { Node, Edge } from '@xyflow/react'
import type { NodeResult, ExecutionResult } from '../../../shared/workflow-engine'

export type WorkflowData = { label: string; result?: NodeResult; running?: boolean; [key:string]: unknown }
export type StudioNode = Node<WorkflowData>
export type { NodeResult, ExecutionResult }
export interface WorkflowItem { id:string; name:string; description?:string; is_active?:number }
export interface RunItem { id:string; status:string; trigger_type:string; started_at:string; completed_at?:string; result: Partial<ExecutionResult> }

export const catalog = [
  {type:'promptTrigger',title:'Prompt Trigger',group:'Pemicu',description:'Tulis perintah; minta AI mengerjakannya atau teruskan langsung.',data:{label:'Prompt Trigger',prompt:'',promptMode:'ai',model:''}},
  {type:'chatTrigger',title:'Chat Trigger',group:'Pemicu',description:'Starts the workflow when you send a message through the chat test panel.',data:{label:'Chat Trigger',chatInput:'Help me plan content',sessionId:'test-session'}},
  {type:'trigger',title:'Manual Trigger',group:'Pemicu',description:'Starts the workflow when you click the Run button manually.',data:{label:'Manual Trigger',triggerMode:'manual',sampleData:'{"topic":"Content idea", "approved":true}',cron:'0 10 * * *',interval:'Every day at 10:00 AM'}},
  {type:'set',title:'Atur Data (Edit Fields)',group:'Data',description:'Menambahkan atau mengubah data sebelum diteruskan ke langkah berikutnya.',data:{label:'Atur Data',fields:'{"headline":"Konten: {{ $json.topic }}"}',keepInput:true}},
  {type:'splitOut',title:'Split Out',group:'Data',description:'Membagi hasil AI Agent menjadi beberapa item sesuai jumlah yang Anda pilih.',data:{label:'Split Out',splitCount:'3',sourceField:'output',arrayField:'prompts'}},
  {type:'if',title:'Periksa Kondisi (If)',group:'Logika',description:'Memeriksa data lalu memilih jalur berikutnya berdasarkan kondisi yang Anda buat.',data:{label:'Periksa Kondisi',field:'approved',operator:'equals',value:'true'}},
  {type:'approval',title:'Persetujuan Manual',group:'Logika',description:'Hentikan cabang alur sampai Anda meninjau dan menyetujui konten yang masuk.',data:{label:'Persetujuan Manual',approvedItems:null}},
  {type:'searchContent',title:'Cari Informasi',group:'Data',description:'Cari berita dan referensi topik dari Google News dengan tautan sumber.',data:{label:'Cari Informasi',query:'',limit:'5'}},
  {type:'httpRequest',title:'Ambil Halaman/API',group:'Data',description:'Ambil data dari URL HTTPS publik dengan metode GET.',data:{label:'Ambil Halaman/API',url:''}},
  {type:'imageGenerate',title:'Generate Gambar',group:'AI',description:'Buat satu gambar per ide atau slide dengan model gambar 9router.',data:{label:'Generate Gambar',model:'',prompt:''}},
  {type:'instagram',title:'Post to Instagram',group:'Publikasi',description:'Terbitkan gambar/carousel/reel/story, baca komentar, atau lihat statistik akun profesional.',data:{label:'Post to Instagram',operation:'publish',accountId:'',caption:'',imageUrl:'',videoUrl:'',coverUrl:'',mediaId:''}},
  {type:'aiAgent',title:'AI Agent',group:'AI',description:'Meminta AI mengolah data dan menyelesaikan tugas sesuai instruksi Anda.',data:{label:'AI Agent',executionMode:'live',aiPrompt:'',systemMessage:'',maxIterations:'3'}},
  {type:'chatModel',title:'Model AI · 9router',group:'Gunakan AI',description:'Pilih model AI yang akan digunakan oleh AI Agent.',data:{label:'Model AI · 9router',model:'',temperature:'0.7'}},
  {type:'memory',title:'Memory',group:'Gunakan AI',description:'Menyimpan pesan sebelumnya agar AI Agent dapat memahami konteks percakapan.',data:{label:'Memory',sessionKey:'{{ $json.sessionId }}',windowSize:'5'}},
  {type:'tool',title:'Tools',group:'Gunakan AI',description:'Memberi kemampuan tambahan kepada AI Agent, seperti membaca brief atau menghitung teks.',data:{label:'Tools',toolType:'knowledge',description:'Baca brief brand yang disediakan pengguna.',content:''}},
] as const
export const availableCatalog = catalog.filter(item => !['chatModel','memory','tool'].includes(item.type))
export function formatModelLabel(id?: string): string {
  if (!id) return ''
  const clean = id.replace(/^(customendpoint\/)?9Router[^/]*\//i, '')
  const prefixes: [RegExp, string][] = [
    [/^ag\//i, '[AG] '],
    [/^cx\//i, '[CX] '],
    [/^ds\//i, '[DS] '],
    [/^(gold\/)?tig\//i, '[TIG] '],
    [/^river\//i, '[RIVER] '],
    [/^yeta\//i, '[YETA] '],
    [/^oc\//i, '[OC] '],
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
  if(!response.ok)throw new Error(data.error||(response.status>=502&&response.status<=504?`Server workflow tidak merespons (${response.status}). Periksa layanan backend di VPS.`:`Permintaan workflow gagal (${response.status}).`))
  return data as T
}
