import test from 'node:test'
import assert from 'node:assert/strict'
import { selectWorkflowAssistantModel } from '../shared/workflow-assistant-model.js'

test('assistant uses selected 9router model or configured default',()=>{
  const catalog=[{id:'ag/fast'},{id:'ag/smart',imageOutput:false}]
  assert.equal(selectWorkflowAssistantModel('', 'ag/fast', catalog),'ag/fast')
  assert.equal(selectWorkflowAssistantModel('ag/smart','ag/fast',catalog),'ag/smart')
})

test('assistant rejects unknown and image-only models',()=>{
  const catalog=[{id:'ag/image',imageOutput:true}]
  assert.throws(()=>selectWorkflowAssistantModel('other/model','ag/fast',catalog),/tidak ada/)
  assert.throws(()=>selectWorkflowAssistantModel('ag/image','ag/fast',catalog),/tidak ada/)
})
