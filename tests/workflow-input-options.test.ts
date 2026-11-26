import test from 'node:test'
import assert from 'node:assert/strict'
import { workflowInputFields } from '../src/features/automation/workflow-model.ts'

test('input choices hide technical metadata and duplicate content',()=>{
  const fields=workflowInputFields([{json:{prompt:'Latest prompt',output:'Latest prompt',originalPrompt:'Original request',agentModel:'test-model',model:'test-model',toolSteps:[],agentRun:{runtime:'sdk',requests:1,inputTokens:12,outputTokens:4}}}])
  assert.deepEqual(fields,['originalPrompt'])
  assert.deepEqual(workflowInputFields([{json:{prompt:'Same',output:'Same',originalPrompt:'Same'}}]),[])
})

test('input choices retain custom data and detect differences across items',()=>{
  assert.deepEqual(workflowInputFields([{json:{output:'A',prompt:'A',caption:'Caption'}},{json:{output:'B',prompt:'Different',caption:'Caption'}}]),['prompt','caption'])
  assert.deepEqual(workflowInputFields([{json:{imageUrl:'https://example.com/a.jpg',imagePreviewUrl:'https://example.com/a.jpg',imageModel:'model'}}]),['imageUrl'])
})
