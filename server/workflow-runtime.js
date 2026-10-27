import { createAgentRuntime } from './workflow-agent-runtime.js'

export function createWorkflowRuntime(user, workflowId) {
  const runAgent = createAgentRuntime(user, workflowId)
  return context => runAgent(context)
}
