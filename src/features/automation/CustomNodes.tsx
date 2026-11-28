import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, AlertCircle, Film, Pin, Plus } from 'lucide-react'
import { catalog, formatModelLabel, ports, workflowNodeImages, type StudioNode } from './workflow-model'
import { iconForWorkflowNode } from './workflow-node-icons'
import { aiPorts, isSubNode, isTrigger } from '../../../shared/workflow-connections'
import type { UploadedReferenceMedia } from './MediaReferenceUploader'

const operationLabels:Record<string,string>={
  publish:'Terbitkan media',reels:'Terbitkan Reel',stories:'Terbitkan Story',comments:'Baca komentar',insights:'Lihat statistik',list:'Lihat / daftar',inspect:'Periksa post',shared:'Link berbagi',view:'Lihat file',download:'Unduh file',
}

function nodeSummary(type:string|undefined,data:StudioNode['data']):string {
  if(type==='promptTrigger')return data.promptMode==='ai'?'Mode AI':'Mode Normal'
  if(type==='webhookTrigger')return 'Pemicu dari URL luar'
  if(type==='chatModel')return data.model?formatModelLabel(String(data.model)):'Model belum dipilih'
  if(type==='imageGenerate'){if(data.provider==='googleFlow'){const ratio=data.aspectRatio&&data.aspectRatio!=='ui-default'?String(data.aspectRatio):'Auto';const model=data.model&&data.model!=='ui-default'?String(data.model):'Google Flow';return `${ratio} · ${model}`}return data.model?formatModelLabel(String(data.model)):'Model gambar belum dipilih'}
  if(type==='imageEdit')return data.editMode==='aiEdit'?(data.model?`AI Edit · ${formatModelLabel(String(data.model))}`:'AI Edit · pilih model'):`Format IG ${String(data.aspectRatio||'4:5')}`
  if(type==='videoGenerate'){const ratio=data.aspectRatio&&data.aspectRatio!=='ui-default'?String(data.aspectRatio):'Auto';const model=data.model&&data.model!=='ui-default'?String(data.model):'Google Flow';return `${ratio} · ${model}`}
  if(type==='aiVision')return data.model?`Vision · ${formatModelLabel(String(data.model))}`:'Analisis gambar AI'
  if(type==='aiAgent')return data.executionMode==='preview'?'Mode pratinjau':'Mode AI aktif'
  if(type==='memory')return `${String(data.windowSize||5)} percakapan terakhir`
  if(type==='searchContent')return data.sourceMode==='url'?'Baca URL langsung':'Susun pencarian dan baca sumber'
  if(type==='apiRequest')return `${String(data.method||'GET')} ${data.url?String(data.url).slice(0,24):'API eksternal'}`
  if(type==='googleDrive')return operationLabels[String(data.operation||'shared')]||'Pilih file'
  if(type==='mediaFile'){
    const files=Array.isArray(data.files)?(data.files as UploadedReferenceMedia[]):[]
    if(!files.length)return 'Belum ada file referensi'
    const photos=files.filter(f=>f.mediaType!=='video').length
    const videos=files.filter(f=>f.mediaType==='video').length
    return [photos?`${photos} foto`:'',videos?`${videos} video`:''].filter(Boolean).join(' · ')
  }
  if(type==='instagram')return operationLabels[String(data.operation||'publish')]||'Tindakan Instagram'
  if(type==='notify')return data.channelId?'Kirim notifikasi':'Pilih channel'
  if(type==='merge')return data.mode==='append'?'Gabung berurutan':data.mode==='aggregate'?'Rangkum 1 objek':'Gabung per posisi'
  if(type==='jsonParse')return data.parseMode==='splitArray'?'Pecah array JSON':'Urai JSON ke field'
  if(type==='splitOut')return `${String(data.splitCount||3)} hasil terpisah`
  if(type==='if')return data.field?`Periksa ${String(data.field)}`:'Atur kondisi'
  if(type==='switch')return data.field?`Rute ${String(data.field)}`:'Atur cabang rute'
  if(type==='wait')return `Jeda ${String(data.durationSeconds||5)} detik`
  if(type==='set')return data.keepInput===false?'Ganti data sebelumnya':'Teruskan dan tambah data'
  if(type==='approval')return 'Tunggu persetujuan'
  if(type==='chatTrigger')return 'Mulai dari pesan chat'
  if(type==='trigger')return data.triggerMode==='schedule'?`Jadwal (${String(data.cron||'0 10 * * *')})`:'Jalankan manual'
  if(type==='httpRequest')return 'Baca URL HTTPS'
  if(type==='tool')return 'Alat bantu AI lama'
  return 'Siap dikonfigurasi'
}

