import { createAgentRuntime } from './workflow-agent-runtime.js'
import { runExternalNode } from './workflow-external.js'
import { runImageNode } from './workflow-image.js'
import { runInstagramNode } from './workflow-instagram.js'
import { runPromptTrigger } from './workflow-prompt-trigger.js'

export function createWorkflowRuntime(user, workflowId) {
  const runAgent = createAgentRuntime(user, workflowId)
  return context => context.kind === 'external' ? runExternalNode(context)
    : context.kind === 'promptTrigger' ? runPromptTrigger(context,user)
    : context.kind === 'imageGenerate' ? runImageNode(context,user)
    : context.kind === 'instagram' ? runInstagramNode(context,user,workflowId)
    : runAgent(context)
}
