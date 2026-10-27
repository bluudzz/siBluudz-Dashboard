import { Handle, Position, type NodeProps } from '@xyflow/react'
import { Clock, Bot, Braces, GitBranch, Settings, Check, AlertCircle, Pin, MessageCircle, Brain, Wrench, Plus, List, ShieldCheck, Search, Globe } from 'lucide-react'
import { catalog, formatModelLabel, ports, type StudioNode } from './workflow-model'
import { aiPorts, isSubNode, isTrigger } from '../../../shared/workflow-connections'

const icons = {trigger:Clock,chatTrigger:MessageCircle,chatModel:Bot,memory:Brain,tool:Wrench,aiAgent:Bot,set:Braces,splitOut:List,if:GitBranch,approval:ShieldCheck,searchContent:Search,httpRequest:Globe}
function WorkflowNodeCard({data,type,selected}:NodeProps<StudioNode>) {
  const Icon=icons[type as keyof typeof icons]||Settings
  const definition=catalog.find(item=>item.type===type)
  const port=ports(type)
  const status=data.running?'running':data.result?.status||'idle'
   const statusText:Record<string,string>={idle:'Belum diuji',running:'Sedang diproses…',success:'Selesai',simulated:'Pratinjau',skipped:'Dilewati',pinned:'Data pin',error:'Error',waiting:'Menunggu persetujuan'}
   const nodeLabel=type==='splitOut'?'Split Out':data.label||definition?.title||'Node lama'
   return <div className={'wf-node wf-kind-'+type+' '+(selected?'is-selected ':'')+'status-'+status}>
    {!isTrigger(type)&&!isSubNode(type)&&<Handle type="target" id={port.input} position={Position.Left} />}
     <div className="wf-node-main"><div className="wf-node-icon"><Icon size={22}/></div><div><strong>{nodeLabel}</strong><span>{type==='chatModel'?(data.model?formatModelLabel(String(data.model)):'Model belum dipilih'):definition?.title||type}</span></div>{data.pinnedOutput!=null&&<Pin size={13}/>}</div>
    <div className="wf-node-footer"><span>{status==='error'?<AlertCircle size={12}/>:status==='success'?<Check size={12}/>:null}{isSubNode(type)&&status==='idle'?'Dipakai oleh AI Agent':statusText[status]}</span>{data.result&&<span>{data.result.output.length} hasil</span>}</div>
    {data.disabled===true&&<div className="wf-node-disabled">Dinonaktifkan</div>}
    {isSubNode(type)?<Handle className="wf-ai-handle" type="source" id={aiPorts[type||'']} position={Position.Top}/>:type==='if'?<><span className="wf-port-label port-true">true</span><Handle type="source" id="true" position={Position.Right} style={{top:'32%'}}/><span className="wf-port-label port-false">false</span><Handle type="source" id="false" position={Position.Right} style={{top:'72%'}}/></>:<Handle type="source" id={port.output} position={Position.Right}/>}
      {type==='aiAgent'&&<div className="wf-agent-ports">{[['chatModel','Model AI *'],['memory','Memory'],['tool','Tools']].map(([resource,label],index)=>{const connected=Array.isArray(data.connectedAiResources)&&data.connectedAiResources.includes(resource);const canAdd=!connected||resource==='tool';return <div key={resource} className={'wf-agent-port '+(connected?'is-connected':'')} style={{left:`${20+index*30}%`}}><Handle className="wf-ai-handle" type="target" id={aiPorts[resource]} position={Position.Bottom}/><span>{connected&&resource==='chatModel'?'Model AI':label}</span>{canAdd&&<button className="nodrag nopan" type="button" disabled={data.running===true} aria-label={'Add '+label.replace(' *','')} onClick={event=>{event.stopPropagation();if(typeof data.onAddResource==='function')data.onAddResource(resource)}}><Plus size={12}/></button>}</div>})}</div>}
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
