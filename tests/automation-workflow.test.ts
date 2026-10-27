import test from 'node:test'
import assert from 'node:assert/strict'

test('default IG automation node graph structure', () => {
  const nodes = [
    { id: 'trigger-1', type: 'trigger' },
    { id: 'set-1', type: 'set' },
    { id: 'aiAgent-2', type: 'aiAgent' },
    { id: 'aiAgent-3', type: 'aiAgent' },
    { id: 'aiAgent-4', type: 'aiAgent' },
    { id: 'aiGenerator-5', type: 'aiGenerator' },
    { id: 'aiAgent-6', type: 'aiAgent' },
    { id: 'if-7', type: 'if' },
    { id: 'publisher-8', type: 'publisher' },
  ]
  const edges = [
    { source: 'trigger-1', target: 'set-1' },
    { source: 'set-1', target: 'aiAgent-2' },
    { source: 'aiAgent-2', target: 'aiAgent-3' },
    { source: 'aiAgent-3', target: 'aiAgent-4' },
    { source: 'aiAgent-4', target: 'aiGenerator-5' },
    { source: 'aiGenerator-5', target: 'aiAgent-6' },
    { source: 'aiAgent-6', target: 'if-7' },
    { source: 'if-7', sourceHandle: 'true', target: 'publisher-8' },
  ]

  assert.equal(nodes.length, 9)
  assert.equal(edges.length, 8)

  // Verify chain connectivity
  const trigger = nodes.find((n) => n.id === edges[0].source)
  assert.ok(trigger)
  assert.equal(trigger.type, 'trigger')

  const publisher = nodes.find((n) => n.id === edges[7].target)
  assert.ok(publisher)
  assert.equal(publisher.type, 'publisher')
  assert.equal(edges[7].sourceHandle, 'true')
})
