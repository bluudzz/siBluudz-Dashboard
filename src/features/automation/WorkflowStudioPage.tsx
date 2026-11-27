import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Controls, Background, MiniMap, ConnectionLineType, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Edge, type NodeChange, type EdgeChange, type Connection, type ReactFlowInstance, type OnConnectEnd } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, Square, Save, Plus, Undo2, Redo2, Download, Upload, X, Search, Trash2, Copy, Workflow, Maximize2, RefreshCw, Send, BookOpen, Pencil, MoreHorizontal, Check, AlertTriangle, HelpCircle, Bot, ScrollText, Power, LayoutGrid, Map as MapIcon, CopyPlus } from 'lucide-react'
import { TriggerNode, AiAgentNode, SetNode, SplitOutNode, IfNode, ChatTriggerNode, ChatModelNode, MemoryNode, ToolNode } from './CustomNodes'
import { WorkflowEdge, type WorkflowEdgeData } from './WorkflowEdge'
import { layoutWorkflowNodes } from './workflow-layout'
import { DataViewer, NodeSettingsPanel } from './NodeSettingsPanel'
import { WorkflowAssistantPanel } from './WorkflowAssistantPanel'
import { iconForWorkflowNode } from './workflow-node-icons'
import { catalog, availableCatalog, ports, serializableGraph, graphStamp, workflowRequest, workflowNodeImages, type StudioNode, type WorkflowItem, type RunItem, type ExecutionResult } from './workflow-model'
import { validateGraph } from '../../../shared/workflow-engine'
import { inspectWorkflow } from '../../../shared/workflow-readiness'
import { aiPorts, isSubNode, isTrigger, isAiConnection } from '../../../shared/workflow-connections'
import './workflow-studio.css'

const edgeTypes = { workflow: WorkflowEdge }

function branchLabelForHandle(handle?: string | null): string {
  if (handle === 'true') return 'True'
  if (handle === 'false') return 'False'
  if (handle === 'case1') return 'Case 1'
  if (handle === 'case2') return 'Case 2'
  if (handle === 'case3') return 'Case 3'
  if (handle === 'fallback') return 'Lainnya'
  return ''
}

function minimapNodeColor(type?: string): string {
  if (isTrigger(type || '')) return '#d4822a'
  if (type === 'aiAgent' || isSubNode(type || '') || type === 'aiVision') return '#818cf8'
  if (type === 'if' || type === 'switch' || type === 'wait') return '#c68a38'
  if (type === 'approval' || type === 'notify' || type === 'googleDrive') return '#288161'
  if (type === 'imageGenerate' || type === 'imageEdit') return '#9b75c8'
  if (type === 'instagram') return '#d26a95'
  return '#5289b6'
}

type EdgeFlowState = NonNullable<WorkflowEdgeData['flowState']>

function edgeFlowState(edge: Edge, nodeStatusById: Map<string, string>): EdgeFlowState {
  const src = nodeStatusById.get(edge.source) || 'idle'
  const dst = nodeStatusById.get(edge.target) || 'idle'
  if (isAiConnection(edge)) {
    if (dst === 'running') return 'running'
    if (src === 'error' || dst === 'error') return 'error'
    if (dst === 'success') return 'success'
    return 'idle'
  }
  if (dst === 'running') return 'running'
  if (dst === 'error') return 'error'
  if (['success', 'simulated', 'pinned'].includes(src) && ['success', 'simulated', 'pinned', 'waiting'].includes(dst)) return 'success'
  return 'idle'
}

function edgeStrokeColor(flowState: EdgeFlowState, selected: boolean): string {
  if (selected || flowState === 'running') return 'var(--wf-accent)'
  if (flowState === 'success') return '#288161'
  if (flowState === 'error') return '#c95151'
  return 'var(--wf-control)'
}

const nodeTypes={
  trigger:TriggerNode,
  webhookTrigger:TriggerNode,
  promptTrigger:TriggerNode,
  chatTrigger:ChatTriggerNode,
  chatModel:ChatModelNode,
  memory:MemoryNode,
  tool:ToolNode,
  aiAgent:AiAgentNode,
  set:SetNode,
  merge:SetNode,
  jsonParse:SetNode,
  splitOut:SplitOutNode,
  if:IfNode,
  switch:IfNode,
  wait:SetNode,
  approval:IfNode,
  searchContent:SetNode,
  httpRequest:SetNode,
  apiRequest:SetNode,
  googleDrive:SetNode,
  imageGenerate:SetNode,
  imageEdit:SetNode,
  aiVision:SetNode,
  instagram:SetNode,
  notify:SetNode,
}
type Snapshot={nodes:StudioNode[];edges:Edge[]}
type ConfirmDialogState={title:string;message:string;confirmText?:string;cancelText?:string;isDanger?:boolean}
type PaletteTarget=
  |{mode:'connect-drop';sourceId:string;sourceHandle:string;sourceLabel:string;position:{x:number;y:number}}
  |{mode:'insert-edge';edgeId:string;sourceLabel:string;targetLabel:string}
  |null
