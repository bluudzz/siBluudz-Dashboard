import { useEffect, useState } from 'react'
import { X, Play, Trash2, Pin, Copy, Check, Pencil, RefreshCw } from 'lucide-react'
import type { Edge } from '@xyflow/react'
import { formatModelLabel, PROMPT_TRIGGER_DEFAULT_MODEL, RESEARCH_DEFAULT_MODEL, workflowRequest, type StudioNode, type RunItem } from './workflow-model'
import { agentResources, isSubNode } from '../../../shared/workflow-connections'
import type { DataItem } from '../../../shared/workflow-engine'
import { SimpleDataEditor, dataLabel, friendlyPrompt, technicalPrompt } from './SimpleDataEditor'
import { InstagramAccountSettings } from './InstagramAccountSettings'
import { GoogleDriveSettings } from './GoogleDriveSettings'
import { NotificationChannelSettings } from './NotificationChannelSettings'
import { WorkflowDataViewer } from './WorkflowDataViewer'
import { NodeInputPanel } from './NodeInputPanel'

const nodeHelp:Record<string,string>={
  trigger:'Tentukan bahan awal, atau jalankan alur secara otomatis sesuai jadwal cron (WIB).',
  webhookTrigger:'Terima data JSON dari sistem luar lewat URL webhook khusus saat workflow diaktifkan.',
  promptTrigger:'Mulai alur dari perintah teks. Mode Normal meneruskan teks; mode AI mengirim hasil model ke langkah berikutnya.',
  chatTrigger:'Mulai percakapan dengan AI. Pesan yang dikirim lewat Uji chat akan menjadi tugas untuk agent.',
  aiAgent:'Tulis tugas AI, lalu pilih Model AI dan Memory bila percakapan perlu diingat.',
  chatModel:'Pilih AI yang akan mengerjakan tugas. Model ini memakai koneksi 9router Anda.',
  memory:'Menyimpan percakapan sebelumnya dalam sesi yang sama. Aturan AI tetap diatur terpisah pada AI Agent.',
  tool:'Node lama untuk workflow terdahulu.',
  set:'Tambahkan atau ubah informasi sebelum diteruskan ke langkah berikutnya.',
  merge:'Gabungkan data dari dua cabang berbeda atau rangkum beberapa item menjadi satu objek.',
  jsonParse:'Urai teks JSON menjadi field terstruktur atau pecah daftar array JSON menjadi beberapa item.',
  splitOut:'Membagi hasil langsung dari AI Agent menjadi beberapa item sesuai jumlah yang dipilih.',
  if:'Tentukan kapan alur dilanjutkan ke cabang Ya atau Tidak.',
  switch:'Arahkan data hingga 4 jalur berbeda berdasarkan aturan kondisi yang berurutan.',
  wait:'Beri jeda waktu tertentu sebelum melanjutkan ke langkah berikutnya.',
  approval:'Tinjau hasil yang masuk sebelum langkah berikutnya dapat berjalan.',
  searchContent:'Susun pencarian lalu baca isi banyak sumber, atau baca satu URL HTTPS langsung.',
  httpRequest:'Node lama untuk membaca satu URL HTTPS.',
  apiRequest:'Panggil API atau webhook HTTPS eksternal dengan metode GET, POST, PUT, PATCH, atau DELETE.',
  googleDrive:'Lihat atau unduh gambar dan video dari Google Drive Anda.',
  imageGenerate:'Buat gambar dari prompt menggunakan model gambar 9router.',
  imageEdit:'Format gambar ke rasio Instagram (4:5/1:1/9:16) dengan teks overlay atau edit memakai AI.',
  aiVision:'Periksa kualitas visual atau analisis isi gambar memakai AI Vision.',
  instagram:'Terbitkan gambar, carousel, Reel, atau Story; baca komentar; atau lihat statistik akun Instagram profesional.',
  notify:'Kirim pesan atau ringkasan hasil workflow ke Telegram, Discord, atau Webhook.',
}

const optionNames:Record<string,string>={
  manual:'Jalankan manual',
  schedule:'Sesuai jadwal otomatis (WIB)',
  preview:'Coba rencana saja',
  live:'Gunakan AI terhubung',
  search:'Riset topik dan sumber',
  url:'Baca satu URL langsung',
  knowledge:'Baca brief atau pengetahuan',
  textLength:'Hitung karakter dan kata',
  webResearch:'Riset dan baca sampai 5 halaman web',
  random:'Pilih file acak',
  name:'Pilih berdasarkan nama',
  images:'Gambar saja (JPEG/PNG)',
  videos:'Video saja (MP4/MOV)',
  all:'Gambar & Video',
  equals:'Sama dengan',
  notEquals:'Tidak sama dengan',
  contains:'Mengandung kata',
  notContains:'Tidak mengandung kata',
  startsWith:'Diawali dengan',
  gt:'Lebih besar dari (>)',
  lt:'Lebih kecil dari (<)',
  exists:'Sudah terisi',
  isEmpty:'Kosong / belum diisi',
  combineByPosition:'Gabungkan per posisi (cocok untuk caption + slide)',
  append:'Susun berurutan (append)',
  aggregate:'Rangkum semua item menjadi 1 objek',
  parse:'Urai menjadi field terstruktur',
  splitArray:'Pecah daftar array menjadi banyak item',
  igFormat:'Format IG & teks overlay (cepat, tanpa kuota AI)',
  aiEdit:'Edit gambar dengan AI (9router)',
  '4:5':'4:5 Feed Portrait (1080×1350)',
  '1:1':'1:1 Feed Square (1080×1080)',
  '9:16':'9:16 Reels / Story (1080×1920)',
  original:'Pertahankan rasio asli',
  bottom:'Bawah gambar',
  top:'Atas gambar',
  center:'Tengah gambar',
  carousel:'Beberapa slide (carousel)',
  single:'Satu gambar',
  publish:'Terbitkan gambar / carousel',
  reels:'Terbitkan Reel',
  stories:'Terbitkan Story',
  comments:'Baca komentar',
  insights:'Lihat statistik',
  list:'Lihat post terbaru',
  inspect:'Periksa satu post',
  'Input dari node sebelumnya':'Bahan dari langkah sebelumnya',
}

