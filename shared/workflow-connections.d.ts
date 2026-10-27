import type { WorkflowNode, WorkflowEdge } from './workflow-engine'
export const aiPorts:Record<string,string>
export function isSubNode(type?:string):boolean
export function isTrigger(type?:string):boolean
export function isAiConnection(edge:WorkflowEdge):boolean
export function agentResources(agentId:string,nodes:WorkflowNode[],edges:WorkflowEdge[]):{model?:WorkflowNode;memory?:WorkflowNode;tools:WorkflowNode[]}
