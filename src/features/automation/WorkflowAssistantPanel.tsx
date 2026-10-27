import { useEffect, useState } from 'react'
import { Bot, Send, X, Check, RotateCcw, RefreshCw } from 'lucide-react'
import type { Edge } from '@xyflow/react'
import { formatModelLabel, serializableGraph, workflowRequest, type StudioNode } from './workflow-model'

type Message={role:'user'|'assistant';text:string}
type Proposal={reply:string;operations:number;changes:string[];draft:{nodes:StudioNode[];edges:Edge[]};issues:{severity:string;message:string}[];suggestedTest:string;sourceStamp:string}
type ModelInfo={id:string;imageOutput?:boolean}
type ModelResponse={success?:boolean;configured?:boolean;model?:string;defaultModel?:string;availableModels?:string[];models?:string[];catalog?:ModelInfo[];error?:string}

export function WorkflowAssistantPanel({workflowId,nodes,edges,busy,onApply,onClose}:{workflowId:string;nodes:StudioNode[];edges:Edge[];busy:boolean;onApply:(nodes:StudioNode[],edges:Edge[])=>void;onClose:()=>void}){
  const [messages,setMessages]=useState<Message[]>([{role:'assistant',text:'Saya membaca seluruh alur, koneksi, dan kesiapan node. Jelaskan tujuan Anda, misalnya: “Buat alur riset konten Instagram dari topik, lalu siapkan gambar dan persetujuan sebelum posting.”'}])
  const [input,setInput]=useState('')
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [proposal,setProposal]=useState<Proposal|null>(null)
  const [model,setModel]=useState('')
  const [models,setModels]=useState<string[]>([])
  const [modelLoading,setModelLoading]=useState(false)
  const [modelError,setModelError]=useState('')
  useEffect(()=>{
    let cancelled=false
    fetch('/api/ai/status',{credentials:'same-origin'}).then(response=>response.ok?response.json():Promise.reject(new Error('Gagal membaca model 9router.'))).then((data:ModelResponse)=>{
      if(cancelled)return
      const ids=(data.availableModels||[]).filter(id=>!data.catalog?.find(item=>item.id===id)?.imageOutput)
      setModels([...new Set([data.model||'',...ids].filter(Boolean))])
      setModel(data.model||'')
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
      const preferred=ids.includes(data.defaultModel||'')?data.defaultModel||'':ids[0]||''
      setModels(ids)
      if(!model||!ids.includes(model))setModel(preferred)
      if(!data.success)throw new Error(data.error||'Daftar model belum dapat diperbarui.')
    }catch(caught){setModelError(caught instanceof Error?caught.message:'Gagal memuat model.')}
    finally{setModelLoading(false)}
  }
  const currentStamp=JSON.stringify(serializableGraph(nodes,edges))
  async function send(){
    const instruction=input.trim()
    if(!instruction||loading||busy)return
    const sourceStamp=currentStamp
    const history=messages.slice(-6)
    setInput('');setError('');setProposal(null);setLoading(true)
    setMessages(previous=>[...previous,{role:'user',text:instruction}])
    try{
      const graph=serializableGraph(nodes,edges)
      const result=await workflowRequest<Omit<Proposal,'sourceStamp'>>(`/${workflowId}/assistant`,{method:'POST',body:JSON.stringify({instruction,...graph,history,model})})
      setMessages(previous=>[...previous,{role:'assistant',text:result.reply}])
      if(result.operations>0)setProposal({...result,sourceStamp})
    }catch(caught){setError(caught instanceof Error?caught.message:'Asisten belum dapat memproses perintah.');setInput(instruction)}
    finally{setLoading(false)}
  }
  function apply(){
    if(!proposal)return
    if(proposal.sourceStamp!==currentStamp){setError('Alur sudah berubah. Kirim ulang perintah agar asisten membaca versi terbaru.');setProposal(null);return}
    onApply(proposal.draft.nodes,proposal.draft.edges)
    setMessages(previous=>[...previous,{role:'assistant',text:'Perubahan diterapkan ke draft. Periksa node yang perlu diatur, lalu simpan dan uji alur. Anda bisa memakai Undo jika ingin membatalkan.'}])
    setProposal(null)
  }
  return <aside className="wf-assistant" aria-label="Asisten AI workflow">
    <header className="wf-assistant-header"><div><Bot size={18}/><strong>Asisten Workflow</strong><small>Memahami seluruh alur</small></div><button aria-label="Tutup asisten" onClick={onClose}><X size={17}/></button></header>
    <div className="wf-assistant-messages" role="log" aria-live="polite">
      {messages.map((item,index)=><div className={'wf-assistant-message is-'+item.role} key={index}>{item.text}</div>)}
      {loading&&<div className="wf-assistant-message is-assistant">Membaca alur dan menyusun usulan…</div>}
      {error&&<p className="wf-assistant-error" role="alert">{error}</p>}
      {proposal&&<section className="wf-assistant-proposal"><strong>Usulan perubahan</strong><ul>{proposal.changes.map((change,index)=><li key={index}><Check size={13}/>{change}</li>)}</ul>{proposal.issues.filter(issue=>issue.severity==='error').length>0&&<p>{proposal.issues.filter(issue=>issue.severity==='error').length} pengaturan masih perlu dilengkapi sebelum pengujian.</p>}<button type="button" disabled={busy||loading} onClick={apply}><Check size={15}/>Terapkan ke draft</button><button type="button" className="wf-assistant-discard" onClick={()=>setProposal(null)}><RotateCcw size={14}/>Abaikan</button></section>}
    </div>
    <form className="wf-assistant-compose" onSubmit={event=>{event.preventDefault();void send()}}><label htmlFor="wf-assistant-input">Perintah untuk asisten</label><div><textarea id="wf-assistant-input" rows={3} maxLength={2000} placeholder="Contoh: Tambahkan riset web sebelum AI Agent dan persetujuan sebelum Instagram…" value={input} disabled={loading||busy} onChange={event=>setInput(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send()}}}/><button aria-label="Kirim perintah" disabled={!input.trim()||loading||busy||!model} type="submit"><Send size={16}/></button></div><div className="wf-assistant-model"><label htmlFor="wf-assistant-model">Model AI 9router</label><div><select id="wf-assistant-model" value={model} disabled={loading||modelLoading} onChange={event=>{setModel(event.target.value);setModelError('')}}><option value="">Pilih model…</option>{model&&!models.includes(model)&&<option value={model}>{formatModelLabel(model)}</option>}{models.map(id=><option key={id} value={id}>{formatModelLabel(id)}</option>)}</select><button type="button" aria-label="Muat ulang model 9router" title="Muat ulang model" disabled={loading||modelLoading} onClick={()=>void refreshModels()}><RefreshCw size={15}/></button></div></div>{modelError&&<small className="wf-assistant-error" role="alert">{modelError}</small>}<small>Usulan AI menjadi draft. Simpan dan uji setelah memeriksanya.</small></form>
  </aside>
}
