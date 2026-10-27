import type { Edge } from '@xyflow/react'
import type { StudioNode } from './workflow-model'

const editable:Record<string,string[]>={
  trigger:['label','triggerMode','sampleData','cron','interval'],
  promptTrigger:['label','prompt','promptMode','model'],
  chatTrigger:['label','chatInput','sessionId'],
  chatModel:['label','temperature'],
  memory:['label','sessionKey','windowSize'],
  tool:['label','toolType','description','content'],
  set:['label','fields','keepInput'],
  if:['label','field','operator','value'],
  aiAgent:['label','role','aiPrompt','systemMessage','maxIterations'],
}
const booleans=new Set(['keepInput'])
const choices:Record<string,string[]>={temperature:['0','0.2','0.7','1'],windowSize:['1','5','10','20'],toolType:['knowledge','textLength'],maxIterations:['1','2','3','4','5'],triggerMode:['manual','schedule'],promptMode:['normal','ai'],operator:['equals','contains','exists']}
const secret=/password|secret|token|api.?key|credential|authorization|cookie/i
function safe(value:unknown,depth=0):unknown {
  if(depth>3)return '[data disingkat]'
  if(typeof value==='string')return value.slice(0,1200)
  if(Array.isArray(value))return value.slice(0,2).map(item=>safe(item,depth+1))
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!secret.test(key)).slice(0,20).map(([key,item])=>[key,safe(item,depth+1)]))
  return value
}
export function assistantContext(node:StudioNode,nodes:StudioNode[],edges:Edge[],workflowName:string) {
  const allowed=editable[node.type||'aiAgent']||editable.aiAgent
  const config=Object.fromEntries(allowed.map(key=>[key,node.data[key]]).filter(([,value])=>value!==undefined))
  const neighbors=edges.filter(edge=>edge.source===node.id||edge.target===node.id).slice(0,8).map(edge=>({direction:edge.target===node.id?'input':'output',node:nodes.find(item=>item.id===(edge.target===node.id?edge.source:edge.target))?.data.label||'Node'}))
  return {workflow:workflowName.slice(0,120),nodeType:node.type||'aiAgent',executionMode:node.data.executionMode||'preview',config:safe(config),neighbors,allowedChanges:allowed,inputSample:safe(node.data.result?.input?.[0]?.json),outputSample:safe(node.data.result?.output?.[0]?.json),limitations:'AI Agent live memakai sub-node Chat Model 9router, Memory dan Tool opsional. Tool yang tersedia: knowledge dan textLength.'}
}
export type AssistantSuggestion={summary:string;reason:string;changes:Record<string,string|boolean>;nextStep:string}
export function parseAssistantSuggestion(reply:string,nodeType:string):AssistantSuggestion {
  let parsed:unknown
  try { parsed=JSON.parse(reply.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')) }
  catch { throw new Error('AI belum memberi format saran yang dapat diterapkan. Coba minta saran lagi dengan instruksi lebih spesifik.') }
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Format saran AI tidak valid.')
  const value=parsed as Record<string,unknown>
  const proposed=value.changes
  if(!proposed||typeof proposed!=='object'||Array.isArray(proposed))throw new Error('AI belum memberi perubahan konfigurasi yang valid.')
  const allowed=new Set(editable[nodeType]||editable.aiAgent)
  const changes:Record<string,string|boolean>={}
  for(const [key,item] of Object.entries(proposed)){
    if(!allowed.has(key))continue
    if(booleans.has(key)){if(typeof item==='boolean')changes[key]=item;continue}
    if(typeof item!=='string'||item.length>8000)continue
    if(choices[key]&&!choices[key].includes(item))continue
    if((key==='fields'||key==='sampleData')){
      try { const json=JSON.parse(item);if(!json||typeof json!=='object'||Array.isArray(json)&&key==='fields')continue }
      catch { continue }
    }
    changes[key]=item
  }
  return {summary:String(value.summary||'Saran konfigurasi').slice(0,1000),reason:String(value.reason||'').slice(0,1600),changes,nextStep:String(value.nextStep||'').slice(0,1000)}
}
