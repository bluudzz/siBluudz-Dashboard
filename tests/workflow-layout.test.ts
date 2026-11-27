import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutWorkflowNodes } from '../src/features/automation/workflow-layout.ts'
import type { StudioNode } from '../src/features/automation/workflow-model.ts'
import type { Edge } from '@xyflow/react'

function makeNode(id: string, type: string, x = 0, y = 0): StudioNode {
  return { id, type, position: { x, y }, data: { label: id } }
}

test('layoutWorkflowNodes arranges linear chain left-to-right and keeps single node unchanged', () => {
  const single = [makeNode('n1', 'trigger', 42, 77)]
  assert.deepEqual(layoutWorkflowNodes(single, []), single)

  const nodes = [
    makeNode('c', 'notify', 10, 400),
    makeNode('a', 'trigger', 500, 90),
    makeNode('b', 'set', 100, 200),
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ]
  const laid = layoutWorkflowNodes(nodes, edges)
  const byId = new Map(laid.map(n => [n.id, n.position]))
  assert.ok(byId.get('a')!.x < byId.get('b')!.x)
  assert.ok(byId.get('b')!.x < byId.get('c')!.x)
  assert.equal(byId.get('a')!.y, byId.get('b')!.y)
  assert.equal(byId.get('b')!.y, byId.get('c')!.y)
})

test('layoutWorkflowNodes separates branching targets and places AI sub-nodes below parent without sibling overlap', () => {
  const nodes = [
    makeNode('t', 'trigger', 0, 0),
    makeNode('if1', 'if', 0, 0),
    makeNode('agent', 'aiAgent', 0, 10),
    makeNode('fallback', 'notify', 0, 200),
    makeNode('m1', 'chatModel', 900, 900),
    makeNode('mem1', 'memory', 950, 900),
  ]
  const edges: Edge[] = [
    { id: 'e1', source: 't', target: 'if1' },
    { id: 'e2', source: 'if1', sourceHandle: 'true', target: 'agent' },
    { id: 'e3', source: 'if1', sourceHandle: 'false', target: 'fallback' },
    { id: 'e4', source: 'm1', sourceHandle: 'ai_languageModel', target: 'agent', targetHandle: 'ai_languageModel' },
    { id: 'e5', source: 'mem1', sourceHandle: 'ai_memory', target: 'agent', targetHandle: 'ai_memory' },
  ]
  const laid = layoutWorkflowNodes(nodes, edges)
  const byId = new Map(laid.map(n => [n.id, n.position]))

  assert.ok(byId.get('t')!.x < byId.get('if1')!.x)
  assert.equal(byId.get('agent')!.x, byId.get('fallback')!.x)
  assert.ok(byId.get('agent')!.y < byId.get('fallback')!.y)
  // AI sub-nodes must sit cleanly below aiAgent and above fallback row
  assert.ok(byId.get('m1')!.y > byId.get('agent')!.y)
  assert.ok(byId.get('m1')!.y < byId.get('fallback')!.y)
  assert.equal(byId.get('m1')!.y, byId.get('mem1')!.y)
  assert.ok(byId.get('m1')!.x < byId.get('mem1')!.x)
})

test('layoutWorkflowNodes terminates safely on cyclic graphs', () => {
  const nodes = [makeNode('a', 'set', 0, 0), makeNode('b', 'set', 50, 50)]
  const edges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'a' },
  ]
  const laid = layoutWorkflowNodes(nodes, edges)
  assert.equal(laid.length, 2)
  assert.ok(Number.isFinite(laid[0].position.x) && Number.isFinite(laid[1].position.y))
})
