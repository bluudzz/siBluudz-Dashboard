import type { Node, Edge } from '@xyflow/react'
import type { NodeResult, ExecutionResult } from '../../../shared/workflow-engine'

export type WorkflowData = { label: string; result?: NodeResult; running?: boolean; [key:string]: unknown }
export type StudioNode = Node<WorkflowData>
export type { NodeResult, ExecutionResult }
export interface WorkflowItem { id:string; name:string; description?:string; is_active?:number }
export interface RunItem { id:string; status:string; trigger_type:string; started_at:string; completed_at?:string; result: Partial<ExecutionResult> }

export const catalog = [
  {type:'chatTrigger',title:'Mulai dari Chat (Chat Trigger)',group:'Pemicu',description:'Memulai workflow ketika Anda mengirim pesan melalui panel Uji chat.',data:{label:'Mulai dari Chat',chatInput:'Bantu saya merencanakan konten',sessionId:'test-session'}},
  {type:'trigger',title:'Jalankan Manual (Manual Trigger)',group:'Pemicu',description:'Memulai workflow saat Anda menekan tombol Jalankan secara manual.',data:{label:'Jalankan Manual',triggerMode:'manual',sampleData:'{"topic":"Ide konten", "approved":true}',cron:'0 10 * * *',interval:'Setiap hari 10:00 WIB'}},
  {type:'set',title:'Atur Data (Edit Fields)',group:'Data',description:'Menambahkan atau mengubah data sebelum diteruskan ke langkah berikutnya.',data:{label:'Atur Data',fields:'{"headline":"Konten: {{ $json.topic }}"}',keepInput:true}},
  {type:'if',title:'Periksa Kondisi (If)',group:'Logika',description:'Memeriksa data lalu memilih jalur berikutnya berdasarkan kondisi yang Anda buat.',data:{label:'Periksa Kondisi',field:'approved',operator:'equals',value:'true'}},
  {type:'aiAgent',title:'AI Agent',group:'AI',description:'Meminta AI mengolah data dan menyelesaikan tugas sesuai instruksi Anda.',data:{label:'AI Agent',executionMode:'live',aiPrompt:'{{ $json.chatInput }}',systemMessage:'Bantu pengguna dalam Bahasa Indonesia. Gunakan tool bila perlu.',maxIterations:'3'}},
  {type:'chatModel',title:'Model AI · 9router',group:'Gunakan AI',description:'Pilih model AI yang akan digunakan oleh Asisten AI.',data:{label:'Model AI · 9router',model:'',temperature:'0.7'}},
  {type:'memory',title:'Memory',group:'Gunakan AI',description:'Menyimpan pesan sebelumnya agar AI Agent dapat memahami konteks percakapan.',data:{label:'Memory',sessionKey:'{{ $json.sessionId }}',windowSize:'5'}},
  {type:'tool',title:'Tools',group:'Gunakan AI',description:'Memberi kemampuan tambahan kepada AI Agent, seperti membaca brief atau menghitung teks.',data:{label:'Tools',toolType:'knowledge',description:'Baca brief brand yang disediakan pengguna.',content:''}},
  {type:'aiGenerator',title:'Siapkan visual dan caption',group:'Integrasi · pratinjau',description:'Siapkan rancangan visual dan caption. Pembuatan media otomatis belum tersedia.',data:{label:'Siapkan visual dan caption',aiModel:'',aiPrompt:'Buat konten tentang {{ $json.topic }}',aspectRatio:'4:5 (1080x1350)'}},
  {type:'publisher',title:'Siapkan posting Instagram',group:'Integrasi · pratinjau',description:'Siapkan akun dan format posting. Pengujian belum mengirim posting ke Instagram.',data:{label:'Siapkan posting Instagram',targetAccount:'',format:'carousel',requireApproval:true}},
  {type:'code',title:'Jalankan script',group:'Integrasi · pratinjau',description:'Siapkan nama script. Pengujian belum menjalankan Python atau shell.',data:{label:'Jalankan script',scriptName:''}},
] as const
// Keep legacy and technical node definitions readable by the editor, but show
// only the core workflow steps to users building a new workflow.
export const availableCatalog = catalog.filter(item => !['chatModel','memory','tool','aiGenerator','publisher','code'].includes(item.type))
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
  const inputs:Record<string,string> = {aiGenerator:'context',aiAgent:'prompt',publisher:'media',code:'params'}
  const outputs:Record<string,string> = {trigger:'time',aiGenerator:'content',aiAgent:'agentOutput',code:'stdout'}
  return {input:inputs[type||'']||'in',output:outputs[type||'']||'out'}
}
export function serializableGraph(nodes:StudioNode[],edges:Edge[]) {
  return {nodes:nodes.map(node=>{const {result:_result,running:_running,status:_status,lastOutput:_lastOutput,onTestNode:_onTestNode,...data}=node.data; return {id:node.id,type:node.type,position:node.position,data}}),edges:edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,sourceHandle:edge.sourceHandle,targetHandle:edge.targetHandle}))}
}
export function graphStamp(name:string,nodes:StudioNode[],edges:Edge[]) { return JSON.stringify({name,...serializableGraph(nodes,edges)}) }
export async function workflowRequest<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch('/api/workflows'+path,{...init,credentials:'same-origin',headers:{...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}})
  if(response.status===204)return undefined as T
  const data=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(data.error||`Permintaan workflow gagal (${response.status}).`)
  return data as T
}
