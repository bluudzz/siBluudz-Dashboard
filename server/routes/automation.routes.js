import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'
import { executeGraphAsync, validateGraph, WORKFLOW_NODE_TYPES } from '../../shared/workflow-engine.js'
import { decodeWorkflowRun } from '../workflow-history.js'
import { createWorkflowRuntime } from '../workflow-runtime.js'
import { isAiConnection } from '../../shared/workflow-connections.js'
import { inspectWorkflow } from '../../shared/workflow-readiness.js'

const router = Router()
const findWorkflow = (id, userId) => db.prepare('select * from workflows where id = ? and user_id = ?').get(id, userId)
const parse = value => JSON.parse(value || '[]')
const activeRuns = new Map()
function sanitizeGraph(nodes,edges) {
  const cleanNodes=(Array.isArray(nodes)?nodes:[]).filter(node=>node&&WORKFLOW_NODE_TYPES.has(node.type))
  const ids=new Set(cleanNodes.map(node=>node.id))
  const cleanEdges=(Array.isArray(edges)?edges:[]).filter(edge=>edge&&ids.has(edge.source)&&ids.has(edge.target))
  return {nodes:cleanNodes,edges:cleanEdges}
}
function normalizedWorkflow(row) {
  // Reading or testing must not overwrite stored legacy nodes. Only an explicit save writes a draft.
  return sanitizeGraph(parse(row.nodes),parse(row.edges))
}

