export interface WorkflowNode { id: string; type?: string; position: {x:number;y:number}; data: Record<string, unknown> }
export interface WorkflowEdge { id: string; source: string; target: string; sourceHandle?: string | null; targetHandle?: string | null }
export interface DataItem { json: Record<string, unknown> }
export interface NodeResult { nodeId: string; label: string; status: 'success'|'simulated'|'skipped'|'pinned'|'error'|'waiting'; input: DataItem[]; output: DataItem[]; branches?: Record<string,DataItem[]>; durationMs: number; message?: string; error?: string }
export interface ExecutionResult { status:'completed'|'error'|'waiting_approval'|'cancelled'; mode:'simulation'|'live'; nodeResults:Record<string,NodeResult>; nodeOutputs:Record<string,DataItem[]>; logs:{nodeId:string;step:string;status:string;time:string;message:string}[] }
export const WORKFLOW_NODE_TYPES: Set<string>
export function validateGraph(nodes: unknown, edges: unknown, forRun?: boolean): string[]
export function resolveValue(value: unknown, json:Record<string,unknown>): unknown
export function executeGraph(nodes: WorkflowNode[], edges: WorkflowEdge[], targetNodeId?: string): ExecutionResult
export function executeGraphAsync(nodes: WorkflowNode[], edges: WorkflowEdge[], targetNodeId:string|undefined, runAgent:(context:unknown)=>Promise<DataItem[]>, onProgress?:(progress:{phase:string;nodeId:string;label?:string;status?:string;error?:string;result?:NodeResult})=>void, signal?:AbortSignal):Promise<ExecutionResult>
