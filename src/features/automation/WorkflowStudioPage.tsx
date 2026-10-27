import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, ReactFlowProvider, Controls, Background, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType, type Edge, type NodeChange, type EdgeChange, type Connection, type ReactFlowInstance } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Play, Square, Save, Plus, Undo2, Redo2, Download, Upload, X, Search, Trash2, Copy, Workflow, Maximize2, RefreshCw, Send, BookOpen, Pencil, MoreHorizontal, Check, AlertTriangle, HelpCircle, Bot } from 'lucide-react'
import { TriggerNode, AiAgentNode, SetNode, SplitOutNode, IfNode, ChatTriggerNode, ChatModelNode, MemoryNode, ToolNode } from './CustomNodes'
import { DataViewer, NodeSettingsPanel } from './NodeSettingsPanel'
import { WorkflowAssistantPanel } from './WorkflowAssistantPanel'
import { iconForWorkflowNode } from './workflow-node-icons'
import { catalog, availableCatalog, ports, serializableGraph, graphStamp, workflowRequest, type StudioNode, type WorkflowItem, type RunItem, type ExecutionResult } from './workflow-model'
import { validateGraph } from '../../../shared/workflow-engine'
import { inspectWorkflow } from '../../../shared/workflow-readiness'
import { aiPorts, isSubNode, isTrigger, isAiConnection } from '../../../shared/workflow-connections'
import './workflow-studio.css'