function templateGraph(template) {
  const trigger = { id:'trigger-1', type:'trigger', position:{x:80,y:180}, data:{label:'Manual Trigger', triggerMode:'manual', sampleData:'{"topic":"Ide konten", "approved":true}'} }
  if(template === 'blank') return {nodes:[],edges:[]}
  if(template === 'chat-agent')return {
    nodes:[
      {id:'chat-1',type:'chatTrigger',position:{x:80,y:120},data:{label:'When chat message received',chatInput:'Bantu saya merencanakan carousel Instagram',sessionId:'test-session'}},
      {id:'agent-1',type:'aiAgent',position:{x:430,y:120},data:{label:'AI Agent',executionMode:'live',aiPrompt:'{{ $json.chatInput }}',systemMessage:'Anda membantu menyusun rencana konten Instagram. Gunakan brief brand jika relevan. Tanyakan informasi yang belum tersedia. Jangan mengarang fakta atau mengaku membuat gambar dan memposting.',maxIterations:'3'}},
      {id:'model-1',type:'chatModel',position:{x:230,y:380},data:{label:'9router Chat Model',model:'',temperature:'0.7'}},
      {id:'memory-1',type:'memory',position:{x:460,y:380},data:{label:'Memory',sessionKey:'{{ $json.sessionId }}',windowSize:'5'}},
      {id:'tool-1',type:'tool',position:{x:690,y:380},data:{label:'Tools',toolType:'knowledge',description:'Baca brief brand yang disediakan pengguna sebelum merencanakan konten.',content:'Brief brand belum diisi. Tanyakan produk, audiens, tujuan, dan CTA kepada pengguna.'}},
    ],
    edges:[{id:'chat-agent',source:'chat-1',target:'agent-1',sourceHandle:'out',targetHandle:'prompt'},...['model','memory','tool'].map((type,index)=>({id:type+'-agent',source:type+'-1',target:'agent-1',sourceHandle:['ai_languageModel','ai_memory','ai_tool'][index],targetHandle:['ai_languageModel','ai_memory','ai_tool'][index]}))],
  }
  if(template === 'ig-research')return {
    nodes:[
      {id:'topic-1',type:'promptTrigger',position:{x:80,y:140},data:{label:'Topik riset',prompt:'Cari fakta terbaru tentang Fisch Roblox untuk konten Instagram @bluudzstore',promptMode:'normal'}},
      {id:'research-1',type:'aiAgent',position:{x:450,y:140},data:{label:'Riset konten AI',executionMode:'live',aiPrompt:'Teliti topik ini: {{ $json.prompt }}. Cari sumber web, baca halaman yang tersedia, tulis fakta dengan URL dan tanggal sumber, lalu pisahkan hal yang belum terverifikasi. Pertahankan nama game, gear, lokasi, dan slang gamer dalam bahasa aslinya.',systemMessage:'Anda peneliti konten Roblox untuk @bluudzstore. Gunakan alat pencarian. Jangan mengarang angka, patch, stat, atau mekanik. Jika halaman sumber gagal dibaca, tandai belum terverifikasi.',maxIterations:'3'}},
      {id:'model-1',type:'chatModel',position:{x:350,y:390},data:{label:'Model AI · 9router',model:'',temperature:'0.2'}},
      {id:'web-tool-1',type:'tool',position:{x:690,y:390},data:{label:'Cari web · 5 halaman',toolType:'webResearch'}},
    ],
    edges:[
      {id:'topic-research',source:'topic-1',target:'research-1',sourceHandle:'out',targetHandle:'prompt'},
      {id:'model-research',source:'model-1',target:'research-1',sourceHandle:'ai_languageModel',targetHandle:'ai_languageModel'},
      {id:'web-research',source:'web-tool-1',target:'research-1',sourceHandle:'ai_tool',targetHandle:'ai_tool'},
    ],
  }
  let steps
  if(template === 'ig-autopost') {
    trigger.data.sampleData = JSON.stringify({topic:'Ide carousel produk',product:'Nama produk',audience:'Calon pelanggan',objective:'Edukasi lalu mendorong percakapan',cta:'Kirim DM untuk informasi lebih lanjut',slideCount:3,factStatus:'needs_review'})
    steps = [
      {type:'searchContent',data:{label:'Cari Referensi Konten',query:'',limit:'5'}},
      {type:'set',data:{label:'Penentuan Topik',fields:'{"topic":"{{ $json.topic }}","product":"{{ $json.product }}","audience":"{{ $json.audience }}","objective":"{{ $json.objective }}","cta":"{{ $json.cta }}","slideCount":3,"contentStatus":"draft","factStatus":"{{ $json.factStatus }}"}',keepInput:true}},
      {type:'aiAgent',data:{label:'Validasi Fakta',role:'Fact Checker',aiModel:'',aiPrompt:'Validasi fakta untuk konten Instagram tentang {{ $json.topic }} dan {{ $json.product }}. Target audiens: {{ $json.audience }}. Referensi awal: {{ $json.sources }}. Periksa isi sumber sebelum menganggap klaim terverifikasi; daftar judul berita saja bukan bukti. Identifikasi setiap klaim, kebutuhan sumber, tanggal sumber, tingkat keyakinan, dan risiko klaim berlebihan. Jika sumber kurang, tandai needs_review. Keluarkan status factStatus: verified, needs_review, atau rejected.'}},
      {type:'aiAgent',data:{label:'Strategi Marketing 3 Slide',role:'Content Strategist',aiModel:'',aiPrompt:'Rancang strategi marketing carousel Instagram 3 slide untuk {{ $json.topic }} tentang {{ $json.product }}. Target audiens: {{ $json.audience }}. Tujuan: {{ $json.objective }}. CTA: {{ $json.cta }}. Tetapkan Slide 1 sebagai hook, Slide 2 sebagai value atau proof, dan Slide 3 sebagai CTA. Jelaskan pesan utama, urutan narasi, angle, dan alasan strategi. Jangan membuat klaim yang belum tervalidasi.'}},
      {type:'aiAgent',data:{label:'Copywriting',role:'Instagram Copywriter',aiModel:'',aiPrompt:'Tulis copy carousel Instagram 3 slide untuk {{ $json.topic }} tentang {{ $json.product }}. Target audiens: {{ $json.audience }}. CTA: {{ $json.cta }}. Hasilkan judul dan body singkat untuk setiap slide, caption Instagram, CTA, hashtag yang relevan, alt text, dan disclaimer bila diperlukan. Gunakan bahasa yang jelas, ringkas, dan sesuai konteks fakta yang sudah divalidasi.'}},
      {type:'aiAgent',data:{label:'Quality Check',role:'Content QA',aiModel:'',aiPrompt:'Periksa draft carousel Instagram 3 slide tentang {{ $json.topic }}. Validasi konsistensi fakta, kesesuaian strategi dengan tujuan {{ $json.objective }}, keterbacaan copy, kelengkapan CTA {{ $json.cta }}, kesinambungan antar-slide, rasio 4:5, keamanan area teks, dan potensi klaim berisiko. Keluarkan checklist lulus/gagal, daftar perbaikan, dan status qualityStatus: passed atau needs_revision.'}},
      {type:'approval',data:{label:'Persetujuan Manual',approvedItems:null}},
    ]
  }
  else if(template === 'ai-researcher') steps = [
    {type:'aiAgent',data:{label:'Research Agent',role:'Analyst',aiModel:'',aiPrompt:'Analisis {{ $json.topic }}'}},
    {type:'aiAgent',data:{label:'Copywriter',role:'Writer',aiModel:'',aiPrompt:'Susun naskah untuk {{ $json.topic }}'}},
  ]
  else steps = [
    {type:'set',data:{label:'Edit Fields',fields:'{"headline":"Konten: {{ $json.topic }}"}',keepInput:true}},
    {type:'if',data:{label:'Perlu persetujuan?',field:'approved',operator:'equals',value:'true'}},
    {type:'set',data:{label:'Siap ditinjau',fields:'{"reviewStatus":"ready"}',keepInput:true}},
  ]
  const nodes = [trigger,...steps.map((step,i)=>({id:step.type+'-'+(i+1),position:{x:380+i*300,y:180},...step}))]
  const edges = nodes.slice(1).map((node,i)=>({id:'edge-'+i,source:nodes[i].id,target:node.id,...(nodes[i].type==='if'?{sourceHandle:'true'}:{})}))
  return {nodes,edges}
}

