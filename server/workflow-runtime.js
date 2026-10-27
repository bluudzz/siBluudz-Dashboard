import { createAgentRuntime } from './workflow-agent-runtime.js'
import { runExternalNode } from './workflow-external.js'
import { runImageNode } from './workflow-image.js'
import { runInstagramNode } from './workflow-instagram.js'
import { runPromptTrigger } from './workflow-prompt-trigger.js'
import { runDriveNode } from './workflow-drive.js'

export function createWorkflowRuntime(user, workflowId, signal) {
  const runAgent = createAgentRuntime(user, workflowId, signal)
  return context => context.kind === 'external' ? runExternalNode(context,undefined,{signal})
    : context.kind === 'promptTrigger' ? runPromptTrigger(context,user,{signal})
    : context.kind === 'imageGenerate' ? runImageNode(context,user,{signal})
    : context.kind === 'instagram' ? runInstagramNode(context,user,workflowId)
    : context.kind === 'googleDrive' ? runDriveNode(context,user,{signal})
    : runAgent(context)
}