function WorkflowNodeCard({data,type,selected}:NodeProps<StudioNode>) {
  const Icon=iconForWorkflowNode(type)
  const definition=catalog.find(item=>item.type===type)
  const port=ports(type)
  const status=data.running?'running':(typeof data.status==='string'?data.status:undefined)||data.result?.status||'idle'
  const images=workflowNodeImages({type,data})
   const statusText:Record<string,string>={idle:'Belum diuji',running:'Sedang diproses…',success:'Selesai',simulated:'Pratinjau',skipped:'Dilewati',pinned:'Data pin',error:'Error',waiting:'Menunggu persetujuan',queued:'Menunggu giliran'}
   const nodeLabel=data.label||definition?.title||'Node lama'
   const nodeTypeLabel=definition?.title||type||'Node lama'
   const summary=nodeSummary(type,data)
   const usesGoogleFlow=type==='videoGenerate'||(type==='imageGenerate'&&data.provider==='googleFlow')
   const flowConn=data.googleFlowConn as {installed?:boolean;connected?:boolean;accountLabel?:string}|null|undefined
   const refFiles=type==='mediaFile'&&Array.isArray(data.files)?(data.files as UploadedReferenceMedia[]).filter(f=>f&&typeof f.previewUrl==='string'):[]
   const resultCount=type==='searchContent'?Number(data.result?.output?.[0]?.json?.sourceCount||data.result?.output?.length||0):data.result?.output.length
   return <div aria-label={String(nodeLabel)} className={'wf-node wf-kind-'+type+' '+(selected?'is-selected ':'')+'status-'+status+(images.length?' has-image':'')}>
    {!isTrigger(type)&&!isSubNode(type)&&<Handle type="target" id={port.input} position={Position.Left} />}
     <div className="wf-node-main">
       {!images.length&&<><div className="wf-node-heading"><div className="wf-node-icon"><Icon size={20}/></div><strong>{nodeLabel}</strong>{data.pinnedOutput!=null&&<Pin className="wf-node-pin" size={13}/>}</div>
       <div className="wf-node-meta"><span className="wf-node-type">{nodeTypeLabel}</span><span className="wf-node-summary">{summary}</span>{refFiles.length>0&&<div className="wf-node-ref-strip">{refFiles.slice(0,3).map((file,idx)=><span key={`${file.previewUrl}-${idx}`} className="wf-node-ref-thumb">{file.mediaType==='video'?<Film size={14}/>:<img src={file.previewUrl} alt="" loading="lazy"/>}</span>)}{refFiles.length>3&&<span className="wf-node-ref-more">+{refFiles.length-3}</span>}</div>}{usesGoogleFlow&&flowConn&&<span className={'wf-node-flow-badge '+(flowConn.connected?'is-connected':'is-disconnected')}><span className="wf-flow-dot"/>{flowConn.connected?'Flow Terhubung':'Flow Tidak Terhubung'}</span>}</div></>}
       {images.length>0&&<div className="wf-node-images">{images.map((url,index)=><img key={url+index} src={url} alt={`Hasil gambar ${index+1}`} loading="lazy" draggable={false} referrerPolicy="no-referrer"/>)}</div>}
     </div>
    <div className="wf-node-footer"><span>{status==='error'?<AlertCircle size={12}/>:status==='success'?<Check size={12}/>:null}{images.length?'Selesai':isSubNode(type)&&status==='idle'?'Dipakai oleh AI Agent':statusText[status]}</span>{images.length>0?<span>{((data.result?.durationMs||0)/1000).toFixed(1)} s</span>:data.result&&<span>{resultCount} {type==='searchContent'?'sumber':'hasil'}</span>}</div>
    {data.disabled===true&&<div className="wf-node-disabled">Dinonaktifkan</div>}
    {isSubNode(type)?<Handle className="wf-ai-handle" type="source" id={aiPorts[type||'']} position={Position.Top}/>:type==='if'?<><span className="wf-port-label port-true">true</span><Handle type="source" id="true" position={Position.Right} style={{top:'32%'}}/><span className="wf-port-label port-false">false</span><Handle type="source" id="false" position={Position.Right} style={{top:'72%'}}/></>:type==='switch'?<><span className="wf-port-label port-case1">1</span><Handle type="source" id="case1" position={Position.Right} style={{top:'20%'}}/><span className="wf-port-label port-case2">2</span><Handle type="source" id="case2" position={Position.Right} style={{top:'40%'}}/><span className="wf-port-label port-case3">3</span><Handle type="source" id="case3" position={Position.Right} style={{top:'60%'}}/><span className="wf-port-label port-fallback">lain</span><Handle type="source" id="fallback" position={Position.Right} style={{top:'82%'}}/></>:<Handle type="source" id={port.output} position={Position.Right}/>}
      {type==='aiAgent'&&<div className="wf-agent-ports">{[['chatModel','Model AI *'],['memory','Memory']].map(([resource,label],index)=>{const connected=Array.isArray(data.connectedAiResources)&&data.connectedAiResources.includes(resource);return <div key={resource} className={'wf-agent-port '+(connected?'is-connected':'')} style={{left:`${34+index*32}%`}}><Handle className="wf-ai-handle" type="target" id={aiPorts[resource]} position={Position.Bottom}/><span>{connected&&resource==='chatModel'?'Model AI':label}</span>{!connected&&<button className="nodrag nopan" type="button" disabled={data.running===true} aria-label={'Add '+label.replace(' *','')} onClick={event=>{event.stopPropagation();if(typeof data.onAddResource==='function')data.onAddResource(resource)}}><Plus size={12}/></button>}</div>})}</div>}
  </div>
}
export const TriggerNode=WorkflowNodeCard
export const AiAgentNode=WorkflowNodeCard
export const SetNode=WorkflowNodeCard
export const SplitOutNode=WorkflowNodeCard
export const IfNode=WorkflowNodeCard
export const ChatTriggerNode=WorkflowNodeCard
export const ChatModelNode=WorkflowNodeCard
export const MemoryNode=WorkflowNodeCard
export const ToolNode=WorkflowNodeCard
