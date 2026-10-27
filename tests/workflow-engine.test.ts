import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraph, executeGraphAsync, resolveValue, validateGraph } from '../shared/workflow-engine.js'
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
test('split out turns structured AI prompts into separate workflow items',()=>{
  const source=node('source','trigger',{sampleData:JSON.stringify({topic:'Konten'})})
  const agent=node('agent','aiAgent',{pinnedOutput:[{json:{output:JSON.stringify({prompts:[{slide:1,prompt:'Hook'},{slide:2,prompt:'Value'}]})}}]})
  const split=node('split','splitOut',{splitCount:'2'})
  const result=executeGraph([source,agent,split],[edge('source','agent'),edge('agent','split')])
  assert.equal(result.status,'completed')
  assert.deepEqual(result.nodeResults.split.output.map(item=>item.json.prompt),['Hook','Value'])
  assert.deepEqual(result.nodeResults.split.output.map(item=>item.json.splitIndex),[1,2])
})
test('split out rejects non-agent inputs and mismatched counts',()=>{
  const source=node('source','trigger',{sampleData:JSON.stringify({output:JSON.stringify({prompts:[{prompt:'Only one'}]})})})
  const split=node('split','splitOut',{splitCount:'2'})
  assert.ok(validateGraph([source,split],[edge('source','split')]).some(error=>error.includes('hanya boleh menerima output langsung dari AI Agent')))
  const agent=node('agent','aiAgent',{pinnedOutput:[{json:{output:JSON.stringify({prompts:[{prompt:'Only one'}]})}}]})
  const result=executeGraph([source,agent,split],[edge('source','agent'),edge('agent','split')])
  assert.equal(result.nodeResults.split.status,'error')
  assert.match(result.nodeResults.split.error||'',/meminta 2 output/)
})
test('async graph reports one active node at a time',async()=>{
  const events:string[]=[]
  const result=await executeGraphAsync([trigger,node('next','set',{fields:'{"done":true}'})],[edge('start','next')],undefined,async()=>[],progress=>events.push(progress.phase+':'+progress.nodeId))
  assert.equal(result.status,'completed')
  assert.deepEqual(events,['start:start','complete:start','start:next','complete:next'])
})
test('empty branches and disconnected nodes stay skipped',()=>{
  const result=executeGraph([trigger,node('if','if',{field:'topic',value:'missing'}),node('yes','set'),node('orphan','set')],[edge('start','if'),edge('if','yes','true')])
  assert.equal(result.nodeResults.yes.status,'skipped')
  assert.equal(result.nodeResults.orphan.status,'skipped')
  assert.deepEqual(result.nodeResults.orphan.output,[])
})
test('failed node stops execution; downstream nodes never become successful',()=>{
  const result=executeGraph([trigger,node('bad','set',{fields:'invalid JSON'}),node('next','set')],[edge('start','bad'),edge('bad','next')])
  assert.equal(result.status,'error')
  assert.equal(result.nodeResults.bad.status,'error')
  assert.equal(result.nodeResults.next.status,'skipped')
})
test('partial execution runs ancestors and excludes downstream nodes',()=>{
  const result=executeGraph([trigger,node('set','set',{fields:'{"title":"{{ $json.topic }}"}'}),node('next','set')],[edge('start','set'),edge('set','next')],'set')
  assert.equal(result.nodeResults.set.input.length,2)
  assert.equal(result.nodeResults.set.output[0].json.title,'Roblox')
  assert.equal(result.nodeResults.next,undefined)
  assert.throws(()=>executeGraph([trigger,node('orphan','set')],[],'orphan'))
})
test('pinned data and disabled nodes pass data through deliberately',()=>{
  const result=executeGraph([trigger,node('pin','set',{pinnedOutput:[{json:{pinned:true}}]}),node('disabled','set',{disabled:true,fields:'bad'})],[edge('start','pin'),edge('pin','disabled')])
  assert.equal(result.nodeResults.pin.status,'pinned')
  assert.deepEqual(result.nodeResults.disabled.output,[{json:{pinned:true}}])
})
test('manual approval holds only its downstream branch and replays the reviewed snapshot',()=>{
  const source=node('source','trigger',{sampleData:'{"topic":"Draft A"}'})
  const gate=node('gate','approval',{approvedItems:null})
  const publish=node('after','set',{fields:'{"stage":"ready"}'})
  const parallel=node('parallel','set',{fields:'{"stage":"independent"}'})
  const connections=[edge('source','gate'),edge('gate','after'),edge('source','parallel')]
  const waiting=executeGraph([source,gate,publish,parallel],connections)
  assert.equal(waiting.status,'waiting_approval')
  assert.equal(waiting.nodeResults.gate.status,'waiting')
  assert.equal(waiting.nodeResults.after.status,'skipped')
  assert.equal(waiting.nodeResults.parallel.status,'success')
  const approved=node('gate','approval',{approvedItems:waiting.nodeResults.gate.input})
  const changedSource=node('source','trigger',{sampleData:'{"topic":"Draft B"}'})
  const resumed=executeGraph([changedSource,approved,publish,parallel],connections)
  assert.equal(resumed.status,'completed')
  assert.deepEqual(resumed.nodeResults.after.output,[{json:{topic:'Draft A',stage:'ready'}}])
})
test('integration previews never claim to publish, execute scripts, or invoke a model',()=>{
  const nodes=[trigger,node('ai','aiAgent',{aiPrompt:'Sujet: {{ $json.topic }}'}),node('next','set',{fields:'{"reviewStatus":"ready"}'})]
  const result=executeGraph(nodes,[edge('start','ai'),edge('ai','next')])
  assert.equal(result.nodeResults.ai.status,'simulated')
  assert.equal(result.nodeResults.next.status,'success')
  assert.equal(result.mode,'simulation')
})
test('unsupported legacy integration nodes are rejected',()=>{
  assert.ok(validateGraph([trigger,node('publisher','publisher',{})],[]).some(error=>error.includes('publisher')))
})
