import type { WorkflowNode, WorkflowEdge } from './workflow-engine'
export interface WorkflowIssue { severity:'error'|'warning'; code:string; message:string; nodeId?:string }
export function inspectWorkflow(nodes:WorkflowNode[],edges:WorkflowEdge[],targetNodeId?:string):WorkflowIssue[]
