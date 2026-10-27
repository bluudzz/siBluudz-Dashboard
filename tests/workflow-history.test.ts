import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeWorkflowRun } from '../server/workflow-history.js'

test('invalid legacy run JSON does not break the history list',()=>{
  const runs=[
    {id:'valid',logs:'[]',result:'{"nodeResults":{"trigger":{}}}'},
    {id:'older',logs:'invalid logs',result:'{"incomplete":'},
  ].map(decodeWorkflowRun)
  assert.equal(runs.length,2)
  assert.deepEqual(runs[0].result,{nodeResults:{trigger:{}}})
  assert.deepEqual(runs[1].result,{})
  assert.deepEqual(runs[1].logs,[])
})
