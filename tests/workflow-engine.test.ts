import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraph, resolveValue, validateGraph } from '../shared/workflow-engine.js'
import type { WorkflowNode, WorkflowEdge } from '../shared/workflow-engine.js'

const node=(id:string,type:string,data:Record<string,unknown>={}):WorkflowNode=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const edge=(source:string,target:string,sourceHandle?:string):WorkflowEdge=>({id:source+'-'+target+(sourceHandle||''),source,target,sourceHandle})
const trigger=node('start','trigger',{sampleData:'[{"json":{"topic":"Roblox","approved":true}},{"json":{"topic":"Fisch","approved":false}}]'})

test('validates malformed graphs, duplicates, dangling nodes, illegal trigger inputs and cycles',()=>{
  assert.ok(validateGraph([null],[]).length)
  assert.ok(validateGraph([trigger,trigger],[]).length)
  assert.ok(validateGraph([trigger],[edge('start','missing')]).length)
  assert.ok(validateGraph([trigger,node('a','set')],[edge('a','start')]).length)
  assert.ok(validateGraph([node('a','set'),node('b','set')],[edge('a','b'),edge('b','a')]).some(e=>e.includes('melingkar')))
  assert.ok(validateGraph([node('a','if')],[],true).length)
})
test('preserves typed expressions, resolves nested fields and rejects missing or arbitrary expressions',()=>{
  assert.equal(resolveValue('{{ $json.approved }}',{approved:true}),true)
  assert.equal(resolveValue('Judul: {{ $json.nested.name }}',{nested:{name:'Roblox'}}),'Judul: Roblox')
  assert.throws(()=>resolveValue('{{ $json.missing }}',{}))
  assert.throws(()=>resolveValue('{{ process.env.SECRET }}',{}))
  assert.throws(()=>resolveValue('{{ $json.constructor }}',{}))
})
test('IF routes individual items to true and false without mixing branches',()=>{
  const nodes=[trigger,node('condition','if',{field:'approved',operator:'equals',value:'true'}),node('yes','set',{fields:'{"route":"approved"}'}),node('no','set',{fields:'{"route":"review"}'})]
  const result=executeGraph(nodes,[edge('start','condition'),edge('condition','yes','true'),edge('condition','no','false')])
  assert.equal(result.status,'completed')
  assert.deepEqual(result.nodeResults.yes.output,[{json:{topic:'Roblox',approved:true,route:'approved'}}])
  assert.deepEqual(result.nodeResults.no.output,[{json:{topic:'Fisch',approved:false,route:'review'}}])
})
test('empty branches and disconnected nodes stay skipped',()=>{
  const result=executeGraph([trigger,node('if','if',{field:'topic',value:'missing'}),node('yes','set'),node('orphan','set')],[edge('start','if'),edge('if','yes','true')])
  assert.equal(result.nodeResults.yes.status,'skipped')
  assert.equal(result.nodeResults.orphan.status,'skipped')
  assert.deepEqual(result.nodeResults.orphan.output,[])
})
test('failed node stops execution; downstream nodes never become successful',()=>{
  const result=executeGraph([trigger,node('bad','set',{fields:'invalid JSON'}),node('publish','publisher')],[edge('start','bad'),edge('bad','publish')])
  assert.equal(result.status,'error')
  assert.equal(result.nodeResults.bad.status,'error')
  assert.equal(result.nodeResults.publish.status,'skipped')
})
test('partial execution runs ancestors and excludes downstream nodes',()=>{
  const result=executeGraph([trigger,node('set','set',{fields:'{"title":"{{ $json.topic }}"}'}),node('publish','publisher')],[edge('start','set'),edge('set','publish')],'set')
  assert.equal(result.nodeResults.set.input.length,2)
  assert.equal(result.nodeResults.set.output[0].json.title,'Roblox')
  assert.equal(result.nodeResults.publish,undefined)
  assert.throws(()=>executeGraph([trigger,node('orphan','set')],[],'orphan'))
})
test('pinned data and disabled nodes pass data through deliberately',()=>{
  const result=executeGraph([trigger,node('pin','set',{pinnedOutput:[{json:{pinned:true}}]}),node('disabled','set',{disabled:true,fields:'bad'})],[edge('start','pin'),edge('pin','disabled')])
  assert.equal(result.nodeResults.pin.status,'pinned')
  assert.deepEqual(result.nodeResults.disabled.output,[{json:{pinned:true}}])
})
test('integration previews never claim to publish, execute scripts, or invoke a model',()=>{
  const nodes=[trigger,node('ai','aiAgent',{aiPrompt:'Sujet: {{ $json.topic }}'}),node('code','code'),node('publisher','publisher')]
  const result=executeGraph(nodes,[edge('start','ai'),edge('ai','code'),edge('code','publisher')])
  for(const id of ['ai','code','publisher'])assert.equal(result.nodeResults[id].status,'simulated')
  assert.equal((result.nodeResults.publisher.output[0].json.preview as {status:string}).status,'not_published')
  assert.equal(result.mode,'simulation')
})
