import type { Edge } from '@xyflow/react'
import type { StudioNode } from './workflow-model'
import { isAiConnection, isSubNode, isTrigger } from '../../../shared/workflow-connections.js'

const COL_GAP = 350
const START_X = 80
const BASE_Y = 160
const NORMAL_ROW_SLOT = 175
const AGENT_WITH_SUB_ROW_SLOT = 360
const SUB_NODE_Y_OFFSET = 235
const SUB_NODE_GAP = 210

const SUB_ORDER: Record<string, number> = {
  chatModel: 0,
  memory: 1,
  tool: 2,
}

const HANDLE_ORDER: Record<string, number> = {
  true: 0,
  case1: 0,
  case2: 1,
  case3: 2,
  false: 3,
  fallback: 3,
}

/**
 * Arrange workflow nodes left-to-right by topological column while keeping AI
 * sub-nodes neatly tucked beneath their parent AI Agent.
 */
export function layoutWorkflowNodes(nodes: StudioNode[], edges: Edge[]): StudioNode[] {
  if (nodes.length <= 1) return nodes

  const mainNodes = nodes.filter(node => !isSubNode(node.type || ''))
  const subNodes = nodes.filter(node => isSubNode(node.type || ''))
  if (!mainNodes.length) {
    return nodes.map((node, index) => ({
      ...node,
      position: { x: START_X + index * SUB_NODE_GAP, y: BASE_Y },
    }))
  }

  const mainById = new Map(mainNodes.map(node => [node.id, node]))
  const outgoing = new Map<string, Edge[]>()
  const incoming = new Map<string, Edge[]>()
  const inDegree = new Map<string, number>()

  for (const node of mainNodes) {
    outgoing.set(node.id, [])
    incoming.set(node.id, [])
    inDegree.set(node.id, 0)
  }

  for (const edge of edges) {
    if (isAiConnection(edge)) continue
    if (!mainById.has(edge.source) || !mainById.has(edge.target)) continue
    if (edge.source === edge.target) continue
    outgoing.get(edge.source)!.push(edge)
    incoming.get(edge.target)!.push(edge)
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
  }

  // Seed layering from root nodes (triggers first, then top-to-bottom).
  const seeds = mainNodes
    .filter(node => (inDegree.get(node.id) || 0) === 0)
    .sort((a, b) => {
      const trigDiff = (isTrigger(a.type || '') ? 0 : 1) - (isTrigger(b.type || '') ? 0 : 1)
      if (trigDiff !== 0) return trigDiff
      if (a.position.y !== b.position.y) return a.position.y - b.position.y
      return a.position.x - b.position.x
    })

  const col = new Map<string, number>()
  const queue: string[] = []
  for (const seed of seeds) {
    col.set(seed.id, 0)
    queue.push(seed.id)
  }

  const maxRelaxations = Math.max(1, mainNodes.length * mainNodes.length)
  let relaxations = 0
  while (queue.length && relaxations < maxRelaxations) {
    const currentId = queue.shift()!
    const nextCol = (col.get(currentId) || 0) + 1
    for (const edge of outgoing.get(currentId) || []) {
      relaxations++
      if (relaxations > maxRelaxations) break
      const prevCol = col.get(edge.target)
      if (prevCol === undefined || nextCol > prevCol) {
        col.set(edge.target, nextCol)
        queue.push(edge.target)
      }
    }
  }

  // Place any nodes caught in pure cycles so none are lost.
  const currentMaxCol = col.size ? Math.max(...col.values()) : 0
  for (const node of mainNodes) {
    if (!col.has(node.id)) {
      const predCols = (incoming.get(node.id) || [])
        .map(edge => col.get(edge.source))
        .filter((value): value is number => value !== undefined)
      col.set(node.id, predCols.length ? Math.max(...predCols) + 1 : currentMaxCol > 0 ? 0 : 0)
    }
  }

  // Group nodes by column.
  const columns = new Map<number, StudioNode[]>()
  for (const node of mainNodes) {
    const c = col.get(node.id) || 0
    const list = columns.get(c)
    if (list) list.push(node)
    else columns.set(c, [node])
  }

  const agentsWithSubs = new Set<string>()
  const subEdgesByAgent = new Map<string, StudioNode[]>()
  const assignedSubIds = new Set<string>()
  const subById = new Map(subNodes.map(node => [node.id, node]))

  for (const edge of edges) {
    if (!isAiConnection(edge)) continue
    const parent = mainById.get(edge.target)
    const child = subById.get(edge.source)
    if (!parent || !child) continue
    agentsWithSubs.add(parent.id)
    assignedSubIds.add(child.id)
    const list = subEdgesByAgent.get(parent.id)
    if (list) list.push(child)
    else subEdgesByAgent.set(parent.id, [child])
  }

  const slotHeight = (node: StudioNode) =>
    node.type === 'aiAgent' && agentsWithSubs.has(node.id) ? AGENT_WITH_SUB_ROW_SLOT : NORMAL_ROW_SLOT

  const sortedColKeys = [...columns.keys()].sort((a, b) => a - b)
  const positions = new Map<string, { x: number; y: number }>()

  for (const colIndex of sortedColKeys) {
    const group = columns.get(colIndex)!
    if (colIndex === 0) {
      group.sort((a, b) => {
        const trigDiff = (isTrigger(a.type || '') ? 0 : 1) - (isTrigger(b.type || '') ? 0 : 1)
        if (trigDiff !== 0) return trigDiff
        if (a.position.y !== b.position.y) return a.position.y - b.position.y
        return a.position.x - b.position.x
      })
    } else {
      group.sort((a, b) => {
        const score = (node: StudioNode) => {
          const preds = (incoming.get(node.id) || [])
            .map(edge => ({
              pos: positions.get(edge.source),
              handleRank: HANDLE_ORDER[edge.sourceHandle || ''] ?? 99,
            }))
            .filter((item): item is { pos: { x: number; y: number }; handleRank: number } => Boolean(item.pos))
          if (!preds.length) return { y: node.position.y, handle: 99 }
          const avgY = preds.reduce((sum, item) => sum + item.pos.y, 0) / preds.length
          const minHandle = Math.min(...preds.map(item => item.handleRank))
          return { y: avgY, handle: minHandle }
        }
        const sa = score(a)
        const sb = score(b)
        if (Math.abs(sa.y - sb.y) > 4) return sa.y - sb.y
        if (sa.handle !== sb.handle) return sa.handle - sb.handle
        return a.position.y - b.position.y
      })
    }

    const totalHeight = group.reduce((sum, node) => sum + slotHeight(node), 0)
    const startY = BASE_Y - (totalHeight - slotHeight(group[0])) / 2
    let cursorY = Math.max(80, startY)

    for (const node of group) {
      positions.set(node.id, {
        x: Math.round(START_X + colIndex * COL_GAP),
        y: Math.round(cursorY),
      })
      cursorY += slotHeight(node)
    }
  }

  // Place connected AI sub-nodes directly beneath their AI Agent.
  for (const [agentId, children] of subEdgesByAgent.entries()) {
    const parentPos = positions.get(agentId)
    if (!parentPos) continue
    const ordered = [...children].sort((a, b) => {
      const rankDiff = (SUB_ORDER[a.type || ''] ?? 9) - (SUB_ORDER[b.type || ''] ?? 9)
      if (rankDiff !== 0) return rankDiff
      return a.position.x - b.position.x
    })
    const parentCenterX = parentPos.x + 135
    const groupSpan = (ordered.length - 1) * SUB_NODE_GAP
    const firstCenterX = parentCenterX - groupSpan / 2
    ordered.forEach((child, index) => {
      const halfWidth = child.type === 'chatModel' ? 84 : 95
      positions.set(child.id, {
        x: Math.round(firstCenterX + index * SUB_NODE_GAP - halfWidth),
        y: Math.round(parentPos.y + SUB_NODE_Y_OFFSET),
      })
    })
  }

  // Place any orphan sub-nodes neatly below the main graph.
  const orphans = subNodes.filter(node => !assignedSubIds.has(node.id))
  if (orphans.length) {
    const maxY = positions.size ? Math.max(...[...positions.values()].map(p => p.y)) : BASE_Y
    orphans.forEach((node, index) => {
      positions.set(node.id, {
        x: Math.round(START_X + index * SUB_NODE_GAP),
        y: Math.round(maxY + 240),
      })
    })
  }

  return nodes.map(node => {
    const nextPos = positions.get(node.id)
    return nextPos ? { ...node, position: nextPos } : node
  })
}
