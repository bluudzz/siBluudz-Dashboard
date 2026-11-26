import { useEffect, useState } from 'react'
import type { Edge } from '@xyflow/react'
import { isAiConnection, isTrigger } from '../../../shared/workflow-connections'
import { workflowInput, workflowNodeInput, type DataItem, type NodeResult } from '../../../shared/workflow-engine'
import { workflowInputFields, workflowRequest, type StudioNode, type RunItem } from './workflow-model'
import { dataLabel } from './SimpleDataEditor'
import { WorkflowDataViewer } from './WorkflowDataViewer'

const fieldLabel=(field:string)=>field.split('.').map(key=>key==='output'?'Hasil utama':dataLabel(key)).join(' · ')

export function NodeInputPanel({workflowId,node,nodes,edges,busy,onUpdate,onExecute}:{workflowId:string;node:StudioNode;nodes:StudioNode[];edges:Edge[];busy:boolean;onUpdate:(id:string,data:StudioNode['data'])=>void;onExecute:(id:string)=>void}) {
  const [history,setHistory]=useState<Record<string,NodeResult>>({})
  const live=Object.fromEntries(nodes.filter(item=>item.data.result).map(item=>[item.id,item.data.result!]))
  useEffect(()=>{
    const current=Object.fromEntries(nodes.filter(item=>item.data.result).map(item=>[item.id,item.data.result!]))
    if(Object.keys(current).length)setHistory(current)
  },[nodes])
  useEffect(()=>{
    let cancelled=false
    workflowRequest<{runs:RunItem[]}>(`/${workflowId}/runs`).then(({runs})=>{
      if(!cancelled)setHistory(previous=>Object.keys(previous).length?previous:runs[0]?.result?.nodeResults||{})
    }).catch(()=>{})
    return()=>{cancelled=true}
  },[workflowId])
  const incoming=edges.filter(edge=>edge.target===node.id&&!isAiConnection(edge))
  const sources=nodes.filter(item=>incoming.some(edge=>edge.source===item.id))
  const source=String(node.data.inputSource||'')
  const field=String(node.data.inputField||'')
  const chosen=sources.filter(item=>!source||item.id===source)
  const results:Record<string,Pick<NodeResult,'output'|'branches'>>=nodes.some(item=>item.data.result||item.data.running||item.data.status==='queued')?live:{...history}
  for(const item of sources){
    if(results[item.id])continue
    let output:DataItem[]=[]
    if(item.type==='promptTrigger'&&item.data.promptMode!=='ai')output=[{json:{prompt:String(item.data.prompt||''),originalPrompt:String(item.data.prompt||'')}}]
    if(item.type==='chatTrigger')output=[{json:{chatInput:String(item.data.chatInput||''),sessionId:String(item.data.sessionId||'test-session')}}]
    if(item.type==='trigger')try{const data=typeof item.data.sampleData==='string'?JSON.parse(item.data.sampleData):item.data.sampleData;if(data)output=Array.isArray(data)?data:[{json:data}]}catch{}
    if(output.length)results[item.id]={output}
  }
  let preview:DataItem[]=[],error=''
  try{
    preview=workflowNodeInput(node,edges,results).map(item=>{
      const value=workflowInput(item.json)
      return {json:value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{input:value}}
    })
  }catch(caught){error=caught instanceof Error?caught.message:'Input belum dapat dibaca.'}
  const options=sources.flatMap(item=>{
    const key=(path:string)=>JSON.stringify([item.id,path])
    const label=String(item.data.label||item.type)
    const values=workflowNodeInput({...node,data:{...node.data,inputSource:item.id,inputField:''}},edges,results)
    const fields=workflowInputFields(values)
    return [{value:key(''),label:label+' · Hasil utama'},...fields.map(path=>({value:key(path),label:label+' · '+(path==='output'?'Output':fieldLabel(path))}))]
  })
  const selection=source||field?JSON.stringify([source,field]):''
  if(selection&&!options.some(option=>option.value===selection))options.push({value:selection,label:(sources.find(item=>item.id===source)?.data.label||'Sumber tersimpan')+' · '+(field?fieldLabel(field):'Hasil utama')})
  if(isTrigger(node.type))return <><h3>Input</h3><p className="wf-muted">Bahan awal di tab Pengaturan.</p></>
  return <>
    <h3>Input</h3>
    <label className="wf-field"><select aria-label="Pilih input" disabled={busy||!sources.length} value={selection} onChange={event=>{
      const [inputSource,inputField]=event.target.value?JSON.parse(event.target.value):['','']
      onUpdate(node.id,{...node.data,inputSource,inputField})
    }}>
      <option value="">Otomatis</option>
      {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
    {error?<p className="wf-error" role="alert">{error}</p>:preview.length?<WorkflowDataViewer items={preview}/>:<p className="wf-muted">{sources.length?'Belum ada input. Uji sumber dahulu.':'Hubungkan node sebelumnya.'}</p>}
    {!preview.length&&chosen.length===1&&<button type="button" disabled={busy} onClick={()=>onExecute(chosen[0].id)}>Uji sumber</button>}
  </>
}
