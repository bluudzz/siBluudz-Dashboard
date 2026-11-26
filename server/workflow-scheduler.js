import { randomUUID } from 'node:crypto'
import { db } from './db.js'
import { executeGraphAsync, WORKFLOW_NODE_TYPES } from '../shared/workflow-engine.js'
import { isAiConnection } from '../shared/workflow-connections.js'
import { inspectWorkflow } from '../shared/workflow-readiness.js'
import { matchesCron, minuteKey } from '../shared/workflow-cron.js'
import { createWorkflowRuntime } from './workflow-runtime.js'

const parse = value => JSON.parse(value || '[]')
export const activeRuns = new Map()
let schedulerTimer = null

export function sanitizeGraph(nodes, edges) {
  const cleanNodes = (Array.isArray(nodes) ? nodes : []).filter(node => node && WORKFLOW_NODE_TYPES.has(node.type))
  const ids = new Set(cleanNodes.map(node => node.id))
  const cleanEdges = (Array.isArray(edges) ? edges : []).filter(edge => edge && ids.has(edge.source) && ids.has(edge.target))
  return { nodes: cleanNodes, edges: cleanEdges }
}

export function normalizedWorkflow(row) {
  // Reading or testing must not overwrite stored legacy nodes. Only an explicit save writes a draft.
  return sanitizeGraph(parse(row.nodes), parse(row.edges))
}

function makeError(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, ...extra })
}

export async function executeStoredWorkflow({ workflow, user, triggerType = 'manual', partialNodeId, chatMessage, chatSessionId, webhookPayload }) {
  const activeKey = user.id + ':' + workflow.id
  if (activeRuns.get(activeKey)?.running) {
    throw makeError(409, 'Workflow ini sedang berjalan. Tunggu hasilnya sebelum menjalankan lagi.')
  }
  const controller = new AbortController()
  const active = {
    userId: user.id,
    workflowId: workflow.id,
    currentNodeId: '',
    currentNodeLabel: '',
    phase: 'starting',
    completed: [],
    statuses: {},
    events: [],
    sequence: 0,
    running: true,
    controller,
  }
  activeRuns.set(activeKey, active)
  try {
    const normalized = normalizedWorkflow(workflow)
    let nodes = normalized.nodes
    let edges = normalized.edges

    if (triggerType === 'chat') {
      if (typeof chatMessage !== 'string' || !chatMessage.trim() || chatMessage.length > 16000) {
        throw makeError(400, 'Pesan chat wajib diisi, maksimal 16.000 karakter.')
      }
      if (typeof chatSessionId !== 'string' || !chatSessionId || chatSessionId.length > 200) {
        throw makeError(400, 'Session ID chat tidak valid.')
      }
      if (nodes.filter(node => node.type === 'chatTrigger' && !node.data.disabled).length !== 1) {
        throw makeError(400, 'Uji chat membutuhkan tepat satu Chat Trigger aktif.')
      }
      nodes = nodes.map(node => node.type === 'chatTrigger' ? { ...node, data: { ...node.data, chatInput: chatMessage, sessionId: chatSessionId } } : node)
      const scope = new Set()
      const visit = id => {
        if (scope.has(id)) return
        scope.add(id)
        edges.filter(edge => edge.source === id && !isAiConnection(edge)).forEach(edge => visit(edge.target))
      }
      visit(nodes.find(node => node.type === 'chatTrigger' && !node.data.disabled).id)
      edges.filter(edge => scope.has(edge.target) && isAiConnection(edge)).forEach(edge => scope.add(edge.source))
      nodes = nodes.filter(node => scope.has(node.id))
      edges = edges.filter(edge => scope.has(edge.source) && scope.has(edge.target))
    }

    if (triggerType === 'webhook') {
      nodes = nodes.map(node => node.type === 'webhookTrigger' && !node.data?.disabled ? { ...node, data: { ...node.data, webhookPayload } } : node)
    }

    const readiness = inspectWorkflow(nodes, edges, partialNodeId).filter(issue => issue.severity === 'error')
    if (readiness.length) {
      throw makeError(422, readiness.map(issue => issue.message).join(' '), { issues: readiness })
    }

    const result = await executeGraphAsync(
      nodes,
      edges,
      partialNodeId,
      createWorkflowRuntime(user, workflow.id, controller.signal),
      progress => {
        active.phase = progress.phase
        active.currentNodeId = progress.phase === 'start' ? progress.nodeId : ''
        active.currentNodeLabel = progress.label || ''
        if (progress.phase === 'start') active.statuses[progress.nodeId] = 'running'
        if (progress.phase === 'complete') {
          active.statuses[progress.nodeId] = progress.status || 'success'
          active.completed.push({ nodeId: progress.nodeId, status: progress.status })
        }
        active.events.push({ sequence: ++active.sequence, ...progress })
        if (active.events.length > 250) active.events.splice(0, active.events.length - 250)
      },
      controller.signal,
    )

    active.phase = result.status === 'cancelled' ? 'stopped' : 'complete'
    active.currentNodeId = ''
    active.currentNodeLabel = ''
    active.status = result.status
    const runId = randomUUID()
    db.prepare("insert into workflow_runs (id,workflow_id,user_id,status,trigger_type,logs,result,completed_at) values (?,?,?,?,?,?,?,datetime('now'))").run(
      runId,
      workflow.id,
      user.id,
      result.status,
      triggerType,
      JSON.stringify(result.logs),
      JSON.stringify(result),
    )
    return { runId, ...result, ...(partialNodeId ? { nodeId: partialNodeId, output: result.nodeResults[partialNodeId]?.output } : {}) }
  } catch (error) {
    const stopped = error?.code === 'WORKFLOW_STOPPED' || controller.signal.aborted
    active.phase = stopped ? 'stopped' : 'error'
    active.currentNodeId = ''
    active.currentNodeLabel = ''
    active.status = stopped ? 'cancelled' : 'error'
    if (stopped) throw makeError(409, 'Pengujian dihentikan.', { code: 'WORKFLOW_STOPPED' })
    throw error
  } finally {
    active.running = false
    const timer = setTimeout(() => {
      if (activeRuns.get(activeKey) === active) activeRuns.delete(activeKey)
    }, 2500)
    timer.unref?.()
  }
}

