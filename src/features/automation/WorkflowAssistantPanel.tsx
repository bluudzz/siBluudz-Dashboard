import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, Send, X, Check, RotateCcw, RefreshCw } from 'lucide-react'
import type { Edge } from '@xyflow/react'
import { formatModelLabel, serializableGraph, workflowRequest, type StudioNode } from './workflow-model'

const PREFERRED_MODEL='ag/gemini-3.8-flash'

type Message={role:'user'|'assistant';text:string}
type Proposal={reply:string;operations:number;changes:string[];draft:{nodes:StudioNode[];edges:Edge[]};issues:{severity:string;message:string}[];suggestedTest:string;sourceStamp:string}
type AssistantResult=Omit<Proposal,'sourceStamp'>
type AssistantJob={instruction:string;sourceStamp:string;promise:Promise<AssistantResult>;status:'pending'|'done'|'error';result?:AssistantResult;error?:string}
const assistantJobs=new Map<string,AssistantJob>()
type ModelInfo={id:string;imageOutput?:boolean}
type ModelResponse={success?:boolean;configured?:boolean;model?:string;defaultModel?:string;availableModels?:string[];models?:string[];catalog?:ModelInfo[];error?:string}
const MAX_ASSISTANT_MESSAGES=50
const trimMessages=(items:Message[])=>items.slice(-MAX_ASSISTANT_MESSAGES)

