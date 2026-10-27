import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraphAsync, validateGraph } from '../shared/workflow-engine.js'
import { runWorkflowAgent } from '../shared/workflow-agent.js'
import { agentResources } from '../shared/workflow-connections.js'
import { OpenAIChatCompletionsModel } from '@openai/agents'

const createTestModel=(complete:(request:any)=>Promise<any>)=>new OpenAIChatCompletionsModel({baseURL:'http://test.invalid',chat:{completions:{create:complete}}} as never,'test-model')

const node=(id:string,type:string,data:Record<string,unknown>)=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const nodes=[node('chat','chatTrigger',{chatInput:'Halo',sessionId:'session-a'}),node('agent','aiAgent',{executionMode:'live',aiPrompt:'{{ $json.chatInput }}'}),node('model','chatModel',{model:'test-model'}),node('memory','memory',{sessionKey:'{{ $json.sessionId }}',windowSize:'1'}),node('tool','tool',{toolType:'textLength',description:'Hitung teks'})]
const edges=[{id:'main',source:'chat',target:'agent'},...['model','memory','tool'].map((id,index)=>({id,source:id,target:'agent',sourceHandle:['ai_languageModel','ai_memory','ai_tool'][index],targetHandle:['ai_languageModel','ai_memory','ai_tool'][index]}))]

test('typed AI connections reject mismatched ports, duplicate models and normal data into sub-nodes',()=>{
  assert.deepEqual(validateGraph(nodes,edges),[])
  assert.ok(validateGraph(nodes,[...edges,{id:'bad',source:'agent',target:'memory'}]).length)
  assert.ok(validateGraph(nodes,edges.map(edge=>edge.id==='model'?{...edge,targetHandle:'ai_tool'}:edge)).length)
  assert.ok(validateGraph([...nodes,node('model2','chatModel',{})],[...edges,{id:'extra',source:'model2',target:'agent',sourceHandle:'ai_languageModel',targetHandle:'ai_languageModel'}]).length)
})
test('live graph calls the agent with chat input, while resource nodes stay outside the item stream',async()=>{
  let calls=0
  const result=await executeGraphAsync(nodes,edges,'agent',async(context:any)=>{
    calls++
    assert.equal(context.resources.model.id,'model')
    assert.deepEqual(context.input,[{json:{chatInput:'Halo',sessionId:'session-a'}}])
    return [{json:{output:'Hai'}}]
  })
  assert.equal(calls,1)
  assert.equal(result.mode,'live')
  assert.equal(result.nodeResults.agent.output[0].json.output,'Hai')
  assert.equal(result.nodeResults.model,undefined)
})
test('agent runs only connected tools and stores a bounded session history after a successful answer',async()=>{
  let count=0
  let saved:any
  const output=await runWorkflowAgent({node:nodes[1],input:[{json:{chatInput:'Hitung Halo',sessionId:'session-a'}}],resources:agentResources('agent',nodes,edges),loadMemory:()=>[{role:'user',content:'Sebelumnya'},{role:'assistant',content:'Jawaban lama'}],saveMemory:(id:string,session:string,messages:any)=>{saved={id,session,messages}},createModel:()=>createTestModel(async(request:any)=>{
    count++
    if(count===1){assert.ok(request.messages.some((message:any)=>message.content==='Sebelumnya'));return {choices:[{message:{tool_calls:[{id:'call-1',type:'function',function:{name:'workflow_tool_0',arguments:'{"text":"Halo"}'}}]}}]}}
    assert.deepEqual(JSON.parse(request.messages.at(-1).content),{characters:4,words:1})
    return {choices:[{message:{content:'4 karakter'}}]}
  })})
  assert.equal(count,2)
  assert.equal(output[0].json.output,'4 karakter')
  assert.equal(output[0].json.agentRun.runtime,'openai-agents-sdk')
  assert.equal(saved.session,'session-a')
  assert.equal(saved.messages.length,2)
})
test('SDK agent can answer without tools and rejects unknown tool calls',async()=>{
  const resources=agentResources('agent',nodes,edges)
  const output=await runWorkflowAgent({node:nodes[1],input:[{json:{chatInput:'Halo'}}],resources:{...resources,memory:undefined,tools:[]},createModel:()=>createTestModel(async()=>({choices:[{message:{role:'assistant',content:'Hai'}}]}))})
  assert.equal(output[0].json.output,'Hai')
  await assert.rejects(()=>runWorkflowAgent({node:nodes[1],input:[{json:{chatInput:'Halo'}}],resources:{...resources,memory:undefined},createModel:()=>createTestModel(async()=>({choices:[{message:{role:'assistant',tool_calls:[{id:'bad',type:'function',function:{name:'unconnected_tool',arguments:'{}'}}]}}]}))}))
})
test('manual input can run legacy chat prompt without chatInput field',async()=>{
  const legacyNode=node('manual-agent','aiAgent',{executionMode:'live',aiPrompt:'{{ $json.chatInput }}'})
  const output=await runWorkflowAgent({node:legacyNode,input:[{json:{topic:'Kopi susu',approved:true}}],resources:{model:nodes[2],memory:undefined,tools:[]},createModel:()=>createTestModel(async(request:any)=>{
    assert.match(String(request.messages.at(-1).content),/Kopi susu/)
    return {choices:[{message:{role:'assistant',content:'Data berhasil diproses'}}]}
  })})
  assert.equal(output[0].json.output,'Data berhasil diproses')
})
test('agent receives the requested Split Out count automatically',async()=>{
  let sawInstruction=false
  const splitAgent=node('split-agent','aiAgent',{executionMode:'live',aiPrompt:'Buat prompt gambar',splitOutCount:2})
  await runWorkflowAgent({node:splitAgent,input:[{json:{topic:'Kopi'}}],resources:{model:nodes[2],memory:undefined,tools:[]},createModel:()=>createTestModel(async(request:any)=>{
    sawInstruction=request.messages.some((message:any)=>String(message.content).includes('tepat 2 prompt'))
    return {choices:[{message:{role:'assistant',content:'{"prompts":[{"slide":1,"prompt":"A"},{"slide":2,"prompt":"B"}]}'}}]}
  })})
  assert.equal(sawInstruction,true)
})
test('provider failure stops downstream nodes and missing model fails before any request',async()=>{
  const result=await executeGraphAsync([...nodes,node('next','set',{})],[...edges,{id:'next',source:'agent',target:'next'}],undefined,async()=>{throw new Error('Provider unavailable')})
  assert.equal(result.nodeResults.agent.status,'error')
  assert.equal(result.nodeResults.next.status,'skipped')
  const missing=await executeGraphAsync(nodes,edges.filter(edge=>edge.id!=='model'),undefined,async()=>{throw new Error('Must not be called')})
  assert.match(missing.nodeResults.agent.error||'',/Chat Model/)
})