const schedulePresets = [
  { cron: '0 * * * *', label: 'Setiap jam' },
  { cron: '0 10 * * *', label: 'Setiap hari 10:00 WIB' },
  { cron: '0 19 * * *', label: 'Setiap hari 19:00 WIB' },
  { cron: '0 9 * * 1-5', label: 'Senin–Jumat 09:00 WIB' },
]

const splitOutAgentRule=(count:number)=>`Buat tepat ${count} prompt gambar untuk carousel Instagram.\n\nBalas HANYA dengan JSON valid tanpa markdown, tanpa tanda \`\`\` dan tanpa penjelasan tambahan.\n\nGunakan format ini:\n{\n  "prompts": [\n${Array.from({length:count},(_,index)=>`    {"slide": ${index+1}, "role": "content", "prompt": "..."}`+(index===count-1?'':',')).join('\n')}\n  ]\n}\n\nPastikan jumlah prompt tepat ${count}. Setiap prompt harus berbeda, lengkap, dan siap digunakan untuk membuat gambar.`
export function DataViewer({items,nodeType}:{items:DataItem[];nodeType?:string}) {
  return <WorkflowDataViewer items={items} nodeType={nodeType}/>
}

interface NodePanelProps {
  workflowId:string
  webhookToken?:string
  onGenerateWebhookToken?:()=>Promise<void>
  node:StudioNode
  nodes:StudioNode[]
  edges:Edge[]
  busy:boolean
  onUpdate:(id:string,data:StudioNode['data'])=>void
  onDelete:(id:string)=>void
  onClose:()=>void
  onExecute:(id:string)=>void
  onSelect:(id:string)=>void
  onAddResource:(type:string,id:string)=>void
}
export function NodeSettingsPanel({workflowId,webhookToken,onGenerateWebhookToken,node,nodes,edges,busy,onUpdate,onDelete,onClose,onExecute,onSelect,onAddResource}:NodePanelProps) {
  const [tab,setTab]=useState('parameters')
  const [advanced,setAdvanced]=useState(false)
  const [modelIds,setModelIds]=useState<string[]>([])
  const [imageModelIds,setImageModelIds]=useState<string[]>([])
  const [editingLabel,setEditingLabel]=useState(false)
  const [labelDraft,setLabelDraft]=useState(String(node.data.label||''))
  const [ruleCopied,setRuleCopied]=useState(false)
  const [webhookCopied,setWebhookCopied]=useState(false)
  const [tokenBusy,setTokenBusy]=useState(false)
  const [reviewedInput,setReviewedInput]=useState<DataItem[]>([])
  useEffect(()=>{
    if(node.type!=='approval'||node.data.approvedItems!=null||node.data.result?.input?.length)return
    let cancelled=false
    workflowRequest<{runs:RunItem[]}>(`/${workflowId}/runs`).then(({runs})=>{
      const pending=runs.find(run=>run.result?.nodeResults?.[node.id]?.status==='waiting')?.result?.nodeResults?.[node.id]?.input
      if(!cancelled&&Array.isArray(pending))setReviewedInput(pending)
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[workflowId,node.id,node.type,node.data.approvedItems,node.data.result])
  useEffect(()=>{
    if(!['aiAgent','chatModel','promptTrigger','searchContent','aiVision'].includes(node.type||''))return
    let cancelled=false
    fetch('/api/ai/status',{credentials:'same-origin'}).then(r=>r.ok?r.json():{}).then((data:{model?:string;availableModels?:string[];catalog?:{id:string;imageOutput?:boolean}[]})=>{if(cancelled)return;const rawIds=data.availableModels||[];const ids=rawIds.filter(id=>!data.catalog?.find(item=>item.id===id)?.imageOutput);setModelIds(ids);const fallbackText=(ids.includes(PROMPT_TRIGGER_DEFAULT_MODEL)?PROMPT_TRIGGER_DEFAULT_MODEL:(data.model&&ids.includes(data.model)?data.model:ids[0]))||RESEARCH_DEFAULT_MODEL;if(node.type==='promptTrigger'&&node.data.promptMode==='ai'&&!String(node.data.model||'').trim()&&fallbackText)onUpdate(node.id,{...node.data,model:fallbackText});if(node.type==='searchContent'&&!String(node.data.model||'').trim())onUpdate(node.id,{...node.data,model:fallbackText})}).catch(()=>{})
    return()=>{cancelled=true}
  },[node.type])
  useEffect(()=>{
    if(node.type!=='imageGenerate'&&node.type!=='imageEdit')return
    let cancelled=false
    fetch('/api/ai/image-models',{credentials:'same-origin'}).then(response=>response.ok?response.json():{}).then((body:{models?:string[];defaultModel?:string})=>{
      if(cancelled)return
      setImageModelIds(body.models||[])
      if(!node.data.model&&body.defaultModel&&(node.type==='imageGenerate'||node.data.editMode==='aiEdit'))onUpdate(node.id,{...node.data,model:body.defaultModel})
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[node.id,node.type])
  useEffect(()=>{setEditingLabel(false);setLabelDraft(String(node.data.label||''))},[node.id])
  const data=node.data
  const isModelNode=node.type==='chatModel'
  const resources=agentResources(node.id,nodes,edges)
  const result=data.result
  const approvalInput=result?.status==='waiting'&&result.input?.length?result.input:reviewedInput
  const upstream=new Set<string>()
  const collectUpstream=(id:string)=>{if(upstream.has(id))return;upstream.add(id);edges.filter(edge=>edge.target===id).forEach(edge=>collectUpstream(edge.source))}
  collectUpstream(node.id)
  const availableKeys=[...new Set([...(result?.input?.[0]?Object.keys(result.input[0].json):[]),...nodes.filter(item=>upstream.has(item.id)&&item.id!==node.id).flatMap(item=>{
    if(item.type==='chatTrigger')return ['chatInput','sessionId']
    if(item.type==='aiAgent'||item.type==='aiVision')return ['output']
    try{return Object.keys(JSON.parse(String(item.data.sampleData||item.data.fields||'{}')))}catch{return []}
  })])]
  const str=(key:string)=>typeof data[key]==='string'?data[key] as string:''
  const update=(key:string,value:unknown)=>onUpdate(node.id,{...data,[key]:value})
  const commitLabel=()=>{const next=labelDraft.trim();if(next&&next!==String(data.label||''))update('label',next);else if(!next)setLabelDraft(String(data.label||''));setEditingLabel(false)}
  const splitCount=Math.min(20,Math.max(1,Number(data.splitCount)||3))
  const copySplitRule=async()=>{try{await navigator.clipboard.writeText(splitOutAgentRule(splitCount));setRuleCopied(true)}catch{setRuleCopied(false)}}
  const webhookUrl=webhookToken?`${window.location.origin}/api/workflows/hooks/${webhookToken}`:''
  const copyWebhookUrl=async()=>{if(!webhookUrl)return;try{await navigator.clipboard.writeText(webhookUrl);setWebhookCopied(true);setTimeout(()=>setWebhookCopied(false),2500)}catch{setWebhookCopied(false)}}
  const generateToken=async()=>{if(!onGenerateWebhookToken||tokenBusy||busy)return;setTokenBusy(true);try{await onGenerateWebhookToken()}finally{setTokenBusy(false)}}
  const field=(key:string,label:string,placeholder='',multiline=false)=><label className="wf-field" key={key}><span>{label}</span>{multiline?<textarea rows={key==='fields'||key==='sampleData'||key==='body'||key==='headers'?5:3} value={str(key)} disabled={busy} placeholder={placeholder} onChange={e=>update(key,e.target.value)}/>:<input value={str(key)} disabled={busy} placeholder={placeholder} onChange={e=>update(key,e.target.value)}/>}</label>
  const choice=(key:string,label:string,options:string[])=><label className="wf-field" key={key}><span>{label}</span><select disabled={busy} value={str(key)||options[0]} onChange={e=>update(key,e.target.value)}>{options.map(option=><option key={option} value={option}>{optionNames[option]||option}</option>)}</select></label>
  const checkbox=(key:string,label:string,checked=Boolean(data[key]))=><label className="wf-check" key={key}><input type="checkbox" disabled={busy} checked={checked} onChange={e=>update(key,e.target.checked)}/>{label}</label>
  const operators=['equals','notEquals','contains','notContains','startsWith','gt','lt','exists','isEmpty']
  const igOp=str('operation')||'publish'
  return <aside aria-label="Detail node" className={'wf-node-dialog '+(isModelNode?'wf-model-dialog':'')} onKeyDown={e=>{if(e.key==='Escape'&&!busy){e.stopPropagation();onClose()}}}>
     <header className="wf-dialog-heading"><div className="wf-dialog-title"><div className="wf-node-title-row">{editingLabel?<input className="wf-node-title-input" autoFocus disabled={busy} value={labelDraft} onChange={event=>setLabelDraft(event.target.value)} onBlur={commitLabel} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();commitLabel()}if(event.key==='Escape'){setLabelDraft(String(data.label||''));setEditingLabel(false)}}}/>:<h2>{String(data.label||'Node')}</h2>}<button type="button" className="wf-node-title-edit" disabled={busy} aria-label="Ganti nama node" title="Ganti nama node" onClick={()=>{setLabelDraft(String(data.label||''));setEditingLabel(true)}}><Pencil size={14}/></button></div><p>{isModelNode?'Pilih model yang akan digunakan oleh AI Agent.':nodeHelp[node.type||'']||'Atur langkah ini sesuai tujuan workflow Anda.'}</p></div><div className="wf-dialog-heading-actions">{!isModelNode&&<button disabled={busy||isSubNode(node.type)} onClick={()=>{setTab('results');onExecute(node.id)}}><Play size={15}/>{busy?'Menguji…':'Uji langkah'}</button>}</div><button className="wf-dialog-close" disabled={busy} aria-label="Tutup detail node" onClick={onClose}><X size={18}/></button></header>
    {!isModelNode&&<nav className="wf-detail-tabs" aria-label="Bagian detail node">{[...(!isSubNode(node.type)?[['input','Input']]:[]),['parameters','Pengaturan'],['results','Output']].map(([id,label])=><button key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>}
    <div className="wf-node-columns">
      {isModelNode?<section className="wf-parameters wf-model-settings is-current"><label className="wf-field"><span>Pilih model AI</span>{modelIds.length>0?<select autoFocus disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Pilih model…</option>{str('model')&&!modelIds.includes(str('model'))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{modelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select>:<input autoFocus list="wf-chat-models" disabled={busy} value={str('model')} placeholder="Masukkan ID model AI" onChange={event=>update('model',event.target.value)}/>}</label>{modelIds.length===0&&<p className="wf-inline-note">Daftar model belum tersedia. Anda dapat memasukkan ID model secara manual.</p>}</section>:<>
      {!isSubNode(node.type)&&<section className={'wf-input '+(tab==='input'?'is-current':'')}><NodeInputPanel workflowId={workflowId} node={node} nodes={nodes} edges={edges} busy={busy} onUpdate={onUpdate} onExecute={onExecute}/></section>}
      <section className={'wf-parameters '+(tab==='parameters'?'is-current':'')}>
        {Boolean(data.inputField)&&<p className="wf-inline-note">Bahan eksekusi mengikuti data pilihan di tab Input.</p>}
        {node.type==='chatTrigger'&&<>{field('chatInput','Pesan untuk mencoba','Bantu saya membuat konten',true)}<p className="wf-inline-note">Untuk bercakap-cakap, klik Uji chat di toolbar lalu kirim pesan.</p>{advanced&&field('sessionId','ID sesi contoh','test-session')}</>}
        {node.type==='promptTrigger'&&<><label className="wf-field"><span>Perintah untuk memulai alur</span><textarea rows={6} value={str('prompt')} disabled={busy} placeholder="Contoh: Buat konsep 3 slide Instagram tentang produk saya, dengan rasio 4:5." onChange={event=>update('prompt',event.target.value)}/></label><label className="wf-field"><span>Cara menjalankan</span><select disabled={busy} value={str('promptMode')||'ai'} onChange={event=>update('promptMode',event.target.value)}><option value="ai">AI · kerjakan perintah dulu</option><option value="normal">Normal · teruskan perintah</option></select></label>{(str('promptMode')||'ai')==='ai'&&<label className="wf-field"><span>Model AI 9router</span>{modelIds.length?<select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Model utama 9router (otomatis)</option>{str('model')&&!modelIds.includes(str('model'))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{modelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select>:<input disabled={busy} value={str('model')} placeholder="Kosong = model utama 9router" onChange={event=>update('model',event.target.value)}/>}</label>}</>}
        {node.type==='webhookTrigger'&&<>
          <div className="wf-webhook-box">
            <strong>URL Webhook (POST JSON)</strong>
            {webhookUrl
              ? <><input readOnly value={webhookUrl} aria-label="URL Webhook"/><div className="wf-webhook-actions"><button type="button" disabled={busy||tokenBusy} onClick={()=>void copyWebhookUrl()}>{webhookCopied?<Check size={14}/>:<Copy size={14}/>} {webhookCopied?'Tersalin':'Salin URL'}</button><button type="button" disabled={busy||tokenBusy} onClick={()=>void generateToken()}><RefreshCw size={14}/> Putar token</button></div></>
              : <button type="button" disabled={busy||tokenBusy} onClick={()=>void generateToken()}>{tokenBusy?'Membuat URL…':'Buat URL Webhook'}</button>}
            <p className="wf-muted">Aktifkan workflow di toolbar agar endpoint ini menerima panggilan dari luar.</p>
          </div>
          <h3>Data contoh (uji manual)</h3>
          <SimpleDataEditor value={str('sampleData')||'{}'} disabled={busy} onChange={value=>update('sampleData',value)}/>
          <details className="wf-advanced"><summary>Edit data teknis</summary>{field('sampleData','Data JSON','{"topic":"Event baru"}',true)}</details>
        </>}
        {node.type==='chatModel'&&<><label className="wf-field"><span>Model teks 9router</span>{modelIds.length>0?<select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Pilih model teks…</option>{str('model')&&!modelIds.includes(str('model'))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{modelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select>:<><input list="wf-chat-models" disabled={busy} value={str('model')} placeholder="Pilih model teks 9router" onChange={event=>update('model',event.target.value)}/><datalist id="wf-chat-models">{modelIds.map(id=><option key={id} value={id} label={formatModelLabel(id)}>{formatModelLabel(id)}</option>)}</datalist></>}</label>{advanced&&choice('temperature','Variasi jawaban (temperature)',['0.7','0','0.2','1'])}<p className="wf-inline-note">Kredensial memakai koneksi 9router dashboard. Model ini dijalankan oleh AI Agent.</p></>}
        {node.type==='memory'&&<>{choice('windowSize','Berapa percakapan terakhir yang diingat?',['5','10','20','1'])}<p className="wf-inline-note">Percakapan dalam sesi yang sama akan diingat. Klik Sesi baru di Uji chat untuk memulai dari awal.</p>{advanced&&field('sessionKey','Kunci sesi','{{ $json.sessionId }}')}</>}
         {node.type==='tool'&&<>{choice('toolType','Kemampuan yang diberikan',['knowledge','textLength','webResearch'])}{str('toolType')!=='webResearch'&&field('description','Kapan Tools digunakan?','Gunakan brief atau hitung panjang teks saat diperlukan',true)}{str('toolType')==='knowledge'&&field('content','Isi brief / pengetahuan','Isi produk, audiens, gaya bahasa, batasan dan CTA.',true)}{str('toolType')==='webResearch'&&<p className="wf-inline-note">AI dapat mencari dan membaca maksimal 5 halaman publik per permintaan. Cantumkan URL untuk setiap fakta; halaman yang gagal dibaca bukan bukti.</p>}<p className="wf-inline-note">AI akan memilih kapan perlu memakai Tools saat mengerjakan tugas.</p></>}
          {node.type==='splitOut'&&<><p className="wf-inline-note">Hubungkan langsung setelah AI Agent. Jumlah ini otomatis menjadi instruksi untuk AI Agent dan setiap hasil harus berisi tepat jumlah item tersebut.</p>{choice('splitCount','Jumlah output',['3','1','2','4','5','6','7','8','9','10','15','20'])}<p className="wf-muted">Input hanya dibaca dari kolom output AI Agent dengan daftar prompts.</p></>}
          {node.type==='merge'&&<>{choice('mode','Cara menggabungkan data',['combineByPosition','append','aggregate'])}{str('mode')==='aggregate'&&field('aggregateField','Nama field hasil daftar','items')}<p className="wf-inline-note">Gunakan “Gabungkan per posisi” untuk menyatukan 2 cabang (misalnya caption dari AI Agent dan gambar dari Generate Gambar).</p></>}
          {node.type==='jsonParse'&&<>{choice('parseMode','Mode pembacaan JSON',['parse','splitArray'])}{field('sourceField','Field teks JSON sumber','output')}{str('parseMode')==='splitArray'&&field('arrayPath','Path array di JSON (opsional)','Kosong = langsung array, misal: slides')}{checkbox('keepInput','Pertahankan data langkah sebelumnya',data.keepInput!==false)}</>}
          {node.type==='wait'&&<><label className="wf-field"><span>Durasi tunggu (detik, 0.1–300)</span><input type="number" min={0.1} max={300} step={0.5} disabled={busy} value={str('durationSeconds')||'5'} onChange={event=>update('durationSeconds',event.target.value)}/></label><p className="wf-inline-note">Meneruskan input apa adanya setelah jeda waktu selesai.</p></>}
          {node.type==='aiAgent'&&<>{str('executionMode')!=='live'&&<p className="wf-inline-note">Langkah lama ini masih pratinjau. <button disabled={busy} onClick={()=>update('executionMode','live')}>Aktifkan AI terhubung</button></p>}{advanced&&choice('executionMode','Cara menjalankan langkah ini',['preview','live'])}<label className="wf-field"><span>Tugas AI</span><textarea rows={5} value={advanced?str('aiPrompt'):friendlyPrompt(str('aiPrompt'))} disabled={busy} placeholder="Contoh: Buatkan caption Instagram berdasarkan topik, produk, audiens, dan CTA dari data sebelumnya." onChange={event=>update('aiPrompt',advanced?event.target.value:technicalPrompt(event.target.value,availableKeys))}/></label><details className="wf-advanced wf-ai-rules"><summary>Aturan AI</summary><label className="wf-field"><textarea aria-label="Aturan AI" rows={8} value={str('systemMessage')} disabled={busy} placeholder="Contoh: Kamu adalah asisten konten Instagram. Gunakan Bahasa Indonesia dan jangan mengarang fakta." onChange={event=>update('systemMessage',event.target.value)}/></label></details>{!advanced&&availableKeys.length>0&&<div className="wf-data-tokens"><span>Tambahkan bahan dari langkah sebelumnya:</span>{availableKeys.slice(0,10).map(key=><button type="button" key={key} disabled={busy} onClick={()=>update('aiPrompt',str('aiPrompt')+` {{ $json.${key} }}`)}>{dataLabel(key)}</button>)}<p>Teks dalam [kurung] diisi otomatis saat alur dijalankan.</p></div>}{advanced&&choice('maxIterations','Batas putaran kerja AI',['3','1','2','4','5'])}<div className="wf-resource-list"><h4>Yang dipakai AI untuk bekerja</h4>{[['chatModel','Model AI (wajib)',resources.model],['memory','Memory (opsional)',resources.memory]].map(([type,label,resource])=><div key={String(type)}><span>{String(label)}</span>{resource&&typeof resource==='object'?<button disabled={busy} onClick={()=>onSelect(resource.id)}>{String(resource.data.label)}</button>:<button disabled={busy} onClick={()=>onAddResource(String(type),node.id)}>+ Tambah</button>}</div>)}</div></>}
        {node.type==='trigger'&&<>
          {choice('triggerMode','Kapan alur dimulai?',['manual','schedule'])}
          {str('triggerMode')==='schedule'&&<>
            <label className="wf-field"><span>Pilih jadwal cepat</span><select disabled={busy} value={schedulePresets.some(p=>p.cron===str('cron'))?str('cron'):''} onChange={event=>{const preset=schedulePresets.find(p=>p.cron===event.target.value);if(preset)onUpdate(node.id,{...data,cron:preset.cron,interval:preset.label})}}><option value="">Kustom cron…</option>{schedulePresets.map(p=><option key={p.cron} value={p.cron}>{p.label}</option>)}</select></label>
            {field('cron','Ekspresi Cron (WIB · menit jam tgl bln hari)','0 10 * * *')}
            <p className="wf-inline-note">Aktifkan workflow lewat tombol <strong>Aktif</strong> di toolbar agar berjalan otomatis sesuai jadwal (Asia/Jakarta).</p>
          </>}
          <h3>Bahan awal workflow</h3><SimpleDataEditor value={str('sampleData')||'{}'} disabled={busy} onChange={value=>update('sampleData',value)}/>
          <details className="wf-advanced"><summary>Edit data teknis</summary>{field('sampleData','Data JSON','{"topic":"Ide konten"}',true)}</details>
        </>}
        {node.type==='set'&&<><h3>Informasi yang ditambahkan</h3><SimpleDataEditor value={str('fields')||'{}'} disabled={busy} onChange={value=>update('fields',value)}/>{checkbox('keepInput','Tetap bawa informasi dari langkah sebelumnya',data.keepInput!==false)}<details className="wf-advanced"><summary>Edit data teknis</summary>{field('fields','Data JSON','{"title":"{{ $json.topic }}"}',true)}</details></>}
        {node.type==='if'&&<><label className="wf-field"><span>Informasi yang diperiksa</span><select disabled={busy} value={str('field')} onChange={event=>update('field',event.target.value)}>{[...new Set([str('field'),...availableKeys])].filter(Boolean).map(key=><option key={key} value={key}>{dataLabel(key)}</option>)}</select></label>{choice('operator','Syaratnya',operators)}{!['exists','isEmpty'].includes(str('operator')||'equals')&&(str('field')==='approved'?<label className="wf-field"><span>Nilai yang diharapkan</span><select disabled={busy} value={str('value')} onChange={event=>update('value',event.target.value)}><option value="true">Ya / Sudah disetujui</option><option value="false">Belum / Tidak</option></select></label>:field('value','Nilai yang diharapkan','Contoh: siap'))}<p className="wf-muted">Jika syarat terpenuhi, alur mengikuti cabang Ya. Jika tidak, alur mengikuti cabang Tidak.</p>{advanced&&field('field','Nama field / path teknis','approved')}</>}
        {node.type==='switch'&&<>
          {field('field','Field yang diperiksa','type')}
          {[1,2,3].map(n=>{const opKey=`rule${n}Operator`,valKey=`rule${n}Value`,op=str(opKey);return <div className="wf-switch-rule" key={n}><strong>Jalur {n} (case{n})</strong><label className="wf-field"><span>Kondisi</span><select disabled={busy} value={op} onChange={e=>update(opKey,e.target.value)}><option value="">Tidak dipakai</option>{operators.map(o=><option key={o} value={o}>{optionNames[o]||o}</option>)}</select></label>{op&&!['exists','isEmpty'].includes(op)&&field(valKey,'Nilai pembanding','Contoh: carousel')}</div>})}
          <p className="wf-inline-note">Item yang tidak cocok dengan jalur 1–3 otomatis diteruskan ke jalur <strong>lain (fallback)</strong>.</p>
        </>}
        {node.type==='imageGenerate'&&<><label className="wf-field"><span>Model gambar</span>{imageModelIds.length?<select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Pilih model gambar…</option>{str('model')&&!imageModelIds.includes(str('model'))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{imageModelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select>:<input value={str('model')} disabled={busy} onChange={event=>update('model',event.target.value)} placeholder="ID model gambar dari 9router"/>}</label>{field('prompt','Prompt gambar (opsional)','Kosong = gunakan prompt dari langkah sebelumnya',true)}</>}
        {node.type==='imageEdit'&&<>
          {choice('editMode','Mode edit gambar',['igFormat','aiEdit'])}
          {(str('editMode')||'igFormat')==='igFormat'
            ? <>{choice('aspectRatio','Ukuran / rasio gambar',['4:5','1:1','9:16','original'])}{field('overlayTitle','Judul teks overlay (opsional)','Contoh: {{ $json.headline }}')}{field('overlaySubtitle','Subjudul teks (opsional)','Contoh: {{ $json.cta }}')}{field('watermark','Watermark / akun (opsional)','@bluudzstore')}{choice('textPosition','Posisi teks',['bottom','top','center'])}</>
            : <><label className="wf-field"><span>Model gambar 9router</span>{imageModelIds.length?<select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Pilih model gambar…</option>{str('model')&&!imageModelIds.includes(str('model'))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{imageModelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select>:<input value={str('model')} disabled={busy} onChange={event=>update('model',event.target.value)} placeholder="ID model gambar dari 9router"/>}</label>{field('prompt','Instruksi edit gambar','Kosong = gunakan prompt dari langkah sebelumnya',true)}{choice('resolution','Resolusi target',['1K','2K','4K'])}</>}
        </>}
        {node.type==='aiVision'&&<>
          <label className="wf-field"><span>Model AI Vision</span><select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Model utama 9router (otomatis)</option>{str('model')&&!(modelIds.length===0||modelIds.includes(str('model')))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{modelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select></label>
          {field('prompt','Instruksi analisis / QA gambar','Periksa kualitas gambar, teks, dan kecocokan dengan brief.',true)}
          {checkbox('qaMode','Mode Quality Check (hasilkan visionPassed & visionScore)',data.qaMode!==false)}
        </>}
        {node.type==='instagram'&&<>
          <InstagramAccountSettings value={str('accountId')} busy={busy} onChange={id=>update('accountId',id)} operation={igOp} onOperationChange={operation=>update('operation',operation)}/>
          {(igOp==='publish'||igOp==='stories')&&<details className="wf-advanced"><summary>Ubah sumber gambar{igOp==='publish'?' atau caption':''}</summary>{igOp==='publish'&&field('caption','Caption khusus','Kosong = caption dari langkah sebelumnya',true)}{field('imageUrl','URL gambar khusus','Kosong = gambar dari langkah sebelumnya')}</details>}
          {igOp==='reels'&&<>{field('videoUrl','URL video Reel (opsional)','Kosong = ambil videoUrl dari langkah sebelumnya')}{field('caption','Caption Reel (opsional)','Kosong = caption dari langkah sebelumnya',true)}<details className="wf-advanced"><summary>Cover Reel (opsional)</summary>{field('coverUrl','URL gambar cover Reel','https://...')}</details></>}
          {(igOp==='inspect'||igOp==='comments')&&field('mediaId','ID post Instagram (opsional)','Kosong = ID dari langkah sebelumnya')}
        </>}
        {node.type==='notify'&&<><NotificationChannelSettings value={str('channelId')} busy={busy} onChange={id=>update('channelId',id)}/>{field('message','Pesan notifikasi (opsional)','Kosong = ringkasan hasil langkah sebelumnya. Gunakan {{ $json.namaField }}.',true)}{checkbox('includeImage','Sertakan gambar dari langkah sebelumnya (jika ada)',Boolean(data.includeImage))}</>}
        {node.type==='approval'&&<section className="wf-approval-panel"><h3>Persetujuan konten</h3>{Array.isArray(data.approvedItems)?<><p className="wf-inline-note">Versi yang disetujui tersimpan. Pengujian berikutnya akan meneruskan versi ini, meskipun langkah sebelumnya menghasilkan teks baru.</p><DataViewer items={data.approvedItems as DataItem[]}/><button type="button" disabled={busy} onClick={()=>update('approvedItems',null)}>Cabut persetujuan</button></>:<><p className="wf-inline-note">Jalankan alur untuk melihat bahan yang masuk. Langkah sesudah ini akan menunggu keputusan Anda.</p>{approvalInput.length?<><DataViewer items={approvalInput}/><button type="button" disabled={busy} onClick={()=>update('approvedItems',approvalInput)}>Setujui hasil ini</button><p className="wf-muted">Setelah menyetujui, jalankan ulang alur. Yang diteruskan adalah salinan persis dari hasil yang Anda tinjau.</p></>:<p className="wf-muted">Belum ada hasil untuk ditinjau. Klik Jalankan alur atau Uji langkah terlebih dahulu.</p>}</>}</section>}
        {node.type==='searchContent'&&<>{choice('sourceMode','Cara mengambil informasi',['search','url'])}{(str('sourceMode')||'search')==='url'?field('url','Alamat HTTPS publik','https://contoh.com/artikel-atau-data.json'):<>{field('query','Topik pencarian (opsional)','Kosong = memakai topik dari langkah sebelumnya')}<label className="wf-field"><span>Model AI untuk menyusun pencarian</span><select disabled={busy} value={str('model')} onChange={event=>update('model',event.target.value)}><option value="">Model utama 9router (otomatis)</option>{str('model')&&!(modelIds.length===0||modelIds.includes(str('model')))&&<option value={str('model')}>{formatModelLabel(str('model'))} (tidak tersedia di 9router)</option>}{modelIds.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select></label>{choice('maxPages','Jumlah halaman yang dibaca',['12','5','8','15','20'])}<p className="wf-inline-note">AI menyusun beberapa sudut pencarian dari bahan sebelumnya. Node membaca sumber secara merata dan mencari lagi jika materi yang terbaca masih kurang. Lihat cakupan, sumber, dan kendala di Output.</p></>}</>}
        {node.type==='apiRequest'&&<>{choice('method','Metode HTTP',['GET','POST','PUT','PATCH','DELETE'])}{field('url','Alamat HTTPS publik','https://api.contoh.com/endpoint')}{field('headers','Header JSON (opsional)','{"Authorization":"Bearer ..."}',true)}{['POST','PUT','PATCH'].includes(str('method')||'GET')&&field('body','Body JSON (opsional)','{"topic":"{{ $json.topic }}"}',true)}<p className="wf-inline-note">URL lokal, jaringan privat, kredensial di URL, dan redirect diblokir demi keamanan.</p></>}
        {node.type==='httpRequest'&&<>{field('url','Alamat HTTPS publik','https://contoh.com/data.json')}<p className="wf-inline-note">Hanya GET. Respons teks atau JSON disimpan pada output dan riwayat. URL lokal, jaringan privat, kredensial di alamat, dan pengalihan tidak diizinkan.</p></>}
        {node.type==='googleDrive'&&<><GoogleDriveSettings value={str('accountId')} busy={busy} onChange={id=>update('accountId',id)}/><label className="wf-field"><span>Tindakan</span><select disabled={busy} value={str('operation')||'shared'} onChange={event=>update('operation',event.target.value)}><option value="shared">Pilih dari link berbagi</option><option value="list">Cari / lihat daftar file</option><option value="view">Lihat detail file</option><option value="download">Unduh file berdasarkan ID</option></select></label>{(str('operation')||'shared')==='shared'?<>{choice('mediaFilter','Jenis media dari folder',['images','videos','all'])}{field('sharedLink','Link berbagi file atau folder','https://drive.google.com/drive/folders/...')}{choice('selectionMode','Jika link berisi folder',['random','name'])}{str('selectionMode')==='name'&&field('nameFilter','Nama file yang dicari','Boleh sebagian nama, misalnya slide-01')}<p className="wf-inline-note">Link file mengambil file tersebut. Link folder memilih gambar JPEG/PNG atau video MP4/MOV secara acak atau sesuai nama (maks. 300 file).</p></>:(str('operation')||'shared')==='list'?field('search','Nama file (opsional)','Kosong = file terbaru'):field('fileId','ID file Google Drive','Tempel ID file atau pakai dari langkah sebelumnya')}{['shared','download'].includes(str('operation')||'shared')&&<p className="wf-inline-note">Gambar (maks. 12 MB) diteruskan sebagai imageUrl; video MP4/MOV (maks. 30 MB) diteruskan sebagai videoUrl untuk Reels.</p>}</>}
         {node.type==='aiAgent'&&<>
           {advanced&&str('executionMode')!=='live'&&<label className="wf-field"><span>Model teks (pratinjau lama)</span><input list="wf-model-ids" disabled={busy} value={str('aiModel')||str('model')} onChange={e=>onUpdate(node.id,{...data,aiModel:e.target.value,model:e.target.value})} placeholder="Pilih dari katalog atau ketik ID model"/><datalist id="wf-model-ids">{modelIds.map(id=><option key={id} value={id} label={formatModelLabel(id)}>{formatModelLabel(id)}</option>)}</datalist></label>}
          
           {str('executionMode')!=='live'&&<p className="wf-inline-note">Mode pratinjau hanya menampilkan konfigurasi dan prompt.</p>}
         </>}
         <details className="wf-advanced" open={advanced} onToggle={event=>setAdvanced(event.currentTarget.open)}><summary>Pengaturan lanjutan (opsional)</summary>{node.type==='aiAgent'&&field('role','Peran AI','Analyst')}{node.type==='splitOut'&&<section className="wf-copy-rule"><h3>Aturan tambahan untuk AI Agent</h3><p className="wf-muted">Aturan ini sudah mengikuti jumlah output di atas. Salin lalu tempel ke kolom “Tugas AI” pada AI Agent.</p><textarea readOnly rows={11} value={splitOutAgentRule(splitCount)}/><button type="button" onClick={()=>void copySplitRule()}>{ruleCopied?<Check size={14}/>:<Copy size={14}/>} {ruleCopied?'Aturan tersalin':'Salin aturan'}</button></section>}{checkbox('disabled','Lewati langkah ini')}{['set','aiAgent','apiRequest','notify','imageEdit','aiVision'].includes(node.type||'')&&<p className="wf-expression-help">Ekspresi teknis: <code>{'{{ $json.namaField }}'}</code>.</p>}<button disabled={busy} className="wf-danger" onClick={()=>onDelete(node.id)}><Trash2 size={14}/>Hapus langkah</button></details>
      </section>
      <section className={'wf-io '+(tab==='results'?'is-current':'')}><h3>Output</h3><p className="wf-muted">{result?({success:'Berhasil',simulated:'Pratinjau',error:'Perlu diperbaiki',skipped:'Dilewati',pinned:'Memakai hasil tersimpan',waiting:'Menunggu persetujuan'}[result.status])+' · '+result.durationMs+' ms':isSubNode(node.type)?'Bagian ini digunakan oleh AI Agent. Buka AI Agent untuk melihat hasilnya.':'Klik Uji langkah untuk melihat hasilnya di sini.'}</p>{result?.error&&<p role="alert" className="wf-error">{result.error}</p>}{result?.message&&<p className="wf-inline-note">{result.message}</p>}{!isSubNode(node.type)&&<DataViewer items={result?.output||[]} nodeType={node.type}/>}
        {advanced&&!['if','switch'].includes(node.type||'')&&!isSubNode(node.type)&&<button disabled={busy||(!result?.output.length&&data.pinnedOutput==null)} className="wf-pin-button" onClick={()=>update('pinnedOutput',data.pinnedOutput!=null?null:result?.output)}><Pin size={14}/>{data.pinnedOutput!=null?'Lepas pin data':'Pin output untuk pengujian'}</button>}
        {data.pinnedOutput!=null&&<p className="wf-muted">Pengujian berikutnya memakai data pin, bukan menghitung ulang node ini.</p>}
        {!!result?.input.length&&<details className="wf-advanced"><summary>Bahan yang diterima dari langkah sebelumnya</summary><DataViewer items={result.input}/></details>}
       </section>
      </>}
    </div>
  </aside>
}