export function WorkflowAssistantPanel({workflowId,nodes,edges,busy,visible,initialDraft,onDraftChange,onApply,onClose}:{workflowId:string;nodes:StudioNode[];edges:Edge[];busy:boolean;visible:boolean;initialDraft:string;onDraftChange:(draft:string)=>void;onApply:(nodes:StudioNode[],edges:Edge[])=>void;onClose:()=>void}){
  const greeting:Message={role:'assistant',text:'Saya membaca seluruh alur, koneksi, dan kesiapan node. Jelaskan tujuan Anda, misalnya: “Buat alur riset konten Instagram dari topik, lalu siapkan gambar dan persetujuan sebelum posting.”'}
  const [messages,setMessages]=useState<Message[]>([greeting])
  const [input,setInput]=useState(initialDraft)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [proposal,setProposal]=useState<Proposal|null>(null)
  const [model,setModel]=useState('')
  const [models,setModels]=useState<string[]>([])
  const [modelLoading,setModelLoading]=useState(false)
  const [modelError,setModelError]=useState('')
  const [historyLoaded,setHistoryLoaded]=useState(false)
  const messageList=useRef<HTMLDivElement>(null)
  useLayoutEffect(()=>{
    const element=messageList.current
    if(!element)return
    element.scrollTop=element.scrollHeight
    const frame=requestAnimationFrame(()=>{element.scrollTop=element.scrollHeight})
    return()=>cancelAnimationFrame(frame)
  },[messages,loading,proposal,historyLoaded])
  useEffect(()=>{
    let cancelled=false
    workflowRequest<{messages:Message[]}>(`/${workflowId}/assistant/history`).then(data=>{
      if(cancelled)return
      const saved=Array.isArray(data.messages)?data.messages.filter(item=>['user','assistant'].includes(item?.role)&&typeof item?.text==='string'):[]
      if(saved.length)setMessages(trimMessages([greeting,...saved]))
    }).catch(()=>{if(!cancelled)setError('Riwayat percakapan belum dapat dimuat. Coba buka ulang asisten.')}).finally(()=>{if(!cancelled)setHistoryLoaded(true)})
    return()=>{cancelled=true}
  },[workflowId])
  useEffect(()=>{
    if(!historyLoaded)return
    const job=assistantJobs.get(workflowId)
    if(!job)return
    let cancelled=false
    const receive=(result:AssistantResult)=>{
      if(cancelled)return
      setMessages(previous=>{
        if(previous.at(-1)?.role==='assistant'&&previous.at(-1)?.text===result.reply)return previous
        const hasPrompt=previous.at(-1)?.role==='user'&&previous.at(-1)?.text===job.instruction
        return trimMessages([...previous,...(hasPrompt?[]:[{role:'user' as const,text:job.instruction}]),{role:'assistant',text:result.reply}])
      })
      if(result.operations>0)setProposal({...result,sourceStamp:job.sourceStamp})
      setLoading(false)
    }
    if(job.status==='done'&&job.result)receive(job.result)
    else if(job.status==='error'){setError(job.error||'Asisten belum dapat memproses perintah.');setInput(job.instruction);onDraftChange(job.instruction);setLoading(false)}
    else {setLoading(true);void job.promise.then(receive).catch(caught=>{if(!cancelled){setError(caught instanceof Error?caught.message:'Asisten belum dapat memproses perintah.');setInput(job.instruction);onDraftChange(job.instruction);setLoading(false)}})}
    return()=>{cancelled=true}
  },[historyLoaded,workflowId])
  useEffect(()=>{
    let cancelled=false
    fetch('/api/ai/status',{credentials:'same-origin'}).then(response=>response.ok?response.json():Promise.reject(new Error('Gagal membaca model 9router.'))).then((data:ModelResponse)=>{
      if(cancelled)return
      const ids=(data.availableModels||[]).filter(id=>!data.catalog?.find(item=>item.id===id)?.imageOutput)
      setModels([...new Set([data.model||'',...ids].filter(Boolean))])
      setModel(ids.includes(PREFERRED_MODEL)?PREFERRED_MODEL:data.model||'')
      if(!data.configured)setModelError('Hubungkan 9router dan pilih model di Pengaturan AI.')
    }).catch(()=>{if(!cancelled)setModelError('Daftar model belum dapat dibaca. Coba muat ulang.')})
    return()=>{cancelled=true}
  },[])
  async function refreshModels(){
    setModelLoading(true);setModelError('')
    try{
      const response=await fetch('/api/ai/models',{credentials:'same-origin'})
      if(!response.ok)throw new Error('Gagal memuat daftar model 9router.')
      const data:ModelResponse=await response.json()
      const ids=(data.models||[]).filter(id=>!data.catalog?.find(item=>item.id===id)?.imageOutput)
      const preferred=ids.includes(PREFERRED_MODEL)?PREFERRED_MODEL:ids.includes(data.defaultModel||'')?data.defaultModel||'':ids[0]||''
      setModels(ids)
      if(!model||!ids.includes(model))setModel(preferred)
      if(!data.success)throw new Error(data.error||'Daftar model belum dapat diperbarui.')
    }catch(caught){setModelError(caught instanceof Error?caught.message:'Gagal memuat model.')}
    finally{setModelLoading(false)}
  }
  const currentStamp=JSON.stringify(serializableGraph(nodes,edges))
  async function send(){
    const instruction=input.trim()
    if(!instruction||loading||busy||!historyLoaded)return
    const sourceStamp=currentStamp
    setInput('');onDraftChange('');setError('');setProposal(null);setLoading(true)
    setMessages(previous=>trimMessages([...previous,{role:'user',text:instruction}]))
    try{
      const graph=serializableGraph(nodes,edges)
      const promise=workflowRequest<AssistantResult>(`/${workflowId}/assistant`,{method:'POST',body:JSON.stringify({instruction,...graph,model})})
      const job:AssistantJob={instruction,sourceStamp,promise,status:'pending'}
      assistantJobs.set(workflowId,job)
      void promise.then(result=>{job.status='done';job.result=result},caught=>{job.status='error';job.error=caught instanceof Error?caught.message:'Asisten belum dapat memproses perintah.'})
      const result=await promise
      setMessages(previous=>trimMessages([...previous,{role:'assistant',text:result.reply}]))
      if(result.operations>0)setProposal({...result,sourceStamp})
    }catch(caught){setError(caught instanceof Error?caught.message:'Asisten belum dapat memproses perintah.');setInput(instruction);onDraftChange(instruction)}
    finally{setLoading(false)}
  }
  function apply(){
    if(!proposal)return
    if(proposal.sourceStamp!==currentStamp){setError('Alur sudah berubah. Kirim ulang perintah agar asisten membaca versi terbaru.');setProposal(null);return}
    onApply(proposal.draft.nodes,proposal.draft.edges)
    assistantJobs.delete(workflowId)
    setMessages(previous=>trimMessages([...previous,{role:'assistant',text:'Perubahan diterapkan ke draft. Periksa node yang perlu diatur, lalu simpan dan uji alur. Anda bisa memakai Undo jika ingin membatalkan.'}]))
    setProposal(null)
  }
  async function resetHistory(){
    if(loading||busy||!historyLoaded)return
    setLoading(true);setError('');setProposal(null)
    try{
      await workflowRequest(`/${workflowId}/assistant/history`,{method:'DELETE'})
      assistantJobs.delete(workflowId)
      setMessages([greeting])
    }catch(caught){setError(caught instanceof Error?caught.message:'Riwayat belum dapat dihapus.')}
    finally{setLoading(false)}
  }
  return <aside className="wf-assistant" aria-label="Asisten AI workflow" hidden={!visible}>
    <header className="wf-assistant-header"><div><Bot size={18}/><strong>Asisten Workflow</strong><small>{!historyLoaded?'Memuat percakapan…':messages.length>1?'Percakapan tersimpan':'Memahami seluruh alur'}</small></div><div className="wf-assistant-header-actions">{messages.length>1&&<button aria-label="Mulai percakapan baru" title="Hapus riwayat percakapan" disabled={loading||busy||!historyLoaded} onClick={()=>void resetHistory()}><RotateCcw size={16}/></button>}<button aria-label="Tutup asisten" onClick={onClose}><X size={17}/></button></div></header>
    <div className="wf-assistant-messages" ref={messageList} role="log" aria-live="polite">
      {messages.map((item,index)=><div className={'wf-assistant-message is-'+item.role} key={index}>{item.text}</div>)}
      {loading&&<div className="wf-assistant-message is-assistant">Membaca alur dan menyusun usulan…</div>}
      {error&&<p className="wf-assistant-error" role="alert">{error}</p>}
      {proposal&&<section className="wf-assistant-proposal"><strong>Usulan perubahan</strong><ul>{proposal.changes.map((change,index)=><li key={index}><Check size={13}/>{change}</li>)}</ul>{proposal.issues.filter(issue=>issue.severity==='error').length>0&&<p>{proposal.issues.filter(issue=>issue.severity==='error').length} pengaturan masih perlu dilengkapi sebelum pengujian.</p>}<button type="button" disabled={busy||loading} onClick={apply}><Check size={15}/>Terapkan ke draft</button><button type="button" className="wf-assistant-discard" onClick={()=>{setProposal(null);assistantJobs.delete(workflowId)}}><RotateCcw size={14}/>Abaikan</button></section>}
    </div>
    <form className="wf-assistant-compose" onSubmit={event=>{event.preventDefault();void send()}}><label htmlFor="wf-assistant-input">Perintah untuk asisten</label><div><textarea id="wf-assistant-input" rows={3} maxLength={16000} placeholder="Contoh: Tambahkan riset web sebelum AI Agent dan persetujuan sebelum Instagram…" value={input} disabled={loading||busy||!historyLoaded} onChange={event=>{setInput(event.target.value);onDraftChange(event.target.value)}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/><button aria-label="Kirim perintah" disabled={!input.trim()||loading||busy||!model||!historyLoaded} type="submit"><Send size={16}/></button></div><div className="wf-assistant-model"><label htmlFor="wf-assistant-model">Model AI 9router</label><div><select id="wf-assistant-model" value={model} disabled={loading||modelLoading} onChange={event=>{setModel(event.target.value);setModelError('')}}><option value="">Pilih model…</option>{model&&!models.includes(model)&&<option value={model}>{formatModelLabel(model)}</option>}{models.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select><button type="button" aria-label="Muat ulang model 9router" title="Muat ulang model" disabled={loading||modelLoading} onClick={()=>void refreshModels()}><RefreshCw size={15}/></button></div></div>{modelError&&<small className="wf-assistant-error" role="alert">{modelError}</small>}</form>
  </aside>
}
