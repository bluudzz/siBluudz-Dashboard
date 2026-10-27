import { createAgentRuntime } from './workflow-agent-runtime.js'
import { runExternalNode } from './workflow-external.js'

export function createWorkflowRuntime(user, workflowId) {
  const runAgent = createAgentRuntime(user, workflowId)
  return context => context.kind === 'external' ? runExternalNode(context) : runAgent(context)
}