const nodeTypes={trigger:TriggerNode,promptTrigger:TriggerNode,chatTrigger:ChatTriggerNode,chatModel:ChatModelNode,memory:MemoryNode,tool:ToolNode,aiAgent:AiAgentNode,set:SetNode,splitOut:SplitOutNode,if:IfNode,approval:IfNode,searchContent:SetNode,httpRequest:SetNode,googleDrive:SetNode,imageGenerate:SetNode,instagram:SetNode}
type Snapshot={nodes:StudioNode[];edges:Edge[]}
type ConfirmDialogState={title:string;message:string;confirmText?:string;cancelText?:string;isDanger?:boolean}
function Studio() {
  const [workflows,setWorkflows]=useState<WorkflowItem[]>([])
  const [workflowId,setWorkflowId]=useState('')
  const [name,setName]=useState('')
  const [renaming,setRenaming]=useState(false)
  const [nodes,setNodes]=useState<StudioNode[]>([])
  const [edges,setEdges]=useState<Edge[]>([])
  const [selectedId,setSelectedId]=useState<string|null>(null)
  const [detailOpen,setDetailOpen]=useState(false)
  const [tab,setTab]=useState<'editor'|'executions'>('editor')
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
  const [undoStack,setUndoStack]=useState<Snapshot[]>([])
  const [redoStack,setRedoStack]=useState<Snapshot[]>([])
  const [confirmState,setConfirmState]=useState<ConfirmDialogState|null>(null)
  const confirmResolver=useRef<((value:boolean)=>void)|null>(null)
  const confirmDialog=useRef<HTMLDialogElement>(null)
  const [compact,setCompact]=useState(()=>window.matchMedia('(max-width:600px)').matches)
  const canvas=useRef<HTMLDivElement>(null)
  const flow=useRef<ReactFlowInstance<StudioNode,Edge>|null>(null)
  const fileInput=useRef<HTMLInputElement>(null)
  const createDialog=useRef<HTMLDialogElement>(null)
  const paletteDialog=useRef<HTMLDialogElement>(null)
  const workflowMenu=useRef<HTMLDetailsElement>(null)
  const renameStart=useRef('')
  const busy=Boolean(busyKind)
  const stamp=graphStamp(name,nodes,edges)
  const dirty=Boolean(workflowId&&savedStamp!==stamp)
  const issues=useMemo(()=>inspectWorkflow(nodes,edges),[nodes,edges])
  const blockingIssues=issues.filter(issue=>issue.severity==='error')
  const selectedNode=nodes.find(node=>node.id===selectedId)
  const viewedRun=runs.find(run=>run.id===viewedRunId)
  const viewedResults=viewedRun?.result?.nodeResults||{}
  const viewedResult=viewedResults[viewedNodeId]

  const loadDetail=useCallback(async(id:string)=>{
    const {workflow}=await workflowRequest<{workflow:{id:string;name:string;nodes:StudioNode[];edges:Edge[]}}>('/'+id)
    const preparedNodes=workflow.nodes.map(node=>{
      if(node.type==='splitOut')return {...node,data:{...node.data,label:'Split Out',splitCount:String(node.data.splitCount||'3'),sourceField:'output',arrayField:'prompts'}}
      if(node.type==='chatTrigger'&&node.data.label==='Mulai dari Chat')return {...node,data:{...node.data,label:'Chat Trigger'}}
      if(node.type==='trigger'&&node.data.label==='Jalankan Manual')return {...node,data:{...node.data,label:'Manual Trigger'}}
      if(node.type==='aiAgent'&&['Agent AI','Asisten AI'].includes(String(node.data.label)))return {...node,data:{...node.data,label:'AI Agent'}}
      return node
    })
    setWorkflowId(workflow.id);setName(workflow.name);setNodes(preparedNodes);setEdges(workflow.edges)
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
    const observer=new ResizeObserver(entries=>{if(entries[0]?.contentRect.width>0){clearTimeout(timer);timer=setTimeout(()=>void flow.current?.fitView({padding:.25,duration:0}),120)}})
    observer.observe(canvas.current)
    return()=>{observer.disconnect();clearTimeout(timer)}
  },[compact,tab])
  useEffect(()=>{if(newOpen)createDialog.current?.showModal();else createDialog.current?.close()},[newOpen])
  useEffect(()=>{if(palette)paletteDialog.current?.showModal();else paletteDialog.current?.close()},[palette])
  useEffect(()=>{if(confirmState)confirmDialog.current?.showModal();else confirmDialog.current?.close()},[confirmState])
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
  useEffect(()=>{if(workflowId&&tab==='editor'){const timer=setTimeout(()=>void flow.current?.fitView({padding:.25,duration:200}),100);return()=>clearTimeout(timer)}},[workflowId,tab])
  useEffect(()=>{
    const handler=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue=''}}
    window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler)
  },[dirty])
  const message=(err:unknown)=>setError(err instanceof Error?err.message:'Permintaan gagal.')
  const pollActiveNode=async(id:string)=>{
    try{
      const data=await workflowRequest<{active?:{nodeId?:string}}>(`/${id}/active`)
      const current=data.active?.nodeId||''
      setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:Boolean(current&&node.id===current)}})))
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
  const connect=(connection:Connection)=>{if(!busy&&canConnect(connection))commit(nodes,addEdge({...connection,id:crypto.randomUUID(),type:'smoothstep'},edges))}
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
    const anchor=sub?nodes.find(node=>node.id===(parentId||selectedId)&&node.type==='aiAgent'):nodes.find(node=>node.id===selectedId&&!isSubNode(node.type))||[...nodes].reverse().find(node=>!isSubNode(node.type))
    if(sub&&anchor&&type==='chatModel'&&edges.some(edge=>edge.target===anchor.id&&edge.targetHandle===aiPorts.chatModel)){setNotice('AI Agent sudah memiliki Model AI. Gunakan Model AI yang terhubung.');return}
    const node:StudioNode={id:crypto.randomUUID(),type,position:anchor?sub?{x:anchor.position.x+(['chatModel','memory','tool'].indexOf(type)-1)*230,y:anchor.position.y+260}:{x:anchor.position.x+340,y:anchor.position.y+(anchor.type==='if'?140:0)}:{x:100,y:180},data:{...definition.data}}
    let nextEdges=edges
    if(anchor&&sub){
      if(type!=='tool'&&edges.some(edge=>edge.target===anchor.id&&edge.targetHandle===aiPorts[type])){setNotice('Port ini sudah terhubung. Buka sub-node yang ada untuk mengubah pengaturan.');return}
      nextEdges=addEdge({id:crypto.randomUUID(),source:node.id,sourceHandle:aiPorts[type],target:anchor.id,targetHandle:aiPorts[type],type:'smoothstep'},edges)
    }else if(anchor&&!isTrigger(type))nextEdges=addEdge({id:crypto.randomUUID(),source:anchor.id,sourceHandle:anchor.type==='if'?'true':ports(anchor.type).output,target:node.id,targetHandle:ports(type).input,type:'smoothstep'},edges)
    commit([...nodes,node],nextEdges);setPalette(false);setSelectedId(node.id);setDetailOpen(true)
  }
  const duplicate=()=>{
    if(!selectedNode||busy)return
    const {result:_result,running:_running,...data}=selectedNode.data
    commit([...nodes,{...selectedNode,id:crypto.randomUUID(),position:{x:selectedNode.position.x,y:selectedNode.position.y+160},selected:false,data}],edges)
  }
  const save=async()=>{
    if(!workflowId||!name.trim())throw new Error('Nama workflow wajib diisi.')
    const validation=validateGraph(nodes,edges)
    if(validation.length)throw new Error(validation.join(' '))
    const clean=serializableGraph(nodes,edges)
    await workflowRequest('/'+workflowId,{method:'PUT',body:JSON.stringify({name:name.trim(),...clean,isActive:false})})
    setSavedStamp(stamp);setWorkflows(prev=>prev.map(item=>item.id===workflowId?{...item,name:name.trim()}:item))
  }
  const handleSave=async()=>{setBusyKind('saving');setError('');setNotice('');try{await save()}catch(err){message(err)}finally{setBusyKind('')}}
  const run=async(nodeId?:string)=>{
    if(busy||!workflowId)return
    if(inspectWorkflow(nodes,edges,nodeId).some(issue=>issue.severity==='error')){setTab('editor');setReadinessOpen(true);setDetailOpen(false);return}
    setBusyKind('running');setStopRequested(false);setError('');setNotice('')
    setNodes(prev=>prev.map(node=>({...node,data:{...node.data,result:undefined,running:false}})))
    let progressTimer:ReturnType<typeof setInterval>|undefined
    try{
      await save()
      progressTimer=setInterval(()=>void pollActiveNode(workflowId),250)
      void pollActiveNode(workflowId)
      const result=await workflowRequest<ExecutionResult&{runId:string}>('/'+workflowId+(nodeId?'/test-node':'/execute'),{method:'POST',body:JSON.stringify(nodeId?{nodeId}:{})})
       setHistoryLoaded(false)
       if(progressTimer)clearInterval(progressTimer)
       setNodes(prev=>prev.map(node=>({...node,data:{...node.data,running:false,result:result.nodeResults[node.id]}})))
       setNotice(result.status==='cancelled'?'Pengujian dihentikan.':result.status==='error'?'Pengujian berhenti pada node yang error. Buka node untuk melihat penyebabnya.':result.status==='waiting_approval'?'Alur menunggu persetujuan. Buka node Persetujuan Manual untuk meninjau hasil.':'Pengujian selesai. Periksa input dan output setiap node.')
    }catch(err){if(progressTimer)clearInterval(progressTimer);if((err as Error&{code?:string}).code==='WORKFLOW_STOPPED')setNotice('Pengujian dihentikan.');else message(err);setNodes(prev=>prev.map(node=>({...node,data:{...node.data,running:false}})))}
    finally{setStopRequested(false);setBusyKind('')}
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
    let progressTimer:ReturnType<typeof setInterval>|undefined
    setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false}})))
    try{
      await save()
      progressTimer=setInterval(()=>void pollActiveNode(workflowId),250)
      void pollActiveNode(workflowId)
      const result=await workflowRequest<ExecutionResult&{runId:string}>('/'+workflowId+'/chat',{method:'POST',body:JSON.stringify({message:text,sessionId:chatSession})})
       setHistoryLoaded(false)
       if(progressTimer)clearInterval(progressTimer)
       setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false,result:result.nodeResults[node.id]}})))
      if(result.status==='cancelled'){setNotice('Pengujian chat dihentikan.');setChatMessages(previous=>[...previous,{role:'Sistem',text:'Pengujian dihentikan.'}]);return}
      const outputs=nodes.filter(node=>node.type==='aiAgent').flatMap(node=>result.nodeResults[node.id]?.output||[])
      const answer=outputs.map(item=>String(item.json.output||'')).filter(Boolean).join('\n\n')
      const failure=Object.values(result.nodeResults).find(item=>item.error)?.error
      setChatMessages(previous=>[...previous,{role:failure?'Error':'AI',text:failure||answer||'Tidak ada jawaban agent. Periksa koneksi dan aktifkan mode live pada AI Agent.'}])
    }catch(err){if(progressTimer)clearInterval(progressTimer);setNodes(previous=>previous.map(node=>({...node,data:{...node.data,running:false}})));if((err as Error&{code?:string}).code==='WORKFLOW_STOPPED'){setNotice('Pengujian chat dihentikan.');setChatMessages(previous=>[...previous,{role:'Sistem',text:'Pengujian dihentikan.'}])}else setChatMessages(previous=>[...previous,{role:'Error',text:err instanceof Error?err.message:'Chat gagal dijalankan.'}])}
    finally{setStopRequested(false);setBusyKind('')}
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
     try{await workflowRequest('/'+workflowId,{method:'DELETE'});const rest=workflows.filter(w=>w.id!==workflowId);setWorkflows(rest);if(rest[0])await loadDetail(rest[0].id);else{setWorkflowId('');setName('');setNodes([]);setEdges([]);setSelectedId(null);setDetailOpen(false);setRuns([]);setHistoryLoaded(false);setSavedStamp('');setUndoStack([]);setRedoStack([])}}
    catch(err){message(err)}finally{setBusyKind('')}
  }
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
  return <div className="workflow-studio">
    <div className="wf-shell">
      <div className="wf-toolbar">
        <div className="wf-workflow-controls">
          <Workflow size={18} className="wf-workflow-mark" aria-hidden="true"/>
          {renaming?<div className="wf-rename"><input autoFocus aria-label="Nama workflow" maxLength={160} disabled={busy} value={name} onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim())setRenaming(false);if(event.key==='Escape'){setName(renameStart.current);setRenaming(false)}}}/><button aria-label="Selesai mengganti nama" disabled={!name.trim()} onClick={()=>setRenaming(false)}><Check size={16}/></button></div>:<label className="wf-workflow-picker"><select aria-label="Pilih workflow" value={workflowId} disabled={busy} onChange={event=>void switchWorkflow(event.target.value)}>{!workflows.length&&<option value="">Belum ada workflow</option>}{workflows.map(item=><option key={item.id} value={item.id}>{item.id===workflowId?name:item.name}</option>)}</select></label>}
          {!renaming&&<button className="wf-icon-button" aria-label="Ganti nama workflow" title="Ganti nama workflow" disabled={busy||!workflowId} onClick={()=>{renameStart.current=name;setRenaming(true)}}><Pencil size={15}/></button>}
          <button className="wf-create-button" aria-label="Workflow baru" title="Workflow baru" onClick={()=>setNewOpen(true)} disabled={busy}><Plus size={16}/><span>Baru</span></button>
        </div>
        <div className="wf-toolbar-actions"><span className={'wf-save-status'+(dirty?' is-dirty':'')} role="status">{dirty?'Belum disimpan':'Tersimpan'}</span><button disabled={busy||!workflowId} onClick={()=>void handleSave()}><Save size={15}/>{busyKind==='saving'?'Menyimpan…':'Simpan'}</button>{['running','chat'].includes(busyKind)?<button className="wf-stop-test" disabled={stopRequested} onClick={()=>void stopRun()}><Square size={14} fill="currentColor"/>{stopRequested?'Menghentikan…':'Stop uji'}</button>:<button className="wf-primary" disabled={busy||!workflowId} onClick={()=>void run()}><Play size={15}/>Jalankan alur</button>}</div>
      </div>
      <div className="wf-tabs-bar wf-editor-toolbar">
        <div className="wf-editor-navigation"><nav aria-label="Tampilan workflow"><button aria-pressed={tab==='editor'} onClick={()=>setTab('editor')}>Editor</button><button aria-pressed={tab==='executions'} disabled={busy||!workflowId} onClick={()=>{setTab('executions');if(!historyLoaded)void loadRuns()}}>Riwayat pengujian</button></nav>{tab==='editor'&&<button aria-label="Tambah node" className="wf-add-node" disabled={busy||!workflowId} onClick={()=>{setSearch('');setPalette(true)}}><Plus size={15}/><span>Tambah node</span></button>}</div>
        <div className="wf-editor-utilities">
          {tab==='editor'&&<><button aria-label="Asisten AI workflow" aria-expanded={assistantOpen} disabled={!workflowId} onClick={()=>{setAssistantOpen(value=>!value);setDetailOpen(false)}}><Bot size={15}/><span>Asisten AI</span></button><button aria-label="Periksa alur" aria-expanded={readinessOpen} aria-controls="wf-readiness" disabled={!workflowId} onClick={()=>setReadinessOpen(value=>!value)}>{blockingIssues.length?<AlertTriangle size={15}/>:<Check size={15}/>}<span>Periksa alur</span>{blockingIssues.length>0&&<span className="wf-readiness-count">{blockingIssues.length}</span>}</button>{nodes.some(node=>node.type==='chatTrigger')&&<button aria-expanded={chatOpen} onClick={()=>setChatOpen(value=>!value)}>Uji chat</button>}<button aria-label="Cara pakai" title="Cara pakai" className="wf-help-button" aria-expanded={guideOpen} aria-controls="wf-usage-guide" onClick={()=>setGuideOpen(value=>!value)}><BookOpen size={15}/><span>Cara pakai</span></button><span className="wf-toolbar-divider"/>
          <button aria-label="Undo" title="Urungkan perubahan" disabled={busy||!undoStack.length} onClick={undo}><Undo2 size={16}/></button><button aria-label="Redo" title="Ulangi perubahan" disabled={busy||!redoStack.length} onClick={redo}><Redo2 size={16}/></button><button aria-label="Duplikat node terpilih" title="Duplikat node terpilih" disabled={busy||!selectedNode} onClick={duplicate}><Copy size={15}/></button><button aria-label="Pas-kan kanvas" title="Pas-kan kanvas" onClick={()=>void flow.current?.fitView({padding:.25,duration:200})}><Maximize2 size={16}/></button></>}
          <details ref={workflowMenu} className="wf-workflow-menu" onKeyDown={event=>{if(event.key==='Escape')event.currentTarget.open=false}}><summary aria-label="Menu workflow" title="Menu workflow"><MoreHorizontal size={18}/></summary><div><button disabled={busy||!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;fileInput.current?.click()}}><Upload size={15}/>Impor workflow</button><button disabled={!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;exportGraph()}}><Download size={15}/>Ekspor workflow</button><button className="wf-danger" disabled={busy||!workflowId} onClick={()=>{if(workflowMenu.current)workflowMenu.current.open=false;void deleteWorkflow()}}><Trash2 size={15}/>Hapus workflow</button></div></details>
        </div>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e=>{void importGraph(e.target.files?.[0]);e.target.value=''}}/>
      {tab==='editor'?<div className="wf-editor">
         {readinessOpen&&<section className="wf-readiness" id="wf-readiness" aria-label="Kesiapan workflow"><header><div><h2>{blockingIssues.length?`${blockingIssues.length} hal perlu diperbaiki`:'Siap diuji'}</h2><p>{blockingIssues.length?'Perbaiki pengaturan berikut sebelum memakai kuota AI. Klik masalah untuk membuka node.':'Konfigurasi dasar sudah lengkap. Ketersediaan model dan hasil AI diperiksa saat pengujian.'}</p></div><button type="button" aria-label="Tutup pemeriksaan alur" onClick={()=>setReadinessOpen(false)}><X size={16}/></button></header>{issues.length>0&&<ul>{issues.map((issue,index)=><li key={`${issue.nodeId||'graph'}-${issue.code}-${index}`} data-severity={issue.severity}>{issue.severity==='error'?<AlertTriangle size={15}/>:<HelpCircle size={15}/>}<span className="wf-issue-kind">{issue.severity==='error'?'Perbaiki':'Catatan'}</span>{issue.nodeId?<button disabled={busy} data-issue-node={issue.nodeId} onClick={()=>{setSelectedId(issue.nodeId!);setDetailOpen(true);void flow.current?.fitView({nodes:[{id:issue.nodeId!}],padding:.8,duration:200})}}>{issue.message}</button>:<p>{issue.message}</p>}</li>)}</ul>}</section>}
         {guideOpen&&<section className="wf-usage-guide" id="wf-usage-guide" aria-label="Cara memakai Auto Workflow"><div className="wf-guide-heading"><div><h2>Mulai dari template Instagram 3 slide</h2><p>Alurnya memisahkan validasi, strategi, copywriting, quality check, dan persetujuan.</p></div><button type="button" className="wf-section-close" aria-label="Tutup panduan" onClick={()=>setGuideOpen(false)}><X size={16}/></button></div><ol><li>Klik <strong>Buat template Instagram</strong>, beri nama workflow, lalu klik Buat workflow.</li><li>Buka <strong>Manual Trigger</strong>. Isi topik, produk, audiens, tujuan, CTA, dan pastikan <code>slideCount: 3</code>.</li><li>Periksa berurutan <strong>Cari Referensi Konten</strong>, <strong>Penentuan Topik</strong>, <strong>Validasi Fakta</strong>, dan <strong>Strategi Marketing 3 Slide</strong>. Topik pencarian dikirim ke Google News saat alur diuji.</li><li>Tinjau <strong>Copywriting</strong> dan <strong>Quality Check</strong>. Buka <strong>Persetujuan Manual</strong> setelah pengujian, tinjau hasil masuk, lalu klik <strong>Setujui hasil ini</strong>. Jalankan ulang untuk meneruskan versi yang disetujui.</li></ol><p className="wf-guide-limit">Agent pada template masih pratinjau. Untuk memakai 9router, aktifkan AI terhubung dan pilih Model AI. Memory dan Tools bersifat opsional. Klik Periksa alur sebelum pengujian. Node Generate Gambar dan Post to Instagram tersedia; pilih model serta akun, lalu tinjau hasil lewat Persetujuan Manual sebelum publikasi.</p><div className="wf-guide-bottom"><button disabled={busy} onClick={()=>{setNewName('Carousel Instagram 3 Slide');setNewDescription('Topik, validasi fakta, strategi, copywriting, quality check, dan persetujuan.');setTemplate('ig-autopost');setNewOpen(true)}}><Plus size={15}/>Buat template Instagram 3 slide</button><p><strong>Urutan:</strong> Manual Trigger → Cari Referensi Konten → Penentuan Topik → Validasi Fakta → Strategi Marketing 3 Slide → Copywriting → Quality Check → Persetujuan Manual.</p></div></section>}
         <div className={'wf-canvas'+(compact?' is-compact':'')} ref={canvas}>
          {compact?<div className="wf-mobile-flow">{nodes.map(node=><button key={node.id} data-mobile-node={node.id} disabled={busy} onClick={()=>{setAssistantOpen(false);setSelectedId(node.id);setDetailOpen(true)}}><strong>{node.data.label}</strong><span>{catalog.find(item=>item.type===node.type)?.title||node.type} · {node.data.result?.status||'Belum diuji'}</span><span>{edges.filter(edge=>edge.source===node.id).map(edge=>(edge.sourceHandle==='true'?'True → ':edge.sourceHandle==='false'?'False → ':'→ ')+(nodes.find(n=>n.id===edge.target)?.data.label||edge.target)).join(' · ')||'Akhir cabang'}</span></button>)}</div>:<ReactFlow<StudioNode,Edge> nodes={nodes.map(node=>({...node,data:{...node.data,onAddResource:(type:string)=>addNode(type,node.id),connectedAiResources:node.type==='aiAgent'?Object.keys(aiPorts).filter(resource=>edges.some(edge=>edge.target===node.id&&edge.targetHandle===aiPorts[resource])):[]}}))} edges={edges.map(edge=>({...edge,style:isAiConnection(edge)?{strokeDasharray:"5 4"}:undefined,type:'smoothstep',animated:busyKind==='running',markerEnd:{type:MarkerType.ArrowClosed}}))} nodeTypes={nodeTypes} onInit={instance=>{flow.current=instance}} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect} isValidConnection={canConnect} onNodeDragStart={remember} onNodeClick={(_,node)=>{setAssistantOpen(false);setSelectedId(node.id);setDetailOpen(true)}} onPaneClick={()=>{setSelectedId(null);setDetailOpen(false)}} nodesDraggable={!busy} nodesConnectable={!busy} elementsSelectable={!busy} deleteKeyCode={busy?null:['Backspace','Delete']} fitView minZoom={.25} maxZoom={1.7}>
             <Background gap={24} size={1.5} color="var(--wf-control)"/><Controls showInteractive={false}/>
          </ReactFlow>}
          {!nodes.length&&<div className="wf-empty-canvas"><Workflow size={28}/><h2>{workflowId?'Mulai dengan trigger':'Buat workflow pertama'}</h2><p>{workflowId?'Tambahkan node pemicu, lalu hubungkan langkah berikutnya.':'Pilih template alur data atau mulai dari kanvas kosong.'}</p><button disabled={busy} onClick={()=>workflowId?setPalette(true):setNewOpen(true)}><Plus size={16}/>{workflowId?'Tambah node':'Workflow baru'}</button></div>}
          {assistantOpen&&workflowId&&<WorkflowAssistantPanel key={workflowId} workflowId={workflowId} nodes={nodes} edges={edges} busy={busy} onApply={(nextNodes,nextEdges)=>{commit(nextNodes,nextEdges);setSelectedId(null);setDetailOpen(false);setNotice('Usulan asisten diterapkan ke draft. Periksa lalu simpan.') }} onClose={()=>setAssistantOpen(false)}/>}
          {detailOpen&&selectedNode&&<NodeSettingsPanel key={selectedNode.id} workflowId={workflowId} node={selectedNode} nodes={nodes} edges={edges} busy={busy} onUpdate={updateNode} onDelete={removeNode} onClose={()=>setDetailOpen(false)} onExecute={id=>void run(id)} onSelect={id=>{setSelectedId(id);setDetailOpen(true)}} onAddResource={addNode}/>}
        </div>
        {chatOpen&&<section className="wf-test-chat" aria-label="Uji chat workflow"><header><div><h3>Uji chat</h3><p>Setiap pesan menjalankan workflow. Agent live memakai kuota 9router, termasuk panggilan tool.</p></div><button disabled={busy} onClick={()=>{setChatMessages([]);setChatSession(crypto.randomUUID())}}>Sesi baru</button><button type="button" className="wf-section-close" aria-label="Tutup uji chat" onClick={()=>setChatOpen(false)}><X size={16}/></button></header><div className="wf-chat-messages" aria-live="polite">{!chatMessages.length?<p className="wf-muted">Pilih model pada 9router Chat Model, isi brief pada Tool, lalu kirim pesan.</p>:chatMessages.map((message,index)=><article key={index} className={message.role==='Error'?'wf-error':''}><strong>{message.role}</strong><p>{message.text}</p></article>)}{busyKind==='chat'&&<p role="status">AI Agent sedang memproses…</p>}</div><form onSubmit={event=>void sendChat(event)}><label className="wf-field"><span>Pesan untuk AI Agent</span><textarea rows={2} maxLength={16000} value={chatMessage} disabled={busy} onChange={event=>setChatMessage(event.target.value)} placeholder="Contoh: Buat rencana carousel 3 slide untuk produk saya"/></label><button className="wf-primary" disabled={busy||!chatMessage.trim()} type="submit"><Send size={15}/>Kirim</button></form></section>}
        <div className="wf-canvas-footer"><span>{nodes.length} node · {edges.length} koneksi</span><span>Garis utuh: alur data · Garis putus: sub-node AI</span></div>
      </div>:<div className="wf-executions">
         <header><div><h2>Riwayat pengujian</h2><p className="wf-muted">Pilih pengujian untuk melihat langkah, input, dan outputnya.</p></div><button disabled={runsLoading} onClick={()=>void loadRuns()}><RefreshCw size={14}/>Muat ulang</button></header>
        {runsLoading?<p role="status">Memuat riwayat…</p>:!runs.length?<div className="wf-empty-history"><h3>Belum ada eksekusi</h3><p>Klik Jalankan alur di editor untuk merekam input dan output node.</p></div>:<div className="wf-history-grid">
           <div className="wf-run-list" aria-label="Daftar pengujian">{runs.map(item=><button key={item.id} aria-pressed={viewedRunId===item.id} onClick={()=>{setViewedRunId(item.id);setViewedNodeId(Object.keys(item.result?.nodeResults||{})[0]||'')}}><strong><span className={'wf-history-status status-'+item.status}>{item.status==='error'?'Error':item.status==='cancelled'?'Dihentikan':item.status==='waiting_approval'?'Menunggu persetujuan':'Selesai'}</span> · {item.trigger_type==='partial'?'Satu langkah':item.trigger_type==='chat'?'Chat':'Workflow'}</strong><span>{new Date(item.started_at.replace(' ','T')+'Z').toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}</span><span>{Object.keys(item.result?.nodeResults||{}).length} node diperiksa</span></button>)}</div>
           <section className="wf-run-detail"><header className="wf-run-detail-header"><div><h3>Detail pengujian</h3>{viewedRun&&<p className="wf-muted">{new Date(viewedRun.started_at.replace(' ','T')+'Z').toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})} · {viewedRun.trigger_type==='partial'?'Satu langkah':viewedRun.trigger_type==='chat'?'Chat':'Workflow'}</p>}</div>{viewedRun&&<span className={'wf-history-status status-'+viewedRun.status}>{viewedRun.status==='error'?'Error':viewedRun.status==='cancelled'?'Dihentikan':viewedRun.status==='waiting_approval'?'Menunggu persetujuan':'Selesai'}</span>}</header>{!Object.keys(viewedResults).length?<p>Pengujian ini belum memiliki rincian input dan output per node.</p>:<><label className="wf-field"><span>Pilih node untuk diperiksa</span><select value={viewedNodeId} onChange={e=>setViewedNodeId(e.target.value)}>{Object.values(viewedResults).map(result=><option key={result.nodeId} value={result.nodeId}>{result.label} · {result.status}</option>)}</select></label>{viewedResult&&<><p className="wf-muted">Status node: {viewedResult.status} · {viewedResult.durationMs} ms</p>{viewedResult.error&&<p role="alert" className="wf-error">{viewedResult.error}</p>}<h4>Input yang diterima</h4><DataViewer items={viewedResult.input}/><h4>Output yang dihasilkan</h4><DataViewer items={viewedResult.output}/></>}</>}</section>
        </div>}
      </div>}
    </div>
    {toastText&&<div className="wf-toast-region" role={toastError?'alert':'status'} aria-live={toastError?'assertive':'polite'}><div className={'wf-toast'+(toastError?' is-error':'')}><span>{toastText}</span>{toastError&&<div className="wf-toast-actions">{!workflowId&&<button type="button" disabled={busy} onClick={()=>void loadList()}>Coba lagi</button>}<button type="button" aria-label="Tutup notifikasi" onClick={()=>{setError('');setHistoryError('')}}><X size={15}/></button></div>}</div></div>}
    <dialog ref={paletteDialog} className="wf-palette-dialog" onCancel={()=>setPalette(false)} onClose={()=>setPalette(false)}><header className="wf-dialog-heading"><div><h2>Tambah node</h2><p>Pilih node berdasarkan tugas yang ingin Anda lakukan.</p></div><button type="button" className="wf-dialog-close" aria-label="Tutup katalog node" onClick={()=>setPalette(false)}><X size={18}/></button></header><div className="wf-palette-content"><label className="wf-search"><Search size={16}/><input aria-label="Cari node" placeholder="Cari node…" value={search} onChange={e=>setSearch(e.target.value)}/></label>{['Pemicu','Data','Logika','AI','Publikasi'].map(group=>{const matches=availableCatalog.filter(item=>item.group===group&&(item.title+' '+item.description).toLowerCase().includes(search.toLowerCase()));return matches.length>0&&<section key={group}><h3>{group}</h3>{matches.map(item=>{const Icon=iconForWorkflowNode(item.type);return <button key={item.type} disabled={busy} data-add-node={item.type} onClick={()=>addNode(item.type)}><span className={"wf-palette-icon wf-kind-"+item.type}><Icon size={18}/></span><span className="wf-palette-copy"><strong>{item.title}</strong><span>{item.description}</span></span><Plus className="wf-palette-plus" size={16}/></button>})}</section>})}{!availableCatalog.some(item=>(item.title+' '+item.description).toLowerCase().includes(search.toLowerCase()))&&<p>Tidak ada node yang cocok.</p>}</div></dialog>
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
