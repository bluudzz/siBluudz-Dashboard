import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraphAsync, workflowNodeInput, workflowInputNode } from '../shared/workflow-engine.js'

const node=(id:string,type:string,data:Record<string,unknown>={})=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const edge=(source:string,target:string,sourceHandle?:string)=>({id:source+'-'+target,source,target,sourceHandle})
const result=(output:any[],branches?:Record<string,any[]>)=>({output,branches})

test('input preview and execution share field selection and follow connected sources',async()=>{
  const a=node('a','trigger',{sampleData:{prompt:'Main A',alternate:'Selected A'}})
  const b=node('b','trigger',{sampleData:{prompt:'Main B',alternate:'Selected B'}})
  const image=node('image','imageGenerate',{inputSource:'b',inputField:'alternate',prompt:'Manual prompt'})
  const edges=[edge('a','image'),edge('b','image')]
  const snapshots={a:result([{json:a.data.sampleData}]),b:result([{json:b.data.sampleData}])}
  const preview=workflowNodeInput(image,edges,snapshots)
  assert.equal(preview.length,1)
  assert.equal(preview[0].json.output,'Selected B')
  assert.equal(workflowInputNode(image).data.prompt,'')
  assert.equal(image.data.prompt,'Manual prompt')
  let calls=0
  const run=await executeGraphAsync([a,b,image],edges,undefined,async(context:any)=>{
    calls++
    assert.deepEqual(context.input,preview)
    assert.equal(context.node.data.prompt,'')
    return [{json:{imageUrl:'https://example.com/new.jpg'}}]
  })
  assert.equal(calls,1)
  assert.equal(run.status,'completed')
  assert.deepEqual(run.nodeResults.image.input,preview)
  const auto={...image,data:{inputSource:'',inputField:''}}
  assert.deepEqual(workflowNodeInput(auto,[edge('a','image')],snapshots),snapshots.a.output)
  assert.deepEqual(workflowNodeInput(auto,[edge('b','image')],snapshots),snapshots.b.output)
})

test('selection preserves branch routing and never substitutes missing or unsafe fields',()=>{
  const target=node('image','imageGenerate',{inputField:'output.prompt'})
  const items=[{json:{output:{prompt:'Selected prompt'},originalPrompt:'Old prompt'}}]
  assert.equal(workflowNodeInput(target,[edge('condition','image','true')],{condition:result([], {true:items,false:[]})})[0].json.output,'Selected prompt')
  assert.deepEqual(workflowNodeInput(target,[edge('condition','image','false')],{condition:result([], {true:items,false:[]})}),[])
  for(const inputField of ['missing','__proto__.value','constructor']){
    assert.throws(()=>workflowNodeInput({...target,data:{inputField}},[edge('condition','image')],{condition:result(items)}),/Field|input/i)
  }
  assert.throws(()=>workflowNodeInput({...target,data:{inputSource:'removed'}},[edge('condition','image')],{}),/Sumber input/)
  assert.throws(()=>workflowNodeInput({...target,data:{inputField:'__proto__.value'}},[edge('condition','image')],{}),/Field input/)
})

test('input selection projects compatible values into node-specific operations',()=>{
  for(const [type,data,key] of [
    ['searchContent',{sourceMode:'url'},'url'], ['httpRequest',{},'url'],
    ['googleDrive',{operation:'shared'},'sharedLink'], ['googleDrive',{operation:'download'},'fileId'],
    ['instagram',{operation:'publish'},'imageUrl'], ['instagram',{operation:'reels'},'videoUrl'],
    ['if',{},'field'],
  ] as const){
    const target=node('target',type,{...data,inputField:'selected'})
    const value=workflowInputNode(target)
    assert.equal(value.data[key],type==='if'?'output':'{{ $json.output }}')
  }
})