function triggerTypeLabel(triggerType:string) {
  if(triggerType==='partial')return 'Satu langkah'
  if(triggerType==='chat')return 'Chat'
  if(triggerType==='schedule')return 'Terjadwal'
  if(triggerType==='webhook')return 'Webhook'
  return 'Workflow'
}
function Studio() {
  const [workflows,setWorkflows]=useState<WorkflowItem[]>([])
  const [workflowId,setWorkflowId]=useState('')
  const [name,setName]=useState('')
  const [isActive,setIsActive]=useState(false)
  const [webhookToken,setWebhookToken]=useState('')
  const [renaming,setRenaming]=useState(false)
  const [nodes,setNodes]=useState<StudioNode[]>([])
  const [edges,setEdges]=useState<Edge[]>([])
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)
  const [tab,setTab]=useState<'editor'|'executions'|'logs'>('editor')
  const [palette,setPalette]=useState(false)
  const [guideOpen,setGuideOpen]=useState(false)
  const [readinessOpen,setReadinessOpen]=useState(false)
  const [chatOpen,setChatOpen]=useState(false)
  const [assistantOpen,setAssistantOpen]=useState(false)
  const [chatMessage,setChatMessage]=useState('')
  const [chatMessages,setChatMessages]=useState<{role:string;text:string}[]>([])
  const [chatSession,setChatSession]=useState(()=>crypto.randomUUID())
  const [search,setSearch]=useState('')
  const [newOpen,setNewOpen]=useState(false)
  const [newName,setNewName]=useState('')
  const [newDescription,setNewDescription]=useState('')
  const [template,setTemplate]=useState('starter')
  const [busyKind,setBusyKind]=useState('loading')
  const [stopRequested,setStopRequested]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [savedStamp,setSavedStamp]=useState('')
  const [runs,setRuns]=useState<RunItem[]>([])
  const [runsLoading,setRunsLoading]=useState(false)
  const [historyError,setHistoryError]=useState('')
  const [historyLoaded,setHistoryLoaded]=useState(false)
  const [viewedRunId,setViewedRunId]=useState('')
  const [viewedNodeId,setViewedNodeId]=useState('')
  const [logSelection,setLogSelection]=useState<{runId:string;nodeId:string;step:string;message:string}|null>(null)
  const logResultDialog=useRef<HTMLDialogElement>(null)
  const [liveProgress,setLiveProgress]=useState<{label:string;phase:string;done:number;total:number}|null>(null)
  const progressCursor=useRef(0)
  const [undoStack,setUndoStack]=useState<Snapshot[]>([])
  const [redoStack,setRedoStack]=useState<Snapshot[]>([])
  const [minimapOpen,setMinimapOpen]=useState(true)
  const [hoveredEdgeId,setHoveredEdgeId]=useState<string|null>(null)
  const [paletteTarget,setPaletteTarget]=useState<PaletteTarget>(null)
  const edgeHoverTimer=useRef<ReturnType<typeof setTimeout>|null>(null)
  const edgeActionsRef=useRef<{insert:(edgeId:string)=>void;remove:(edgeId:string)=>void;hover:(edgeId:string|null)=>void}>({insert:()=>{},remove:()=>{},hover:()=>{}})
  const shortcutRef=useRef<{save:()=>void;undo:()=>void;redo:()=>void;duplicate:()=>void}>({save:()=>{},undo:()=>{},redo:()=>{},duplicate:()=>{}})
  const [confirmState,setConfirmState]=useState<ConfirmDialogState|null>(null)
  const confirmResolver=useRef<((value:boolean)=>void)|null>(null)
  const confirmDialog=useRef<HTMLDialogElement>(null)
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:600px)').matches)
  const canvas=useRef<HTMLDivElement>(null)
  const assistantDrafts=useRef(new Map<string,string>())
  const flow=useRef<ReactFlowInstance<StudioNode,Edge>|null>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const createDialog=useRef<HTMLDialogElement>(null)
  const paletteDialog=useRef<HTMLDialogElement>(null)
  const workflowMenu=useRef<HTMLDetailsElement>(null)
  const renameStart=useRef('')
  const busy=Boolean(busyKind)
  const stamp=graphStamp(name,nodes,edges)
  const dirty=Boolean(workflowId&&savedStamp!==stamp)
  const workflowLogs=useMemo(()=>runs.flatMap(item=>(item.result?.logs||[]).map(log=>({...log,runId:item.id,runStatus:item.status}))).sort((a,b)=>String(b.time).localeCompare(String(a.time))),[runs])
  const issues=useMemo(()=>inspectWorkflow(nodes,edges),[nodes,edges])
  const blockingIssues=issues.filter(issue=>issue.severity==='error')
  const selectedNode=nodes.find(node=>node.id===selectedId)
  const viewedRun=runs.find(run=>run.id===viewedRunId)
  const viewedResults=viewedRun?.result?.nodeResults||{}
  const viewedResult=viewedResults[viewedNodeId]
  const logResult=logSelection?runs.find(run=>run.id===logSelection.runId)?.result?.nodeResults?.[logSelection.nodeId]:undefined

  const loadDetail=useCallback(async(id:string)=>{
    const {workflow}=await workflowRequest<{workflow:{id:string;name:string;nodes:StudioNode[];edges:Edge[];isActive?:boolean;webhookToken?:string}}>('/'+id)
    const preparedNodes=workflow.nodes.map(node=>{
      if(node.type==='splitOut')return {...node,data:{...node.data,label:'Split Out',splitCount:String(node.data.splitCount||'3'),sourceField:'output',arrayField:'prompts'}}
      if(node.type==='chatTrigger'&&node.data.label==='Mulai dari Chat')return {...node,data:{...node.data,label:'Chat Trigger'}}
      if(node.type==='trigger'&&node.data.label==='Jalankan Manual')return {...node,data:{...node.data,label:'Manual Trigger'}}
      if(node.type==='aiAgent'&&['Agent AI','Asisten AI'].includes(String(node.data.label)))return {...node,data:{...node.data,label:'AI Agent'}}
      return node
    })
    setWorkflowId(workflow.id);setName(workflow.name);setNodes(preparedNodes);setEdges(workflow.edges)
    setIsActive(Boolean(workflow.isActive));setWebhookToken(String(workflow.webhookToken||''))
    setRenaming(false);setReadinessOpen(false)
    setChatMessages([]);setChatSession(crypto.randomUUID());setChatMessage('');setChatOpen(false);setAssistantOpen(false)
    setSavedStamp(graphStamp(workflow.name,preparedNodes,workflow.edges));setSelectedId(null);setDetailOpen(false);setRuns([]);setHistoryLoaded(false);setHistoryError('');setViewedRunId('');setUndoStack([]);setRedoStack([]);setTab('editor')
  },[])
  const loadList=useCallback(async()=>{
    setBusyKind('loading');setError('')
    try{const data=await workflowRequest<{workflows:WorkflowItem[]}>('');setWorkflows(data.workflows);if(data.workflows[0])await loadDetail(data.workflows[0].id)}
    catch(err){setError(err instanceof Error?err.message:'Workflow gagal dimuat.')}
    finally{setBusyKind('')}
  },[loadDetail])
  useEffect(()=>{void loadList()},[loadList])
  useEffect(()=>{const media=window.matchMedia('(max-width:600px)');const change=()=>setCompact(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change)},[])
  useEffect(()=>{
    if(compact||tab!=='editor'||!canvas.current)return
    let timer:ReturnType<typeof setTimeout>
    const observer=new ResizeObserver(entries=>{if(entries[0]?.contentRect.width>0){clearTimeout(timer);timer=setTimeout(()=>void flow.current?.fitView({padding:.4,maxZoom:1,duration:0}),120)}})
    observer.observe(canvas.current)
    return()=>{observer.disconnect();clearTimeout(timer)}
  },[compact,tab])
  useEffect(()=>{if(logSelection)logResultDialog.current?.showModal();else logResultDialog.current?.close()},[logSelection])
  useEffect(()=>{if(newOpen)createDialog.current?.showModal();else createDialog.current?.close()},[newOpen])
  useEffect(()=>{if(palette)paletteDialog.current?.showModal();else paletteDialog.current?.close()},[palette])
  useEffect(()=>{if(confirmState)confirmDialog.current?.showModal();else confirmDialog.current?.close()},[confirmState])
  useEffect(()=>()=>{if(edgeHoverTimer.current)clearTimeout(edgeHoverTimer.current)},[])
  useEffect(()=>{
    if(!notice)return
    const timer=setTimeout(()=>setNotice(''),4000)
    return()=>clearTimeout(timer)
  },[notice])
  const askConfirmation=useCallback((options:ConfirmDialogState):Promise<boolean>=>{
    return new Promise(resolve=>{
      confirmResolver.current=resolve
      setConfirmState(options)
    })
  },[])
  const handleConfirm=()=>{
    const resolve=confirmResolver.current
    confirmResolver.current=null
    setConfirmState(null)
    resolve?.(true)
  }
  const handleCancelConfirm=()=>{
    const resolve=confirmResolver.current
    confirmResolver.current=null
    setConfirmState(null)
    resolve?.(false)
  }
  useEffect(()=>{const closeMenu=(event:PointerEvent)=>{if(workflowMenu.current&&!workflowMenu.current.contains(event.target as Node))workflowMenu.current.open=false};document.addEventListener('pointerdown',closeMenu);return()=>document.removeEventListener('pointerdown',closeMenu)},[])
  useEffect(()=>{if(workflowId&&tab==='editor'){const timer=setTimeout(()=>void flow.current?.fitView({padding:.4,maxZoom:1,duration:200}),100);return()=>clearTimeout(timer)}},[workflowId,tab])
  useEffect(()=>{
    const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)
  },[dirty])
  const message=(err:unknown)=>setError(err instanceof Error?err.message:'Permintaan gagal.')
  const liveNodeStatus=(node:StudioNode)=>{
    if(node.data.running)return 'running'
    const explicit=typeof node.data.status==='string'?node.data.status:''
    return explicit||node.data.result?.status||'idle'
  }
  const liveStatusText=(status:string)=>({idle:'Belum diuji',running:'Sedang diproses…',queued:'Menunggu giliran',success:'Selesai',simulated:'Pratinjau',skipped:'Dilewati',pinned:'Data pin',error:'Error',waiting:'Menunggu persetujuan'} as Record<string,string>)[status]||status
  const failedNodeLabel=(result:ExecutionResult)=>{
    const failed=Object.values(result.nodeResults||{}).find(entry=>entry.status==='error')
    return failed?.label||failed?.nodeId||'tidak diketahui'
  }
  const pollActiveNode=async(id:string)=>{
    try{
      const data=await workflowRequest<{active?:{nodeId?:string;label?:string;phase?:string;statuses?:Record<string,string>;completed?:{nodeId:string;status:string}[];sequence?:number;events?:{sequence:number;phase:string;nodeId:string;status?:string;result?:ExecutionResult['nodeResults'][string]}[]}}>(`/${id}/active?after=${progressCursor.current}`)
      const active=data.active
      const current=active?.nodeId||''
      const live:Record<string,string>={...(active?.statuses||{})}
      for(const done of active?.completed||[])if(!live[done.nodeId])live[done.nodeId]=done.status||'success'
      const events=active?.events||[]
      const completedResults=new Map(events.filter(event=>event.phase==='complete'&&event.result).map(event=>[event.nodeId,event.result!]))
      if(events.length)progressCursor.current=Math.max(progressCursor.current,...events.map(event=>event.sequence))
      setLiveProgress(active?{label:active.label||'',phase:active.phase||'running',done:(active.completed||[]).length,total:0}:null)
      setNodes(previous=>previous.map(node=>{
        const result=completedResults.get(node.id)
        if(live[node.id]===undefined&&node.id!==current&&!result)return node
        return {...node,data:{...node.data,running:node.id===current&&Boolean(current),status:node.id===current?'running':(live[node.id]??result?.status??node.data.status),...(result?{result}: {})}}
      }))
    }catch{}
  }
  const remember=()=>{setUndoStack(prev=>[...prev.slice(-29),{nodes,edges}]);setRedoStack([])}
  const commit=(nextNodes:StudioNode[],nextEdges:Edge[])=>{
    remember()
    setNodes(nextNodes.map(node=>{const {result:_result,running:_running,...data}=node.data;return {...node,data}}));setEdges(nextEdges);setNotice('')
  }
  const undo=()=>{const previous=undoStack.at(-1);if(!previous||busy)return;setRedoStack(prev=>[...prev,{nodes,edges}]);setUndoStack(prev=>prev.slice(0,-1));setNodes(previous.nodes);setEdges(previous.edges);setSelectedId(null);setDetailOpen(false)}
  const redo=()=>{const next=redoStack.at(-1);if(!next||busy)return;setUndoStack(prev=>[...prev,{nodes,edges}]);setRedoStack(prev=>prev.slice(0,-1));setNodes(next.nodes);setEdges(next.edges);setSelectedId(null);setDetailOpen(false)}
  const onNodesChange=(changes:NodeChange<StudioNode>[])=>{
    if(busy)return
    const next=applyNodeChanges(changes,nodes)
    if(changes.some(c=>c.type==='remove'))commit(next,edges.filter(edge=>next.some(n=>n.id===edge.source)&&next.some(n=>n.id===edge.target)))
    else setNodes(next)
  }
  const onEdgesChange=(changes:EdgeChange[])=>{if(busy)return;const next=applyEdgeChanges(changes,edges);if(changes.some(c=>c.type==='remove'))commit(nodes,next);else setEdges(next)}
  const canConnect=(connection:Connection|Edge)=>!validateGraph(nodes,[...edges,{id:'check-'+crypto.randomUUID(),...connection}]).length
  const connect=(connection:Connection)=>{if(!busy&&canConnect(connection))commit(nodes,addEdge({...connection,id:crypto.randomUUID(),type:'workflow'},edges))}
  const scheduleEdgeHover=useCallback((edgeId:string|null)=>{
    if(edgeHoverTimer.current){clearTimeout(edgeHoverTimer.current);edgeHoverTimer.current=null}
    if(edgeId){setHoveredEdgeId(edgeId)}
    else{edgeHoverTimer.current=setTimeout(()=>setHoveredEdgeId(null),150)}
  },[])
  const removeEdge=(edgeId:string)=>{
    if(busy)return
    if(hoveredEdgeId===edgeId)setHoveredEdgeId(null)
    commit(nodes,edges.filter(edge=>edge.id!==edgeId))
  }
  const openInsertOnEdge=(edgeId:string)=>{
    if(busy||!workflowId)return
    const edge=edges.find(item=>item.id===edgeId)
    if(!edge||isAiConnection(edge))return
    const sourceNode=nodes.find(node=>node.id===edge.source)
    const targetNode=nodes.find(node=>node.id===edge.target)
    setPaletteTarget({
      mode:'insert-edge',
      edgeId,
      sourceLabel:String(sourceNode?.data.label||edge.source),
      targetLabel:String(targetNode?.data.label||edge.target),
    })
    setHoveredEdgeId(null)
    setSearch('')
    setPalette(true)
  }
  const handleConnectEnd:OnConnectEnd=(event,connectionState)=>{
    if(busy||!workflowId||connectionState.isValid||!connectionState.fromNode||!connectionState.fromHandle)return
    if(connectionState.fromHandle.type!=='source')return
    const fromNode=connectionState.fromNode
    if(isSubNode(fromNode.type||''))return
    const point='changedTouches' in event&&event.changedTouches.length?event.changedTouches[0]:(event as MouseEvent)
    if(typeof point.clientX!=='number'||typeof point.clientY!=='number')return
    const flowPos=flow.current?.screenToFlowPosition({x:point.clientX,y:point.clientY})
    if(!flowPos)return
    const sourceHandle=connectionState.fromHandle.id||ports(fromNode.type).output
    setPaletteTarget({
      mode:'connect-drop',
      sourceId:fromNode.id,
      sourceHandle,
      sourceLabel:String(fromNode.data?.label||fromNode.type||'Node'),
      position:{x:Math.round(flowPos.x),y:Math.round(flowPos.y-52)},
    })
    setSearch('')
    setPalette(true)
  }
  const updateNode=(id:string,data:StudioNode['data'])=>commit(nodes.map(node=>node.id===id?{...node,data}:node),edges)
  const removeNode=async(id:string)=>{
    if(busy)return
    const target=nodes.find(n=>n.id===id)
    const label=target?.data.label?`"${target.data.label}"`:'langkah ini'
    const ok=await askConfirmation({
      title:'Hapus langkah?',
      message:`Hapus ${label} beserta koneksinya dari alur kerja?`,
      confirmText:'Hapus langkah',
      cancelText:'Batal',
      isDanger:true
    })
    if(!ok)return
    commit(nodes.filter(node=>node.id!==id),edges.filter(edge=>edge.source!==id&&edge.target!==id));setSelectedId(null);setDetailOpen(false)
  }
  const addNode=(type:string,parentId?:string)=>{
    if(busy||!workflowId)return
    const definition=catalog.find(item=>item.type===type)
    if(!definition)return
    const sub=isSubNode(type)
    if(!parentId&&paletteTarget?.mode==='connect-drop'){
      if(sub||isTrigger(type))return
      const node:StudioNode={id:crypto.randomUUID(),type,position:paletteTarget.position,data:{...definition.data}}
      const nextEdge:Edge={id:crypto.randomUUID(),source:paletteTarget.sourceId,sourceHandle:paletteTarget.sourceHandle,target:node.id,targetHandle:ports(type).input,type:'workflow'}
      const nextNodes=[...nodes,node]
      const nextEdges=validateGraph(nextNodes,[...edges,nextEdge]).length?edges:addEdge(nextEdge,edges)
      commit(nextNodes,nextEdges);setPaletteTarget(null);setPalette(false);setSelectedId(node.id);setDetailOpen(true)
      return
    }
    if(!parentId&&paletteTarget?.mode==='insert-edge'){
      if(sub||isTrigger(type))return
      const existingEdge=edges.find(edge=>edge.id===paletteTarget.edgeId)
      const sourceNode=existingEdge&&nodes.find(node=>node.id===existingEdge.source)
      const targetNode=existingEdge&&nodes.find(node=>node.id===existingEdge.target)
      if(existingEdge&&sourceNode&&targetNode){
        const midX=Math.round((sourceNode.position.x+targetNode.position.x)/2)
        const midY=Math.round((sourceNode.position.y+targetNode.position.y)/2)
        const needsShift=targetNode.position.x-sourceNode.position.x<460
        const insertedX=needsShift?sourceNode.position.x+320:midX
        const baseNodes=needsShift?nodes.map(n=>n.id!==sourceNode.id&&n.position.x>=targetNode.position.x-10?{...n,position:{...n.position,x:n.position.x+260}}:n):nodes
        const node:StudioNode={id:crypto.randomUUID(),type,position:{x:Math.round(insertedX),y:midY},data:{...definition.data}}
        const nextOutHandle=type==='if'?'true':type==='switch'?'case1':ports(type).output
        const firstEdge:Edge={id:crypto.randomUUID(),source:existingEdge.source,sourceHandle:existingEdge.sourceHandle,target:node.id,targetHandle:ports(type).input,type:'workflow'}
        const secondEdge:Edge={id:crypto.randomUUID(),source:node.id,sourceHandle:nextOutHandle,target:existingEdge.target,targetHandle:existingEdge.targetHandle,type:'workflow'}
        const candidateEdges=[...edges.filter(edge=>edge.id!==existingEdge.id),firstEdge,secondEdge]
        const nextNodes=[...baseNodes,node]
        if(validateGraph(nextNodes,candidateEdges).length){
          setNotice('Node tidak dapat disisipkan pada koneksi ini.')
          return
        }
        commit(nextNodes,candidateEdges);setPaletteTarget(null);setPalette(false);setSelectedId(node.id);setDetailOpen(true)
        return
      }
    }
    const anchor=sub?nodes.find(node=>node.id===(parentId||selectedId)&&node.type==='aiAgent'):nodes.find(node=>node.id===selectedId&&!isSubNode(node.type))||[...nodes].reverse().find(node=>!isSubNode(node.type))
    if(sub&&anchor&&type==='chatModel'&&edges.some(edge=>edge.target===anchor.id&&edge.targetHandle===aiPorts.chatModel)){setNotice('AI Agent sudah memiliki Model AI. Gunakan Model AI yang terhubung.');return}
    const node:StudioNode={id:crypto.randomUUID(),type,position:anchor?sub?{x:anchor.position.x+(['chatModel','memory','tool'].indexOf(type)-1)*230,y:anchor.position.y+260}:{x:anchor.position.x+340,y:anchor.position.y+(anchor.type==='if'||anchor.type==='switch'?140:0)}:{x:100,y:180},data:{...definition.data}}
    let nextEdges=edges
    if(anchor&&sub){
      if(type!=='tool'&&edges.some(edge=>edge.target===anchor.id&&edge.targetHandle===aiPorts[type])){setNotice('Port ini sudah terhubung. Buka sub-node yang ada untuk mengubah pengaturan.');return}
      nextEdges=addEdge({id:crypto.randomUUID(),source:node.id,sourceHandle:aiPorts[type],target:anchor.id,targetHandle:aiPorts[type],type:'workflow'},edges)
    }else if(anchor&&!isTrigger(type)){
      const switchBranch=anchor.type==='switch'?(['case1','case2','case3','fallback'].find(h=>!edges.some(e=>e.source===anchor.id&&e.sourceHandle===h))||'fallback'):''
      const sourceHandle=anchor.type==='if'?'true':anchor.type==='switch'?switchBranch:ports(anchor.type).output
      nextEdges=addEdge({id:crypto.randomUUID(),source:anchor.id,sourceHandle,target:node.id,targetHandle:ports(type).input,type:'workflow'},edges)
    }
    commit([...nodes,node],nextEdges);setPaletteTarget(null);setPalette(false);setSelectedId(node.id);setDetailOpen(true)
  }
  const duplicate=()=>{
    if(!selectedNode||busy)return
    const {result:_result,running:_running,...data}=selectedNode.data
    commit([...nodes,{...selectedNode,id:crypto.randomUUID(),position:{x:selectedNode.position.x,y:selectedNode.position.y+160},selected:false,data}],edges)
  }
  const autoLayout=()=>{
    if(busy||nodes.length<2)return
    commit(layoutWorkflowNodes(nodes,edges),edges)
    setNotice('Posisi node dirapikan.')
    setTimeout(()=>void flow.current?.fitView({padding:.35,maxZoom:1,duration:240}),40)
  }
  const save=async(activeFlag=isActive)=>{
    if(!workflowId||!name.trim())throw new Error('Nama workflow wajib diisi.')
    const validation=validateGraph(nodes,edges)
    if(validation.length)throw new Error(validation.join(' '))
    const clean=serializableGraph(nodes,edges)
    const res=await workflowRequest<{isActive?:boolean;webhookToken?:string}>('/'+workflowId,{method:'PUT',body:JSON.stringify({name:name.trim(),...clean,isActive:activeFlag})})
    if(typeof res?.isActive==='boolean')setIsActive(res.isActive)
    if(typeof res?.webhookToken==='string')setWebhookToken(res.webhookToken)
    setSavedStamp(stamp);setWorkflows(prev=>prev.map(item=>item.id===workflowId?{...item,name:name.trim(),is_active:activeFlag?1:0}:item))
  }
  const hasAutomationTrigger=nodes.some(node=>!node.data.disabled&&((node.type==='trigger'&&node.data.triggerMode==='schedule')||node.type==='webhookTrigger'))
  const toggleActive=async()=>{
    if(busy||!workflowId)return
    const next=!isActive
    setBusyKind('saving');setError('');setNotice('')
    try{
      if(dirty)await save(next)
      else{
        const res=await workflowRequest<{isActive:boolean;webhookToken?:string;message:string}>('/'+workflowId+'/active',{method:'PATCH',body:JSON.stringify({isActive:next})})
        setIsActive(res.isActive)
        if(typeof res.webhookToken==='string')setWebhookToken(res.webhookToken)
        setWorkflows(prev=>prev.map(item=>item.id===workflowId?{...item,is_active:res.isActive?1:0}:item))
      }
      setNotice(next?'Workflow diaktifkan untuk jadwal/webhook otomatis.':'Workflow dikembalikan ke mode draft.')
    }catch(err){message(err)}finally{setBusyKind('')}
  }
  const generateWebhookToken=async()=>{
    if(!workflowId)return
    const res=await workflowRequest<{webhookToken:string}>('/'+workflowId+'/webhook-token',{method:'POST'})
    setWebhookToken(res.webhookToken)
    setNotice('URL Webhook baru dibuat.')
  }
  const handleSave=async()=>{setBusyKind('saving');setError('');setNotice('');try{await save()}catch(err){message(err)}finally{setBusyKind('')}}
  const run=async(nodeId?:string)=>{
    if(busy||!workflowId)return
    if(inspectWorkflow(nodes,edges,nodeId).some(issue=>issue.severity==='error')){setTab('editor');setReadinessOpen(true);setDetailOpen(false);return}
    setBusyKind('running');setStopRequested(false);setError('');setNotice('')
    progressCursor.current=0
    setNodes(prev=>prev.map(node=>({...node,data:{...node.data,result:undefined,running:false,status:isSubNode(node.type||'')?undefined:'queued'}})))
    let progressTimer:ReturnType<typeof setInterval>|undefined
    try{
      await save()
      progressTimer=setInterval(()=>void pollActiveNode(workflowId),500)
      void pollActiveNode(workflowId)
      const result=await workflowRequest<ExecutionResult&{runId:string}>('/'+workflowId+(nodeId?'/test-node':'/execute'),{method:'POST',body:JSON.stringify(nodeId?{nodeId}:{})})
      setHistoryLoaded(false)
      if(progressTimer)clearInterval(progressTimer)
      setNodes(prev=>prev.map(node=>({...node,data:{...node.data,running:false,status:undefined,result:result.nodeResults[node.id]}})))
      setNotice(result.status==='cancelled'?'Pengujian dihentikan.':result.status==='error'?`Pengujian berhenti pada node "${failedNodeLabel(result)}". Buka node tersebut untuk melihat penyebabnya.`:result.status==='waiting_approval'?'Alur menunggu persetujuan. Buka node Persetujuan Manual untuk meninjau hasil.':'Pengujian selesai. Periksa input dan output setiap node.')
    }catch(err){if(progressTimer)clearInterval(progressTimer);if((err as Error&{code?:string}).code==='WORKFLOW_STOPPED')setNotice('Pengujian dihentikan.');else message(err);setNodes(prev=>prev.map(node=>({...node,data:{...node.data,running:false,status:undefined}})))}
    finally{setStopRequested(false);setBusyKind('');setLiveProgress(null)}
  }
  const stopRun=async()=>{
    if(!workflowId||!['running','chat'].includes(busyKind)||stopRequested)return
    setStopRequested(true);setError('')
    try{await workflowRequest('/'+workflowId+'/stop',{method:'POST'});setNotice('Menghentikan pengujian…')}
    catch(err){if((err as Error&{code?:string}).code==='WORKFLOW_NOT_RUNNING')setNotice('Pengujian sudah selesai.');else message(err);setStopRequested(false)}
  }
  const sendChat=async(event:React.FormEvent)=>{
    event.preventDefault()
    if(busy||!workflowId||!chatMessage.trim())return
    const text=chatMessage.trim()
    setBusyKind('chat');setStopRequested(false);setError('');setChatMessage('');setChatMessages(previous=>[...previous,{role:'Anda',text}])
    progressCursor.current=0
    let progressTimer:ReturnType<typeof setInterval>|undefined
    setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false,status:undefined,result:undefined}})))
    try{
      await save()
      progressTimer=setInterval(()=>void pollActiveNode(workflowId),500)
      void pollActiveNode(workflowId)
      const result=await workflowRequest<ExecutionResult&{runId:string}>('/'+workflowId+'/chat',{method:'POST',body:JSON.stringify({message:text,sessionId:chatSession})})
      setHistoryLoaded(false)
      if(progressTimer)clearInterval(progressTimer)
      setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false,status:undefined,result:result.nodeResults[node.id]}})))
      if(result.status==='cancelled'){setNotice('Pengujian chat dihentikan.');setChatMessages(previous=>[...previous,{role:'Sistem',text:'Pengujian dihentikan.'}]);return}
      const outputs=nodes.filter(node=>node.type==='aiAgent').flatMap(node=>result.nodeResults[node.id]?.output||[])
      const answer=outputs.map(item=>String(item.json.output||'')).filter(Boolean).join('\n\n')
      const failure=Object.values(result.nodeResults).find(item=>item.error)?.error
      setChatMessages(previous=>[...previous,{role:failure?'Error':'AI',text:failure||answer||'Tidak ada jawaban agent. Periksa koneksi dan aktifkan mode live pada AI Agent.'}])
    }catch(err){if(progressTimer)clearInterval(progressTimer);setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false,status:undefined}})));if((err as Error&{code?:string}).code==='WORKFLOW_STOPPED'){setNotice('Pengujian chat dihentikan.');setChatMessages(previous=>[...previous,{role:'Sistem',text:'Pengujian dihentikan.'}])}else setChatMessages(previous=>[...previous,{role:'Error',text:err instanceof Error?err.message:'Chat gagal dijalankan.'}])}
    finally{setStopRequested(false);setBusyKind('');setLiveProgress(null)}
  }
  const switchWorkflow=async(id:string)=>{
    if(busy||!id||id===workflowId)return
    if(dirty){
      const ok=await askConfirmation({
        title:'Pindah workflow?',
        message:'Ada perubahan pada workflow saat ini yang belum disimpan. Pindah alur akan mengabaikan perubahan tersebut.',
        confirmText:'Pindah & abaikan',
        cancelText:'Tetap di sini',
        isDanger:false
      })
      if(!ok)return
    }
    setBusyKind('loading');setError('')
    try{await loadDetail(id);setNotice('')}catch(err){message(err)}finally{setBusyKind('')}
  }
  const create=async(event:React.FormEvent)=>{
    event.preventDefault();if(busy||!newName.trim())return
    if(dirty){
      const ok=await askConfirmation({
        title:'Buat workflow baru?',
        message:'Workflow saat ini belum disimpan. Buat workflow baru dan abaikan perubahan pada draft?',
        confirmText:'Abaikan & buat baru',
        cancelText:'Batal',
        isDanger:false
      })
      if(!ok)return
    }
    setBusyKind('creating');setError('')
    try{
      const created=await workflowRequest<WorkflowItem>('',{method:'POST',body:JSON.stringify({name:newName.trim(),description:newDescription.trim(),template})})
      setWorkflows(prev=>[created,...prev]);await loadDetail(created.id);setNewOpen(false);setNewName('');setNewDescription('')
    }catch(err){message(err)}finally{setBusyKind('')}
  }
  const deleteWorkflow=async()=>{
    if(busy||!workflowId)return
    const ok=await askConfirmation({
      title:'Hapus workflow?',
      message:'Hapus workflow "'+name+'" beserta seluruh riwayat eksekusinya secara permanen? Tindakan ini tidak dapat dibatalkan.',
      confirmText:'Hapus workflow',
      cancelText:'Batal',
      isDanger:true
    })
    if(!ok)return
    setBusyKind('deleting');setError('')
    try{await workflowRequest('/'+workflowId,{method:'DELETE'});const rest=workflows.filter(w=>w.id!==workflowId);setWorkflows(rest);if(rest[0])await loadDetail(rest[0].id);else{setWorkflowId('');setName('');setIsActive(false);setWebhookToken('');setNodes([]);setEdges([]);setSelectedId(null);setDetailOpen(false);setRuns([]);setHistoryLoaded(false);setSavedStamp('');setUndoStack([]);setRedoStack([])}}
    catch(err){message(err)}finally{setBusyKind('')}
  }
  const duplicateWorkflow=async()=>{
    if(busy||!workflowId)return
    if(dirty){
      const ok=await askConfirmation({
        title:'Duplikat versi tersimpan?',
        message:'Ada perubahan belum disimpan pada draft ini. Duplikat akan menyalin versi terakhir yang tersimpan di server.',
        confirmText:'Duplikat sekarang',
        cancelText:'Batal',
        isDanger:false
      })
      if(!ok)return
    }
    setBusyKind('creating');setError('');setNotice('')
    try{
      const created=await workflowRequest<WorkflowItem>('/'+workflowId+'/duplicate',{method:'POST',body:JSON.stringify({})})
      setWorkflows(prev=>[created,...prev])
      await loadDetail(created.id)
      setNotice('Workflow berhasil diduplikat sebagai draft.')
    }catch(err){message(err)}finally{setBusyKind('')}
  }
  useEffect(()=>{
    edgeActionsRef.current={insert:openInsertOnEdge,remove:removeEdge,hover:scheduleEdgeHover}
    shortcutRef.current={save:()=>{if(!busy&&workflowId)void handleSave()},undo,redo,duplicate}
  })
  useEffect(()=>{
    const onKeyDown=(event:KeyboardEvent)=>{
      if(tab!=='editor')return
      if(!(event.ctrlKey||event.metaKey)||event.altKey)return
      const key=event.key.toLowerCase()
      if(key==='s'){event.preventDefault();shortcutRef.current.save();return}
      const target=event.target as HTMLElement|null
      if(target&&(target.tagName==='INPUT'||target.tagName==='TEXTAREA'||target.tagName==='SELECT'||target.isContentEditable))return
      if(palette||newOpen||confirmState||logSelection)return
      if(key==='z'){event.preventDefault();if(event.shiftKey)shortcutRef.current.redo();else shortcutRef.current.undo();return}
      if(key==='y'){event.preventDefault();shortcutRef.current.redo();return}
      if(key==='d'){event.preventDefault();shortcutRef.current.duplicate()}
    }
    window.addEventListener('keydown',onKeyDown)
    return()=>window.removeEventListener('keydown',onKeyDown)
  },[tab,palette,newOpen,confirmState,logSelection])
  const loadRuns=async()=>{
    if(!workflowId)return
    setRunsLoading(true);setHistoryError('')
    try{const data=await workflowRequest<{runs:RunItem[]}>('/'+workflowId+'/runs');setRuns(data.runs);setViewedRunId(data.runs[0]?.id||'');setViewedNodeId(Object.keys(data.runs[0]?.result?.nodeResults||{})[0]||'');setHistoryLoaded(true)}
    catch(err){setHistoryError(err instanceof Error?err.message:'Riwayat gagal dimuat.')}
    finally{setRunsLoading(false)}
  }
  const exportGraph=()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify({format:'sibluudz.workflow',version:1,name,...serializableGraph(nodes,edges)},null,2)],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download='sibluudz-workflow.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  const importGraph=async(file?:File)=>{
    if(!file)return
    try{
      if(file.size>1024*1024)throw new Error('Ukuran JSON maksimal 1 MB.')
      const value=JSON.parse(await file.text())
      if(value.format!=='sibluudz.workflow')throw new Error('Gunakan format JSON siBluudz. File workflow n8n belum dapat diimpor langsung.')
      const allowedTypes=new Set<string>(catalog.map(item=>String(item.type)))
      const importedNodes:StudioNode[]=Array.isArray(value.nodes)?value.nodes.filter((node:StudioNode)=>typeof node?.type==='string'&&allowedTypes.has(node.type)):[]
      const importedIds=new Set(importedNodes.map(node=>node.id))
      const importedEdges=Array.isArray(value.edges)?value.edges.filter((edge:Edge)=>importedIds.has(edge.source)&&importedIds.has(edge.target)):[]
      const removedCount=(Array.isArray(value.nodes)?value.nodes.length:0)-importedNodes.length
      const validation=validateGraph(importedNodes,importedEdges)
      if(validation.length)throw new Error(validation.join(' '))
      if(nodes.length){
        const ok=await askConfirmation({
          title:'Ganti draft workflow?',
          message:'Ganti isi alur kerja saat ini dengan workflow dari file JSON? Perubahan ini bisa dibatalkan dengan tombol Undo.',
          confirmText:'Terapkan JSON',
          cancelText:'Batal',
          isDanger:false
        })
        if(!ok)return
      }
      commit(importedNodes,importedEdges);setSelectedId(null);setDetailOpen(false);setNotice(removedCount?`${removedCount} node yang tidak tersedia dihapus dari workflow.`:'JSON berhasil diimpor ke draft. Simpan untuk menerapkan.')
    }catch(err){message(err)}
  }

  const toastError=error||historyError
  const toastText=toastError||notice||(busyKind==='loading'?'Memuat workflow…':'')
  const toast=toastText?<div className="wf-toast-region" role={toastError?'alert':'status'} aria-live={toastError?'assertive':'polite'}><div className={'wf-toast'+(toastError?' is-error':'')}><span>{toastText}</span>{toastError&&<div className="wf-toast-actions">{!workflowId&&<button type="button" disabled={busy} onClick={()=>void loadList()}>Coba lagi</button>}<button type="button" aria-label="Tutup notifikasi" onClick={()=>{setError('');setHistoryError('')}}><X size={15}/></button></div>}</div></div>:null
  return <div className="workflow-studio">
    <div className="wf-shell">
      <div className="wf-toolbar">
        <div className="wf-workflow-controls">
          <Workflow size={18} className="wf-workflow-mark" aria-hidden="true"/>
          {renaming?<div className="wf-rename"><input autoFocus aria-label="Nama workflow" maxLength={160} disabled={busy} value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim())setRenaming(false);if(event.key==='Escape'){setName(renameStart.current);setRenaming(false)}}}/><button aria-label="Selesai mengganti nama" disabled={!name.trim()} onClick={()=>setRenaming(false)}><Check size={16}/></button></div>:<label className="wf-workflow-picker"><select aria-label="Pilih workflow" value={workflowId} disabled={busy} onChange={event=>void switchWorkflow(event.target.value)}>{!workflows.length&&<option value="">Belum ada workflow</option>}{workflows.map(item=><option key={item.id} value={item.id}>{item.id===workflowId?name:item.name}</option>)}</select></label>}
          {!renaming&&<button className="wf-icon-button" aria-label="Ganti nama workflow" title="Ganti nama workflow" disabled={busy||!workflowId} onClick={()=>{renameStart.current=name;setRenaming(true)}}><Pencil size={15}/></button>}
          <button className="wf-create-button" aria-label="Workflow baru" title="Workflow baru" onClick={()=>setNewOpen(true)} disabled={busy}><Plus size={16}/><span>Baru</span></button>
        </div>
        <div className="wf-toolbar-actions"><span className={'wf-save-status'+(dirty?' is-dirty':'')} role="status">{dirty?'Belum disimpan':'Tersimpan'}</span>{hasAutomationTrigger&&<button type="button" className={'wf-active-toggle'+(isActive?' is-active':'')} aria-pressed={isActive} disabled={busy||!workflowId} onClick={()=>void toggleActive()}><Power size={14}/>{isActive?'Aktif':'Draft'}</button>}<button title="Simpan workflow (Ctrl+S)" disabled={busy||!workflowId} onClick={()=>void handleSave()}><Save size={15}/>{busyKind==='saving'?'Menyimpan…':'Simpan'}</button>{['running','chat'].includes(busyKind)?<button className="wf-stop-test" disabled={stopRequested} onClick={()=>void stopRun()}><Square size={14} fill="currentColor"/>{stopRequested?'Menghentikan…':'Stop uji'}</button>:<button className="wf-primary" disabled={busy||!workflowId} onClick={()=>void run()}><Play size={15}/>Jalankan alur</button>}</div>
      </div>
      <div className="wf-tabs-bar wf-editor-toolbar">
        <div className="wf-editor-navigation"><nav aria-label="Tampilan workflow"><button aria-pressed={tab==='editor'} onClick={()=>setTab('editor')}>Editor</button><button aria-pressed={tab==='executions'} disabled={busy||!workflowId} onClick={()=>{setTab('executions');if(!historyLoaded)void loadRuns()}}>Riwayat pengujian</button><button aria-pressed={tab==='logs'} disabled={busy||!workflowId} onClick={()=>{setTab('logs');if(!historyLoaded)void loadRuns()}}>Log</button></nav>{tab==='editor'&&<button aria-label="Tambah node" className="wf-add-node" disabled={busy||!workflowId} onClick={()=>{setPaletteTarget(null);setSearch('');setPalette(true)}}><Plus size={15}/><span>Tambah node</span></button>}</div>
        <div className="wf-editor-utilities">
          {tab==='editor'&&<><button aria-label="Asisten AI workflow" aria-expanded={assistantOpen} disabled={!workflowId} onClick={()=>{setAssistantOpen(value=>!value);setDetailOpen(false)}}><Bot size={15}/><span>Asisten AI</span></button><button aria-label="Periksa alur" aria-expanded={readinessOpen} aria-controls="wf-readiness" disabled={!workflowId} onClick={()=>setReadinessOpen(value=>!value)}>{blockingIssues.length?<AlertTriangle size={15}/>:<Check size={15}/>}<span>Periksa alur</span>{blockingIssues.length>0&&<span className="wf-readiness-count">{blockingIssues.length}</span>}</button>{nodes.some(node=>node.type==='chatTrigger')&&<button aria-expanded={chatOpen} onClick={()=>setChatOpen(value=>!value)}>Uji chat</button>}<button aria-label="Cara pakai" title="Cara pakai" className="wf-help-button" aria-expanded={guideOpen} aria-controls="wf-usage-guide" onClick={()=>setGuideOpen(value=>!value)}><BookOpen size={15}/><span>Cara pakai</span></button><span className="wf-toolbar-divider"/>
          <button aria-label="Undo" title="Urungkan perubahan (Ctrl+Z)" disabled={busy||!undoStack.length} onClick={undo}><Undo2 size={16}/></button><button aria-label="Redo" title="Ulangi perubahan (Ctrl+Y)" disabled={busy||!redoStack.length} onClick={redo}><Redo2 size={16}/></button><button aria-label="Duplikat node terpilih" title="Duplikat node terpilih (Ctrl+D)" disabled={busy||!selectedNode} onClick={duplicate}><Copy size={15}/></button><button aria-label="Rapikan alur" title="Rapikan posisi node otomatis" disabled={busy||nodes.length<2} onClick={autoLayout}><LayoutGrid size={15}/></button><button aria-label="Peta mini" aria-pressed={minimapOpen} title="Tampilkan atau sembunyikan peta mini" onClick={()=>setMinimapOpen(value=>!value)}><MapIcon size={15}/></button><button aria-label="Pas-kan kanvas" title="Pas-kan kanvas" onClick={()=>void flow.current?.fitView({padding:.4,maxZoom:1,duration:200})}><Maximize2 size={16}/></button></>}
          <details ref={workflowMenu} className="wf-workflow-menu" onKeyDown={event=>{if(event.key==='Escape')event.currentTarget.open=false}}><summary aria-label="Menu workflow" title="Menu workflow"><MoreHorizontal size={18}/></summary><div><button disabled={busy||!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;void duplicateWorkflow()}}><CopyPlus size={15}/>Duplikat workflow</button><button disabled={busy||!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;fileInput.current?.click()}}><Upload size={15}/>Impor workflow</button><button disabled={!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;exportGraph()}}><Download size={15}/>Ekspor workflow</button><button className="wf-danger" disabled={busy||!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;void deleteWorkflow()}}><Trash2 size={15}/>Hapus workflow</button></div></details>
        </div>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>{void importGraph(e.target.files?.[0]);e.target.value=''}}/>
      {tab==='editor'?<div className="wf-editor">
         {readinessOpen&&<section className="wf-readiness" id="wf-readiness" aria-label="Kesiapan workflow"><header><div><h2>{blockingIssues.length?`${blockingIssues.length} hal perlu diperbaiki`:'Siap diuji'}</h2><p>{blockingIssues.length?'Perbaiki pengaturan berikut sebelum memakai kuota AI. Klik masalah untuk membuka node.':'Konfigurasi dasar sudah lengkap. Ketersediaan model dan hasil AI diperiksa saat pengujian.'}</p></div><button type="button" aria-label="Tutup pemeriksaan alur" onClick={()=>setReadinessOpen(false)}><X size={16}/></button></header>{issues.length>0&&<ul>{issues.map((issue,index)=><li key={`${issue.nodeId||'graph'}-${issue.code}-${index}`} data-severity={issue.severity}>{issue.severity==='error'?<AlertTriangle size={15}/>:<HelpCircle size={15}/>}<span className="wf-issue-kind">{issue.severity==='error'?'Perbaiki':'Catatan'}</span>{issue.nodeId?<button disabled={busy} data-issue-node={issue.nodeId} onClick={()=>{setSelectedId(issue.nodeId!);setDetailOpen(true);void flow.current?.fitView({nodes:[{id:issue.nodeId!}],padding:.8,duration:200})}}>{issue.message}</button>:<p>{issue.message}</p>}</li>)}</ul>}</section>}
         {guideOpen&&<section className="wf-usage-guide" id="wf-usage-guide" aria-label="Cara memakai Auto Workflow"><div className="wf-guide-heading"><div><h2>Mulai dari template Instagram 3 slide</h2><p>Alurnya memisahkan validasi, strategi, copywriting, quality check, dan persetujuan.</p></div><button type="button" className="wf-section-close" aria-label="Tutup panduan" onClick={()=>setGuideOpen(false)}><X size={16}/></button></div><ol><li>Klik <strong>Buat template Instagram</strong>, beri nama workflow, lalu klik Buat workflow.</li><li>Buka <strong>Manual Trigger</strong>. Isi topik, produk, audiens, tujuan, CTA, dan pastikan <code>slideCount: 3</code>.</li><li>Periksa berurutan <strong>Cari &amp; Baca Informasi</strong>, <strong>Penentuan Topik</strong>, <strong>Validasi Fakta</strong>, dan <strong>Strategi Marketing 3 Slide</strong>. Node riset mencari topik dan membaca isi sumber sebelum diteruskan ke AI.</li><li>Tinjau <strong>Copywriting</strong> dan <strong>Quality Check</strong>. Buka <strong>Persetujuan Manual</strong> setelah pengujian, tinjau hasil masuk, lalu klik <strong>Setujui hasil ini</strong>. Jalankan ulang untuk meneruskan versi yang disetujui.</li></ol><p className="wf-guide-limit">AI Agent memakai Model AI dan Memory opsional. Pencarian internet dilakukan oleh node Cari &amp; Baca Informasi. Klik Periksa alur sebelum pengujian. Node Generate Gambar, Edit &amp; Olah Gambar, dan Post to Instagram tersedia; pilih model serta akun, lalu tinjau hasil lewat Persetujuan Manual sebelum publikasi.</p><div className="wf-guide-bottom"><button disabled={busy} onClick={()=>{setNewName('Carousel Instagram 3 Slide');setNewDescription('Topik, validasi fakta, strategi, copywriting, quality check, dan persetujuan.');setTemplate('ig-autopost');setNewOpen(true)}}><Plus size={15}/>Buat template Instagram 3 slide</button><p><strong>Urutan:</strong> Manual Trigger → Cari &amp; Baca Informasi → Penentuan Topik → Validasi Fakta → Strategi Marketing 3 Slide → Copywriting → Quality Check → Persetujuan Manual.</p></div></section>}
         <div className={'wf-canvas'+(compact?' is-compact':'')} ref={canvas}>
          {busyKind==='running'&&liveProgress&&<div className="wf-live-status" role="status" aria-live="polite"><span className="wf-live-dot"/><span className="wf-live-copy"><strong>{liveProgress.label?`Sedang mengerjakan: ${liveProgress.label}`:'Menyiapkan alur…'}</strong><small>{liveProgress.done>0?`${liveProgress.done} node selesai`:'Menunggu node pertama'}</small></span></div>}
          {compact?<div className="wf-mobile-flow">{nodes.map(node=><button key={node.id} data-mobile-node={node.id} className={'status-'+liveNodeStatus(node)} disabled={busy} onClick={()=>{setAssistantOpen(false);setSelectedId(node.id);setDetailOpen(true)}}>{!workflowNodeImages(node).length&&<strong>{node.data.label}</strong>}{workflowNodeImages(node).length>0&&<span className="wf-node-images">{workflowNodeImages(node).map((url,index)=><img key={url+index} src={url} alt={`Hasil gambar ${index+1}`} loading="lazy" draggable={false} referrerPolicy="no-referrer"/>)}</span>}<span>{workflowNodeImages(node).length?`Selesai - ${((node.data.result?.durationMs||0)/1000).toFixed(1)} s`:`${catalog.find(item=>item.type===node.type)?.title||node.type} · ${liveStatusText(liveNodeStatus(node))}`}</span>{!workflowNodeImages(node).length&&<span>{edges.filter(edge=>edge.source===node.id).map(edge=>(edge.sourceHandle==='true'?'True → ':edge.sourceHandle==='false'?'False → ':edge.sourceHandle?`${edge.sourceHandle} → `:'→ ')+(nodes.find(n=>n.id===edge.target)?.data.label||edge.target)).join(' · ')||'Akhir cabang'}</span>}</button>)}</div>:(()=>{
            const nodeStatusById=new Map(nodes.map(node=>[node.id,liveNodeStatus(node)]))
            return <ReactFlow<StudioNode,Edge>
              proOptions={{hideAttribution:true}}
              nodes={nodes.map(node=>({...node,data:{...node.data,onAddResource:(type:string)=>addNode(type,node.id),connectedAiResources:node.type==='aiAgent'?Object.keys(aiPorts).filter(resource=>edges.some(edge=>edge.target===node.id&&edge.targetHandle===aiPorts[resource])):[]}}))}
              edges={edges.map(edge=>{
                const ai=isAiConnection(edge)
                const flowState=edgeFlowState(edge,nodeStatusById)
                return {
                  ...edge,
                  type:'workflow',
                  animated:false,
                  markerEnd:{type:MarkerType.ArrowClosed,width:18,height:18,color:edgeStrokeColor(flowState,Boolean(edge.selected))},
                  data:{
                    isAi:ai,
                    flowState,
                    branchLabel:branchLabelForHandle(edge.sourceHandle),
                    hovered:hoveredEdgeId===edge.id,
                    busy,
                    onHoverChange:(id:string|null)=>edgeActionsRef.current.hover(id),
                    onInsert:(id:string)=>edgeActionsRef.current.insert(id),
                    onDelete:(id:string)=>edgeActionsRef.current.remove(id),
                  },
                }
              })}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionLineType={ConnectionLineType.Bezier}
              onInit={instance=>{flow.current=instance}}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={connect}
              onConnectEnd={handleConnectEnd}
              onEdgeMouseEnter={(_,edge)=>edgeActionsRef.current.hover(edge.id)}
              onEdgeMouseLeave={()=>edgeActionsRef.current.hover(null)}
              isValidConnection={canConnect}
              onNodeDragStart={remember}
              onNodeClick={(_,node)=>{setAssistantOpen(false);setSelectedId(node.id);setDetailOpen(true)}}
              onPaneClick={()=>{setSelectedId(null);setDetailOpen(false);setHoveredEdgeId(null)}}
              nodesDraggable={!busy}
              nodesConnectable={!busy}
              elementsSelectable={!busy}
              deleteKeyCode={busy?null:['Backspace','Delete']}
              fitView
              fitViewOptions={{padding:.4,maxZoom:1}}
              minZoom={.25}
              maxZoom={1.7}
            >
              <Background gap={24} size={1.5} color="var(--wf-control)"/>
              <Controls showInteractive={false}/>
              {minimapOpen&&<MiniMap pannable zoomable nodeColor={node=>minimapNodeColor(node.type)}/>}
            </ReactFlow>
          })()}
          {!nodes.length&&<div className="wf-empty-canvas"><Workflow size={28}/><h2>{workflowId?'Mulai dengan trigger':'Buat workflow pertama'}</h2><p>{workflowId?'Tambahkan node pemicu, lalu hubungkan langkah berikutnya.':'Pilih template alur data atau mulai dari kanvas kosong.'}</p><button disabled={busy} onClick={()=>{if(workflowId){setPaletteTarget(null);setSearch('');setPalette(true)}else setNewOpen(true)}}><Plus size={16}/>{workflowId?'Tambah node':'Workflow baru'}</button></div>}
          {workflowId&&<WorkflowAssistantPanel key={workflowId} workflowId={workflowId} nodes={nodes} edges={edges} busy={busy} visible={assistantOpen} initialDraft={assistantDrafts.current.get(workflowId)||''} onDraftChange={draft=>assistantDrafts.current.set(workflowId,draft)} onApply={(nextNodes,nextEdges)=>{commit(nextNodes,nextEdges);setSelectedId(null);setDetailOpen(false);setNotice('Usulan asisten diterapkan ke draft. Periksa lalu simpan.') }} onClose={()=>setAssistantOpen(false)}/>}
          {detailOpen&&selectedNode&&<NodeSettingsPanel key={selectedNode.id} workflowId={workflowId} webhookToken={webhookToken} onGenerateWebhookToken={generateWebhookToken} node={selectedNode} nodes={nodes} edges={edges} busy={busy} onUpdate={updateNode} onDelete={removeNode} onClose={()=>setDetailOpen(false)} onExecute={id=>void run(id)} onSelect={id=>{setSelectedId(id);setDetailOpen(true)}} onAddResource={addNode}/>}
          {toast}
        </div>
        {chatOpen&&<section className="wf-test-chat" aria-label="Uji chat workflow"><header><div><h3>Uji chat</h3><p>Setiap pesan menjalankan workflow dan memakai kuota model 9router.</p></div><button disabled={busy} onClick={()=>{setChatMessages([]);setChatSession(crypto.randomUUID())}}>Sesi baru</button><button type="button" className="wf-section-close" aria-label="Tutup uji chat" onClick={()=>setChatOpen(false)}><X size={16}/></button></header><div className="wf-chat-messages" aria-live="polite">{!chatMessages.length?<p className="wf-muted">Pilih Model AI, tambahkan Memory bila percakapan perlu diingat, lalu kirim pesan.</p>:chatMessages.map((message,index)=><article key={index} className={message.role==='Error'?'wf-error':''}><strong>{message.role}</strong><p>{message.text}</p></article>)}{busyKind==='chat'&&<p role="status">AI Agent sedang memproses…</p>}</div><form onSubmit={event=>void sendChat(event)}><label className="wf-field"><span>Pesan untuk AI Agent</span><textarea rows={2} maxLength={16000} value={chatMessage} disabled={busy} onChange={event=>setChatMessage(event.target.value)} placeholder="Contoh: Buat rencana carousel 3 slide untuk produk saya"/></label><button className="wf-primary" disabled={busy||!chatMessage.trim()} type="submit"><Send size={15}/>Kirim</button></form></section>}
        <div className="wf-canvas-footer"><span>{nodes.length} node · {edges.length} koneksi</span><span>Garis utuh: alur data · Garis putus: sub-node AI · Tarik kabel ke area kosong untuk tambah node</span></div>
      </div>:tab==='executions'?<div className="wf-executions">
         <header><div><h2>Riwayat pengujian</h2><p className="wf-muted">Pilih pengujian untuk melihat langkah, input, dan outputnya.</p></div><button disabled={runsLoading} onClick={()=>void loadRuns()}><RefreshCw size={14}/>Muat ulang</button></header>
        {runsLoading?<p role="status">Memuat riwayat…</p>:!runs.length?<div className="wf-empty-history"><h3>Belum ada eksekusi</h3><p>Klik Jalankan alur di editor untuk merekam input dan output node.</p></div>:<div className="wf-history-grid">
           <div className="wf-run-list" aria-label="Daftar pengujian">{runs.map(item=><button key={item.id} aria-pressed={viewedRunId===item.id} onClick={()=>{setViewedRunId(item.id);setViewedNodeId(Object.keys(item.result?.nodeResults||{})[0]||'')}}><strong><span className={'wf-history-status status-'+item.status}>{item.status==='error'?'Error':item.status==='cancelled'?'Dihentikan':item.status==='waiting_approval'?'Menunggu persetujuan':'Selesai'}</span> · {triggerTypeLabel(item.trigger_type)}</strong><span>{new Date(item.started_at.replace(' ','T')+'Z').toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</span><span>{Object.keys(item.result?.nodeResults||{}).length} node diperiksa</span></button>)}</div>
           <section className="wf-run-detail"><header className="wf-run-detail-header"><div><h3>Detail pengujian</h3>{viewedRun&&<p className="wf-muted">{new Date(viewedRun.started_at.replace(' ','T')+'Z').toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · {triggerTypeLabel(viewedRun.trigger_type)}</p>}</div>{viewedRun&&<span className={'wf-history-status status-'+viewedRun.status}>{viewedRun.status==='error'?'Error':viewedRun.status==='cancelled'?'Dihentikan':viewedRun.status==='waiting_approval'?'Menunggu persetujuan':'Selesai'}</span>}</header>{!Object.keys(viewedResults).length?<p>Pengujian ini belum memiliki rincian input dan output per node.</p>:<><label className="wf-field"><span>Pilih node untuk diperiksa</span><select value={viewedNodeId} onChange={e=>setViewedNodeId(e.target.value)}>{Object.values(viewedResults).map(result=><option key={result.nodeId} value={result.nodeId}>{result.label} · {liveStatusText(result.status)}</option>)}</select></label>{viewedResult&&<><p className="wf-history-node-meta">{liveStatusText(viewedResult.status)} <span>· {viewedResult.durationMs} ms · {viewedResult.output.length} hasil</span></p>{viewedResult.error&&<p role="alert" className="wf-error">{viewedResult.error}</p>}<div className="wf-history-output"><h4>Hasil langkah</h4><DataViewer items={viewedResult.output}/></div><details className="wf-history-input" key={`${viewedRunId}-${viewedNodeId}`}><summary>Bahan masuk <span>{viewedResult.input.length} item</span></summary>{viewedResult.input.length?<DataViewer items={viewedResult.input}/>:<p className="wf-muted">Langkah pemicu ini memulai alur tanpa bahan masuk.</p>}</details></>}</>}</section>
        </div>}
      </div>:<div className="wf-executions wf-log-panel">
        <header><div><h2>Log</h2><p className="wf-muted">Catatan keberhasilan, error, notifikasi, dan status setiap langkah workflow.</p></div><button disabled={runsLoading} onClick={()=>void loadRuns()}><RefreshCw size={14}/>Muat ulang</button></header>
        {runsLoading?<p role="status">Memuat log…</p>:!workflowLogs.length?<div className="wf-empty-history"><ScrollText size={22}/><h3>Belum ada log</h3><p>Log akan muncul setelah workflow atau satu langkah dijalankan.</p></div>:<div className="wf-log-list" aria-label="Log workflow">{workflowLogs.map((log,index)=><article key={`${log.runId}-${log.time}-${index}`} className={'wf-log-entry status-'+log.status} role="button" tabIndex={0} aria-label={`Lihat hasil ${log.step}`} onClick={()=>setLogSelection(log)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setLogSelection(log)}}}><div className="wf-log-icon">{log.status==='success'?<Check size={15}/>:log.status==='error'?<AlertTriangle size={15}/>:<ScrollText size={15}/>}</div><div className="wf-log-copy"><div><strong>{log.step}</strong><span className="wf-log-status">{log.status}</span></div><p>{log.message}</p><small>{new Date(log.time).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · Pengujian {log.runId.slice(0,8)}</small></div></article>)}</div>}
      </div>}
    </div>
    {tab==='executions'&&toast}
    <dialog ref={logResultDialog} className="wf-log-result-dialog" aria-labelledby="wf-log-result-title" onCancel={()=>setLogSelection(null)} onClose={()=>setLogSelection(null)}>
      <header className="wf-dialog-heading"><div><h2 id="wf-log-result-title">{logSelection?.step||'Hasil node'}</h2><p>{logSelection?.message}</p></div><button type="button" className="wf-dialog-close" aria-label="Tutup hasil node" onClick={()=>setLogSelection(null)}><X size={18}/></button></header>
      <div className="wf-log-result-body">{logResult?<>{logResult.error&&<p role="alert" className="wf-error">{logResult.error}</p>}<DataViewer key={logSelection?.runId+'-'+logSelection?.nodeId} items={logResult.output}/><details className="wf-history-input"><summary>Bahan masuk</summary><DataViewer items={logResult.input}/></details></>:<p className="wf-muted">Log ini tidak memiliki hasil node yang tersimpan.</p>}</div>
    </dialog>
    <dialog ref={paletteDialog} className="wf-palette-dialog" onCancel={()=>{setPalette(false);setPaletteTarget(null)}} onClose={()=>{setPalette(false);setPaletteTarget(null)}}><header className="wf-dialog-heading"><div><h2>{paletteTarget?.mode==='insert-edge'?'Sisipkan node':'Tambah node'}</h2><p>{paletteTarget?.mode==='connect-drop'?`Sambungkan node baru dari "${paletteTarget.sourceLabel}".`:paletteTarget?.mode==='insert-edge'?`Sisipkan node di antara "${paletteTarget.sourceLabel}" dan "${paletteTarget.targetLabel}".`:'Pilih node berdasarkan tugas yang ingin Anda lakukan.'}</p></div><button type="button" className="wf-dialog-close" aria-label="Tutup katalog node" onClick={()=>{setPalette(false);setPaletteTarget(null)}}><X size={18}/></button></header><div className="wf-palette-content"><label className="wf-search"><Search size={16}/><input aria-label="Cari node" placeholder="Cari node…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{['Pemicu','Data','Logika','AI','Publikasi'].map(group=>{const filteredCatalog=paletteTarget?availableCatalog.filter(item=>!isTrigger(item.type)):availableCatalog;const matches=filteredCatalog.filter(item=>item.group===group&&(item.title+' '+item.description).toLowerCase().includes(search.toLowerCase()));return matches.length>0&&<section key={group}><h3>{group}</h3>{matches.map(item=>{const Icon=iconForWorkflowNode(item.type);return <button key={item.type} disabled={busy} data-add-node={item.type} onClick={()=>addNode(item.type)}><span className={"wf-palette-icon wf-kind-"+item.type}><Icon size={18}/></span><span className="wf-palette-copy"><strong>{item.title}</strong><span>{item.description}</span></span><Plus className="wf-palette-plus" size={16}/></button>})}</section>})}{!(paletteTarget?availableCatalog.filter(item=>!isTrigger(item.type)):availableCatalog).some(item=>(item.title+' '+item.description).toLowerCase().includes(search.toLowerCase()))&&<p>Tidak ada node yang cocok.</p>}</div></dialog>
    <dialog ref={createDialog} className="wf-create-dialog" onCancel={e=>{if(busy)e.preventDefault();else setNewOpen(false)}} onClose={()=>setNewOpen(false)}><header className="wf-dialog-heading"><div><h2>Workflow baru</h2><p>Pilih titik awal untuk alurmu.</p></div><button type="button" className="wf-dialog-close" disabled={busy} aria-label="Tutup workflow baru" onClick={()=>setNewOpen(false)}><X size={18}/></button></header><form onSubmit={create}><label className="wf-field"><span>Nama workflow</span><input required maxLength={160} value={newName} disabled={busy} onChange={e=>setNewName(e.target.value)} placeholder="Contoh: Alur persetujuan konten"/></label><label className="wf-field"><span>Deskripsi (opsional)</span><textarea rows={2} maxLength={2000} value={newDescription} disabled={busy} onChange={e=>setNewDescription(e.target.value)} placeholder="Tujuan dan konteks workflow"/></label><label className="wf-field"><span>Template awal</span><select value={template} disabled={busy} onChange={e=>setTemplate(e.target.value)}><option value="starter">Alur sederhana · Mulai → Atur informasi → Cek kondisi</option><option value="blank">Kanvas kosong</option><option value="chat-agent">AI Agent · Model, ingatan, dan brief</option><option value="ig-research">Riset Instagram · AI + pencarian 5 halaman</option><option value="ig-autopost">Instagram carousel · rencana sampai persetujuan (pratinjau)</option></select></label><p className="wf-muted">Semua workflow dibuat sebagai draft. Template integrasi hanya menyiapkan konfigurasi.</p><button className="wf-primary" disabled={busy||!newName.trim()} type="submit">{busyKind==='creating'?'Membuat…':'Buat workflow'}</button></form></dialog>
    <dialog ref={confirmDialog} className="wf-confirm-dialog" onCancel={e=>{e.preventDefault();handleCancelConfirm()}} onClose={handleCancelConfirm}>
      {confirmState&&<div className="wf-confirm-content">
        <div className="wf-confirm-header">
          <div className={'wf-confirm-icon'+(confirmState.isDanger?' is-danger':'')}>
            {confirmState.isDanger?<AlertTriangle size={20}/>:<HelpCircle size={20}/>}
          </div>
          <div className="wf-confirm-text">
            <h3>{confirmState.title}</h3>
            <p>{confirmState.message}</p>
          </div>
        </div>
        <div className="wf-confirm-actions">
          <button type="button" disabled={busy} onClick={handleCancelConfirm}>{confirmState.cancelText||'Batal'}</button>
          <button type="button" autoFocus disabled={busy} className={confirmState.isDanger?'wf-confirm-danger-btn':'wf-primary'} onClick={handleConfirm}>{confirmState.confirmText||'Lanjutkan'}</button>
        </div>
      </div>}
    </dialog>
  </div>
}
export function WorkflowStudioPage(){return <ReactFlowProvider><Studio/></ReactFlowProvider>}