export async function runScheduledTick(now = new Date(), timeZone = 'Asia/Jakarta') {
  const currentMinute = minuteKey(now, timeZone)
  const rows = db.prepare(`
    select w.*, u.id as u_id, u.email as u_email, u.name as u_name, u.role as u_role, u.tier as u_tier, u.ai_daily_limit as u_ai_daily_limit
    from workflows w
    join users u on u.id = w.user_id
    where w.is_active = 1
  `).all()

  const triggered = []
  for (const row of rows) {
    if (row.last_scheduled_minute === currentMinute) continue
    let graph
    try { graph = normalizedWorkflow(row) } catch { continue }
    const hasDueSchedule = graph.nodes.some(node =>
      node.type === 'trigger'
      && !node.data?.disabled
      && node.data?.triggerMode === 'schedule'
      && matchesCron(String(node.data?.cron || ''), now, timeZone),
    )
    if (!hasDueSchedule) continue
    const claim = db.prepare("update workflows set last_scheduled_minute = ? where id = ? and coalesce(last_scheduled_minute, '') <> ?").run(currentMinute, row.id, currentMinute)
    if (!claim.changes) continue
    const user = {
      id: row.u_id,
      email: row.u_email,
      name: row.u_name,
      role: row.u_role,
      tier: row.u_tier,
      ai_daily_limit: row.u_ai_daily_limit,
    }
    triggered.push(
      executeStoredWorkflow({ workflow: row, user, triggerType: 'schedule' })
        .catch(error => {
          console.error(`Scheduled workflow "${row.name}" (${row.id}) failed:`, error?.message || error)
          return null
        }),
    )
  }
  return await Promise.all(triggered)
}

export function startWorkflowScheduler(intervalMs = 30_000) {
  if (process.env.NODE_ENV === 'test' || schedulerTimer) return schedulerTimer
  schedulerTimer = setInterval(() => {
    void runScheduledTick().catch(err => console.error('Workflow scheduler tick failed:', err))
  }, intervalMs)
  schedulerTimer.unref?.()
  return schedulerTimer
}
