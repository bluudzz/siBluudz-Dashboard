import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectWorkflow } from '../shared/workflow-readiness.js'
import type { WorkflowNode, WorkflowEdge } from '../shared/workflow-engine.js'

const node=(id:string,type:string,data:Record<string,unknown>={}):WorkflowNode=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const edge=(source:string,target:string,handle?:string):WorkflowEdge=>({id:source+'-'+target,source,target,...(handle?{sourceHandle:handle,targetHandle:handle}:{})})
const trigger=node('start','trigger',{sampleData:'{"topic":"Konten"}'})
const agent=node('agent','aiAgent',{executionMode:'live'})
const model=node('model','chatModel',{model:'test-model'})
const modelEdge=edge('model','agent','ai_languageModel')

test('identifies the exact missing model and allows incomplete drafts to remain editable',()=>{
  assert.equal(inspectWorkflow([trigger,agent],[edge('start','agent')])[0].nodeId,'agent')
  const issues=inspectWorkflow([trigger,agent,node('model','chatModel')],[edge('start','agent'),modelEdge])
  assert.equal(issues[0].nodeId,'model')
  assert.equal(issues[0].code,'model-selection')
  assert.deepEqual(inspectWorkflow([trigger,agent,model],[edge('start','agent'),modelEdge]),[])
})

test('partial execution ignores unfinished downstream configuration but checks its own ancestors',()=>{
  const nodes=[trigger,node('data','set',{fields:'{"ready":true}'}),agent]
  const edges=[edge('start','data'),edge('data','agent')]
  assert.ok(inspectWorkflow(nodes,edges).some(issue=>issue.code==='model'))
  assert.deepEqual(inspectWorkflow(nodes,edges,'data'),[])
  assert.ok(inspectWorkflow(nodes,edges,'agent').some(issue=>issue.code==='model'))
  assert.ok(inspectWorkflow(nodes,edges,'missing').some(issue=>issue.code==='target'))
})

test('invalid data is caught before execution and disabled or pinned nodes do not require a model',()=>{
  assert.ok(inspectWorkflow([node('start','trigger',{sampleData:'invalid'})],[]).some(issue=>issue.code==='data'))
  assert.ok(inspectWorkflow([trigger,node('data','set',{fields:'[]'})],[edge('start','data')]).some(issue=>issue.code==='data'))
  for(const data of [{disabled:true},{pinnedOutput:[{json:{output:'Saved'}}]}]){
    const issues=inspectWorkflow([trigger,{...agent,data:{...agent.data,...data}}],[edge('start','agent')])
    assert.equal(issues.filter(issue=>issue.severity==='error').length,0)
  }
})

test('disconnected nodes and preview agents are visible warnings rather than fake success',()=>{
  const issues=inspectWorkflow([trigger,node('orphan','aiAgent',{executionMode:'live'}),node('preview','aiAgent')],[edge('start','preview')])
  assert.ok(issues.some(issue=>issue.code==='disconnected'&&issue.nodeId==='orphan'))
  assert.ok(issues.some(issue=>issue.code==='preview'&&issue.nodeId==='preview'))
  assert.equal(issues.filter(issue=>issue.severity==='error').length,0)
})

test('connected tool configuration is checked only for agents that will run',()=>{
  const tool=node('tool','tool',{toolType:'unsupported'})
  const edges=[edge('start','agent'),modelEdge,edge('tool','agent','ai_tool')]
  const issues=inspectWorkflow([trigger,agent,model,tool],edges)
  assert.ok(issues.some(issue=>issue.code==='tool'&&issue.nodeId==='tool'))
  assert.deepEqual(inspectWorkflow([trigger,agent,model,tool],edges,'start'),[])
})
