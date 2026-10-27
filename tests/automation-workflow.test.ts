import test from 'node:test'
import assert from 'node:assert/strict'

test('default IG automation node graph structure', () => {
  const nodes = [
    { id: 'trigger-1', type: 'trigger' },
    { id: 'set-1', type: 'set' },
    { id: 'aiAgent-2', type: 'aiAgent' },
    { id: 'aiAgent-3', type: 'aiAgent' },
    { id: 'aiAgent-4', type: 'aiAgent' },
    { id: 'aiAgent-5', type: 'aiAgent' },
    { id: 'if-6', type: 'if' },
  ]
  const edges = [
    { source: 'trigger-1', target: 'set-1' },
    { source: 'set-1', target: 'aiAgent-2' },
    { source: 'aiAgent-2', target: 'aiAgent-3' },
    { source: 'aiAgent-3', target: 'aiAgent-4' },
    { source: 'aiAgent-4', target: 'aiAgent-5' },
    { source: 'aiAgent-5', target: 'if-6' },
  ]

  assert.equal(nodes.length, 7)
  assert.equal(edges.length, 6)

  // Verify chain connectivity
  const trigger = nodes.find((n) => n.id === edges[0].source)
  assert.ok(trigger)
  assert.equal(trigger.type, 'trigger')

  const condition = nodes.find((n) => n.id === edges[5].target)
  assert.ok(condition)
  assert.equal(condition.type, 'if')
})
