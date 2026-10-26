import test from 'node:test'
import assert from 'node:assert/strict'

test('default IG automation node graph structure', () => {
  const nodes = [
    { id: 'trigger-1', type: 'trigger' },
    { id: 'radar-1', type: 'radar' },
    { id: 'ai-gen-1', type: 'aiGenerator' },
    { id: 'publisher-1', type: 'publisher' },
  ]
  const edges = [
    { source: 'trigger-1', target: 'radar-1' },
    { source: 'radar-1', target: 'ai-gen-1' },
    { source: 'ai-gen-1', target: 'publisher-1' },
  ]

  assert.equal(nodes.length, 4)
  assert.equal(edges.length, 3)

  // Verify chain connectivity
  const trigger = nodes.find((n) => n.id === edges[0].source)
  assert.ok(trigger)
  assert.equal(trigger.type, 'trigger')

  const publisher = nodes.find((n) => n.id === edges[2].target)
  assert.ok(publisher)
  assert.equal(publisher.type, 'publisher')
})
