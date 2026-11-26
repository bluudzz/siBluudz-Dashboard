import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowNodeImages } from '../src/features/automation/workflow-model.ts'

test('generated node thumbnails appear only for completed image results',()=>{
  const output=[{json:{imagePreviewUrl:'/api/workflow-media/image-1'}},{json:{imageUrl:'https://example.com/image.jpg'}},{json:{imageUrl:'javascript:alert(1)'}}]
  const data={label:'Images',result:{nodeId:'image',label:'Images',status:'success' as const,input:[],output,durationMs:1}}
  assert.deepEqual(workflowNodeImages({type:'imageGenerate',data}),['/api/workflow-media/image-1','https://example.com/image.jpg'])
  assert.deepEqual(workflowNodeImages({type:'imageGenerate',data:{...data,result:{...data.result,status:'error'}}}),[])
  assert.deepEqual(workflowNodeImages({type:'aiAgent',data}),[])
  assert.deepEqual(workflowNodeImages({type:'imageGenerate',data:{label:'No result'}}),[])
})
