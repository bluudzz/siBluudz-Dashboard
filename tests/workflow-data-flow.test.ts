import test from 'node:test'
import assert from 'node:assert/strict'
import { executeGraphAsync } from '../shared/workflow-engine.js'

const node=(id:string,type:string,data:Record<string,unknown>={})=>({id,type,position:{x:0,y:0},data:{label:id,...data}})
const edge=(source:string,target:string,sourceHandle?:string)=>({id:`${source}-${target}`,source,target,sourceHandle})
const trigger=node('trigger','promptTrigger',{prompt:'Ide awal'})
const agent=node('agent','aiAgent',{executionMode:'live'})
const model=node('model','chatModel',{model:'test-model'})
const modelEdge={id:'model-agent',source:'model',target:'agent',sourceHandle:'ai_languageModel',targetHandle:'ai_languageModel'}
const image=node('image','imageGenerate',{model:'test-image',result:{output:[{json:{prompt:'Hasil lama'}}]}})

test('automatic fields follow rewired paths, Set changes, branches, and each Split Out item',async()=>{
  const edit=node('edit','set',{fields:JSON.stringify({prompt:'Revisi terbaru'})})
  const route=node('route','if',{field:'prompt',operator:'equals',value:'Revisi terbaru'})
  const dead=node('dead','set',{fields:'{"prompt":"Cabang yang tidak dipilih"}'})
  const nodes=[trigger,agent,model,edit,route,dead,image]
  const run=async(edges:any[])=>executeGraphAsync(nodes,edges,undefined,async(context:any)=>{
    if(context.kind==='agent')return [{json:{...context.input[0].json,output:'Prompt hasil AI'}}]
    assert.equal(context.kind,'imageGenerate')
    return context.input.map((item:any)=>({json:{...item.json,imageUrl:'https://example.com/new.jpg',imagePrompt:item.json.output}}))
  })
  const direct=await run([edge('trigger','agent'),modelEdge,edge('agent','image')])
  assert.equal(direct.nodeResults.image.input[0].json.prompt,'Prompt hasil AI')
  assert.equal(direct.nodeResults.image.input[0].json.output,'Prompt hasil AI')
  const rerouted=await run([edge('trigger','agent'),modelEdge,edge('agent','edit'),edge('edit','route'),edge('route','image','true'),edge('route','dead','false'),edge('dead','image')])
  assert.equal(rerouted.status,'completed')
  assert.equal(rerouted.nodeResults.dead.status,'skipped')
  assert.equal(rerouted.nodeResults.image.input.length,1)
  assert.equal(rerouted.nodeResults.image.input[0].json.output,'Revisi terbaru')
  assert.deepEqual(rerouted.nodeResults.image.output[0].json.output,{imageUrl:'https://example.com/new.jpg',imagePrompt:'Revisi terbaru'})
  const split=node('split','splitOut',{splitCount:2})
  const splitRun=await executeGraphAsync([trigger,agent,model,split,image],[edge('trigger','agent'),modelEdge,edge('agent','split'),edge('split','image')],undefined,async(context:any)=>{
    if(context.kind==='agent')return [{json:{...context.input[0].json,output:JSON.stringify({prompts:[{prompt:'Slide satu'},{prompt:'Slide dua'}]})}}]
    assert.deepEqual(context.input.map((item:any)=>item.json.output),['Slide satu','Slide dua'])
    return context.input.map((item:any)=>({json:{...item.json,imageUrl:'https://example.com/'+item.json.splitIndex+'.jpg'}}))
  })
  assert.equal(splitRun.status,'completed')
})

test('research and API results replace inherited output instead of repeating the original topic',async()=>{
  for(const type of ['searchContent','httpRequest']){
    const research=node('research',type)
    const inspect=node('inspect','imageGenerate')
    const result=await executeGraphAsync([trigger,research,inspect],[edge('trigger','research'),edge('research','inspect')],undefined,async(context:any)=>{
      if(context.node.id==='research')return [{json:{...context.input[0].json,output:'Hasil lama',content:'Isi sumber terbaru',researchMode:'url',pages:[{content:'Isi sumber terbaru'}]}}]
      assert.equal(context.input[0].json.output,'Isi sumber terbaru')
      return []
    })
    assert.equal(result.status,'completed')
  }
})