router.get('/', requireUser, (req,res)=>{
  const workflows=db.prepare('select id,name,description,is_active,created_at,updated_at from workflows where user_id = ? order by updated_at desc').all(req.user.id)
   res.json({workflows,capabilities:{simulation:true,scheduler:false,externalIntegrations:true}})
})
router.get('/:id',requireUser,(req,res)=>{
  const row=findWorkflow(req.params.id,req.user.id)
  if(!row)return res.status(404).json({error:'Workflow tidak ditemukan.'})
  const graph=normalizedWorkflow(row)
  res.json({workflow:{id:row.id,name:row.name,description:row.description,nodes:graph.nodes,edges:graph.edges,isActive:Boolean(row.is_active),createdAt:row.created_at,updatedAt:row.updated_at}})
})
router.post('/',requireSameOrigin,requireUser,(req,res)=>{
  const name=typeof req.body?.name==='string'?req.body.name.trim():''
  if(!name || name.length>160)return res.status(400).json({error:'Nama workflow wajib diisi, maksimal 160 karakter.'})
  if(!['blank','starter','ig-autopost','ai-researcher','chat-agent','ig-research'].includes(req.body?.template))return res.status(400).json({error:'Template tidak dikenal.'})
  const description=typeof req.body?.description==='string'?req.body.description.slice(0,2000):''
  const id=randomUUID(),{nodes,edges}=templateGraph(req.body.template)
  db.prepare('insert into workflows (id,user_id,name,description,nodes,edges,is_active) values (?,?,?,?,?,?,0)').run(id,req.user.id,name,description,JSON.stringify(nodes),JSON.stringify(edges))
  res.status(201).json({id,name,description,isActive:false})
})
router.put('/:id',requireSameOrigin,requireUser,(req,res)=>{
  const row=findWorkflow(req.params.id,req.user.id)
  if(!row)return res.status(404).json({error:'Workflow tidak ditemukan.'})
  if(req.body?.isActive)return res.status(400).json({error:'Jadwal otomatis belum tersedia. Workflow hanya dapat diuji secara manual.'})
  const name=req.body?.name===undefined?row.name:String(req.body.name).trim()
  if(!name || name.length>160)return res.status(400).json({error:'Nama workflow wajib diisi, maksimal 160 karakter.'})
  const submitted= sanitizeGraph(req.body?.nodes??parse(row.nodes),req.body?.edges??parse(row.edges))
  const nodes=submitted.nodes,edges=submitted.edges
  const errors=validateGraph(nodes,edges)
  if(errors.length)return res.status(400).json({error:errors.join(' ')})
  const savedNodes=nodes.map(node=>{
    const {status:_status,lastOutput:_lastOutput,onTestNode:_onTestNode,result:_result,running:_running,...data}=node.data
    return {id:node.id,type:node.type,position:node.position,data}
  })
  const description=req.body?.description===undefined?row.description:String(req.body.description).slice(0,2000)
  db.prepare("update workflows set name=?,description=?,nodes=?,edges=?,is_active=0,updated_at=datetime('now') where id=? and user_id=?").run(name,description,JSON.stringify(savedNodes),JSON.stringify(edges),row.id,req.user.id)
  res.json({success:true,message:'Workflow tersimpan sebagai draft.'})
})
router.delete('/:id',requireSameOrigin,requireUser,(req,res)=>{
  if(!findWorkflow(req.params.id,req.user.id))return res.status(404).json({error:'Workflow tidak ditemukan.'})
  db.prepare('delete from workflows where id=? and user_id=?').run(req.params.id,req.user.id)
  res.status(204).end()
})
async function run(req,res,partial=false,chat=false){
  const workflow=findWorkflow(req.params.id,req.user.id)
  if(!workflow)return res.status(404).json({error:'Workflow tidak ditemukan.'})
  if(partial && typeof req.body?.nodeId!=='string')return res.status(400).json({error:'Pilih node untuk Execute step.'})
  const activeKey=req.user.id+':'+workflow.id
  if(activeRuns.get(activeKey)?.running)return res.status(409).json({error:'Workflow ini sedang berjalan. Tunggu hasilnya sebelum menjalankan lagi.'})
  const controller=new AbortController()
  const active={userId:req.user.id,workflowId:workflow.id,currentNodeId:'',currentNodeLabel:'',phase:'starting',completed:[],running:true,controller}
  activeRuns.set(activeKey,active)
  try{
     const normalized=normalizedWorkflow(workflow)
     let nodes=normalized.nodes
     let edges=normalized.edges
    if(chat){
      if(typeof req.body?.message!=='string'||!req.body.message.trim()||req.body.message.length>16000)return res.status(400).json({error:'Pesan chat wajib diisi, maksimal 16.000 karakter.'})
      if(typeof req.body?.sessionId!=='string'||!req.body.sessionId||req.body.sessionId.length>200)return res.status(400).json({error:'Session ID chat tidak valid.'})
      if(nodes.filter(node=>node.type==='chatTrigger'&&!node.data.disabled).length!==1)return res.status(400).json({error:'Uji chat membutuhkan tepat satu Chat Trigger aktif.'})
      nodes=nodes.map(node=>node.type==='chatTrigger'?{...node,data:{...node.data,chatInput:req.body.message,sessionId:req.body.sessionId}}:node)
      const scope=new Set()
      const visit=id=>{if(scope.has(id))return;scope.add(id);edges.filter(edge=>edge.source===id&&!isAiConnection(edge)).forEach(edge=>visit(edge.target))}
      visit(nodes.find(node=>node.type==='chatTrigger'&&!node.data.disabled).id)
      edges.filter(edge=>scope.has(edge.target)&&isAiConnection(edge)).forEach(edge=>scope.add(edge.source))
      nodes=nodes.filter(node=>scope.has(node.id));edges=edges.filter(edge=>scope.has(edge.source)&&scope.has(edge.target))
    }
     const readiness=inspectWorkflow(nodes,edges,partial?req.body.nodeId:undefined).filter(issue=>issue.severity==='error')
     if(readiness.length)return res.status(422).json({error:readiness.map(issue=>issue.message).join(' '),issues:readiness})
     const result=await executeGraphAsync(nodes,edges,partial?req.body.nodeId:undefined,createWorkflowRuntime(req.user,workflow.id,controller.signal),progress=>{
       active.phase=progress.phase
       active.currentNodeId=progress.phase==='start'?progress.nodeId:''
       active.currentNodeLabel=progress.label||''
       if(progress.phase==='complete')active.completed.push({nodeId:progress.nodeId,status:progress.status})
     },controller.signal)
     active.phase=result.status==='cancelled'?'stopped':'complete';active.currentNodeId='';active.currentNodeLabel='';active.status=result.status
    const runId=randomUUID()
    db.prepare("insert into workflow_runs (id,workflow_id,user_id,status,trigger_type,logs,result,completed_at) values (?,?,?,?,?,?,?,datetime('now'))").run(runId,workflow.id,req.user.id,result.status,chat?'chat':partial?'partial':'manual',JSON.stringify(result.logs),JSON.stringify(result))
    res.json({runId,...result,...(partial?{nodeId:req.body.nodeId,output:result.nodeResults[req.body.nodeId]?.output}:{})})
   }catch(error){
     const stopped=error?.code==='WORKFLOW_STOPPED'||controller.signal.aborted
     active.phase=stopped?'stopped':'error';active.currentNodeId='';active.currentNodeLabel='';active.status=stopped?'cancelled':'error'
     res.status(stopped?409:400).json({error:stopped?'Pengujian dihentikan.':error.message,...(stopped?{code:'WORKFLOW_STOPPED'}:{})})
   }
   finally{active.running=false;setTimeout(()=>{if(activeRuns.get(activeKey)===active)activeRuns.delete(activeKey)},2500)}
}
router.post('/:id/execute',requireSameOrigin,requireUser,(req,res)=>run(req,res))
router.post('/:id/test-node',requireSameOrigin,requireUser,(req,res)=>run(req,res,true))
router.post('/:id/chat',requireSameOrigin,requireUser,(req,res)=>run(req,res,false,true))
router.post('/:id/stop',requireSameOrigin,requireUser,(req,res)=>{
  const workflow=findWorkflow(req.params.id,req.user.id)
  if(!workflow)return res.status(404).json({error:'Workflow tidak ditemukan.'})
  const active=activeRuns.get(req.user.id+':'+workflow.id)
  if(!active?.running)return res.status(409).json({error:'Tidak ada pengujian yang sedang berjalan.',code:'WORKFLOW_NOT_RUNNING'})
  active.phase='stopping'
  const reason=Object.assign(new Error('Pengujian dihentikan pengguna.'),{code:'WORKFLOW_STOPPED'})
  active.controller.abort(reason)
  res.json({stopping:true,message:'Pengujian sedang dihentikan.'})
})
router.get('/:id/active',requireUser,(req,res)=>{
  const workflow=findWorkflow(req.params.id,req.user.id)
  if(!workflow)return res.status(404).json({error:'Workflow tidak ditemukan.'})
  const active=activeRuns.get(req.user.id+':'+workflow.id)
  res.json({active:active?{nodeId:active.currentNodeId,label:active.currentNodeLabel,phase:active.phase,completed:active.completed}:null})
})
router.get('/:id/runs',requireUser,(req,res)=>{
  try {
    if(!findWorkflow(req.params.id,req.user.id))return res.status(404).json({error:'Workflow tidak ditemukan.'})
    const rows=db.prepare('select id,status,trigger_type,logs,result,started_at,completed_at from workflow_runs where workflow_id=? and user_id=? order by started_at desc,rowid desc limit 20').all(req.params.id,req.user.id)
    res.json({runs:rows.map(decodeWorkflowRun)})
  } catch(error) {
    console.error('Workflow runs error:',error)
    res.status(500).json({error:'Riwayat pengujian gagal dimuat. Periksa log backend workflow.'})
  }
})
export default router
