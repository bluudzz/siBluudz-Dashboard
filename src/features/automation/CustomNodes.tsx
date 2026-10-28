import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Check, AlertCircle, Pin, Plus } from 'lucide-react'
import { catalog, formatModelLabel, ports, type StudioNode } from './workflow-model'
import { iconForWorkflowNode } from './workflow-node-icons'
import { aiPorts, isSubNode, isTrigger } from '../../../shared/workflow-connections'

const operationLabels:Record<string,string>={
  publish:'Terbitkan media',inspect:'Periksa post',shared:'Link berbagi',list:'Daftar file',view:'Lihat file',download:'Unduh file',
}

function nodeSummary(type:string|undefined,data:StudioNode['data']):string {
  if(type==='promptTrigger')return data.promptMode==='ai'?'Mode AI':'Mode Normal'
  if(type==='chatModel')return data.model?formatModelLabel(String(data.model)):'Model belum dipilih'
  if(type==='imageGenerate')return data.model?formatModelLabel(String(data.model)):'Model gambar belum dipilih'
  if(type==='aiAgent')return data.executionMode==='preview'?'Mode pratinjau':'Mode AI aktif'
  if(type==='memory')return `${String(data.windowSize||5)} percakapan terakhir`
  if(type==='searchContent')return data.sourceMode==='url'?'Baca URL langsung':'Susun pencarian dan baca sumber'
  if(type==='googleDrive')return operationLabels[String(data.operation||'shared')]||'Pilih file'
  if(type==='instagram')return operationLabels[String(data.operation||'publish')]||'Tindakan Instagram'
  if(type==='splitOut')return `${String(data.splitCount||3)} hasil terpisah`
  if(type==='if')return data.field?`Periksa ${String(data.field)}`:'Atur kondisi'
  if(type==='set')return data.keepInput===false?'Ganti data sebelumnya':'Teruskan dan tambah data'
  if(type==='approval')return 'Tunggu persetujuan'
  if(type==='chatTrigger')return 'Mulai dari pesan chat'
  if(type==='trigger')return data.triggerMode==='schedule'?'Jadwal otomatis':'Jalankan manual'
  if(type==='httpRequest')return 'Baca URL HTTPS'
  if(type==='tool')return 'Alat bantu AI lama'
  return 'Siap dikonfigurasi'
}

function WorkflowNodeCard({data,type,selected}:NodeProps<StudioNode>) {
  const Icon=iconForWorkflowNode(type)
  const definition=catalog.find(item=>item.type===type)
  const port=ports(type)
  const status=data.running?'running':(typeof data.status==='string'?data.status:undefined)||data.result?.status||'idle'
   const statusText:Record<string,string>={idle:'Belum diuji',running:'Sedang diproses…',success:'Selesai',simulated:'Pratinjau',skipped:'Dilewati',pinned:'Data pin',error:'Error',waiting:'Menunggu persetujuan',queued:'Menunggu giliran'}
   const nodeLabel=data.label||definition?.title||'Node lama'
   const nodeTypeLabel=definition?.title||type||'Node lama'
   const summary=nodeSummary(type,data)
   const resultCount=type==='searchContent'?Number(data.result?.output?.[0]?.json?.sourceCount||data.result?.output?.length||0):data.result?.output.length
   return <div className={'wf-node wf-kind-'+type+' '+(selected?'is-selected ':'')+'status-'+status}>
    {!isTrigger(type)&&!isSubNode(type)&&<Handle type="target" id={port.input} position={Position.Left} />}
     <div className="wf-node-main">
       <div className="wf-node-heading"><div className="wf-node-icon"><Icon size={20}/></div><strong>{nodeLabel}</strong>{data.pinnedOutput!=null&&<Pin className="wf-node-pin" size={13}/>}</div>
       <div className="wf-node-meta"><span className="wf-node-type">{nodeTypeLabel}</span><span className="wf-node-summary">{summary}</span></div>
     </div>
    <div className="wf-node-footer"><span>{status==='error'?<AlertCircle size={12}/>:status==='success'?<Check size={12}/>:null}{isSubNode(type)&&status==='idle'?'Dipakai oleh AI Agent':statusText[status]}</span>{data.result&&<span>{resultCount} {type==='searchContent'?'sumber':'hasil'}</span>}</div>
    {data.disabled===true&&<div className="wf-node-disabled">Dinonaktifkan</div>}
    {isSubNode(type)?<Handle className="wf-ai-handle" type="source" id={aiPorts[type||'']} position={Position.Top}/>:type==='if'?<><span className="wf-port-label port-true">true</span><Handle type="source" id="true" position={Position.Right} style={{top:'32%'}}/><span className="wf-port-label port-false">false</span><Handle type="source" id="false" position={Position.Right} style={{top:'72%'}}/></>:<Handle type="source" id={port.output} position={Position.Right}/>}
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
