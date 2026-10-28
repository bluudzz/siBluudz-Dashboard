import test from 'node:test'
import assert from 'node:assert/strict'
import { applyWorkflowOperations } from '../shared/workflow-assistant.js'

test('assistant builds a connected workflow and adds a model to AI Agent',()=>{
  const result=applyWorkflowOperations([],[],[
    {op:'addNode',ref:'start',type:'promptTrigger',config:{prompt:'Riset konten Instagram'}},
    {op:'addNode',ref:'search',type:'searchContent',after:'start',config:{label:'Cari & Baca',sourceMode:'search',query:'Riset konten Instagram'}},
    {op:'addNode',ref:'research',type:'aiAgent',after:'search',config:{label:'Riset',aiPrompt:'Analisis sumber yang sudah dibaca'}},
  ],{defaultModel:'ag/gemini-3.8-flash'})
  assert.deepEqual(result.nodes.map(node=>node.type),['promptTrigger','searchContent','aiAgent','chatModel'])
  assert.equal(result.edges.length,3)
  assert.equal(result.nodes.find(node=>node.type==='chatModel')?.data.model,'ag/gemini-3.8-flash')
})

test('assistant cannot add hidden legacy Tool or HTTP nodes',()=>{
  for(const type of ['tool','httpRequest'])assert.throws(()=>applyWorkflowOperations([],[],[{op:'addNode',ref:'legacy',type}]),/tidak tersedia untuk Asisten Workflow/)
  const oldTool={id:'old-tool',type:'tool',position:{x:0,y:0},data:{label:'Old Tool',toolType:'knowledge'}}
  const agent={id:'agent',type:'aiAgent',position:{x:300,y:0},data:{label:'Agent'}}
  assert.throws(()=>applyWorkflowOperations([oldTool,agent],[],[{op:'connect',from:'old-tool',to:'agent'}]),/tidak dapat memakai node lama/)
  assert.throws(()=>applyWorkflowOperations([oldTool],[],[{op:'updateNode',id:'old-tool',config:{label:'Use me'}}]),/tidak dapat mengatur node lama/)
})

test('assistant cannot replace saved accounts or approval state',()=>{
  const node={id:'ig',type:'instagram',position:{x:0,y:0},data:{label:'Instagram',accountId:'saved-account',approvedItems:['ok'],caption:'Old'}}
  const result=applyWorkflowOperations([node],[],[{op:'updateNode',id:'ig',config:{accountId:'other',approvedItems:[],caption:'New'}}])
  assert.equal(result.nodes[0].data.accountId,'saved-account')
  assert.deepEqual(result.nodes[0].data.approvedItems,['ok'])
  assert.equal(result.nodes[0].data.caption,'New')
})

test('assistant rejects an invalid connection before changing the editor',()=>{
  const nodes=[{id:'a',type:'trigger',position:{x:0,y:0},data:{label:'Start',sampleData:'{}'}},{id:'b',type:'set',position:{x:300,y:0},data:{label:'Data',fields:'{}'}}]
  assert.throws(()=>applyWorkflowOperations(nodes,[],[{op:'connect',from:'b',to:'a'}]),/Trigger tidak boleh menerima koneksi/)
  assert.equal(nodes.length,2)
})
