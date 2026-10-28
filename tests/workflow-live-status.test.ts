import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraphAsync } from '../shared/workflow-engine.js'
import type { WorkflowNode, WorkflowEdge } from '../shared/workflow-engine.js'

const node=(id:string,type:string,data:Record<string,unknown>={}):WorkflowNode=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const edge=(source:string,target:string):WorkflowEdge=>({id:source+'-'+target,source,target})

test('progress events let the editor mark queued, running and finished nodes',async()=>{
  const start=node('start','trigger',{sampleData:'{"topic":"Roblox"}'})
  const transform=node('transform','set',{fields:'{"topic":"Roblox"}'})
  const statuses:Record<string,string>={}
  let active=''
  await executeGraphAsync([start,transform],[edge('start','transform')],undefined,async()=>[],progress=>{
    if(progress.phase==='start'){active=progress.nodeId;statuses[progress.nodeId]='running'}
    else{statuses[progress.nodeId]=progress.status||'success';active=''}
  })
  assert.deepEqual(statuses,{start:'success',transform:'success'})
  assert.equal(active,'')
})

test('a failing node is reported as error while earlier nodes stay success',async()=>{
  const start=node('start','trigger',{sampleData:'{"topic":"Roblox"}'})
  const broken=node('broken','set',{fields:'not json'})
  const after=node('after','set',{fields:'{"ok":true}'})
  const statuses:Record<string,string>={}
  const result=await executeGraphAsync([start,broken,after],[edge('start','broken'),edge('broken','after')],undefined,async()=>[],progress=>{
    if(progress.phase==='complete')statuses[progress.nodeId]=progress.status||'success'
  })
  assert.equal(result.status,'error')
  assert.equal(statuses.start,'success')
  assert.equal(statuses.broken,'error')
  assert.equal(statuses.after,'skipped')
})
