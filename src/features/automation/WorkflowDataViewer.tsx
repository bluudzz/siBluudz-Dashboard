import { useState } from 'react'
import { Check, Copy, ExternalLink, Image as ImageIcon } from 'lucide-react'
import type { DataItem } from '../../../shared/workflow-engine'
import { dataLabel } from './SimpleDataEditor'

const imageKeys=new Set(['imageUrl','imagePreviewUrl','imageMime','imageModel'])
const contractFields:Record<string,string[]>={searchContent:['query','queries','followUpQueries','coverage','sources','pages','sourceCount','readCount','note'],aiAgent:['output','summary','facts','recommendations','agentModel','toolSteps'],imageGenerate:['imageUrl','imagePreviewUrl','imageMime','imageModel','imagePrompt','prompt'],instagram:['instagramStatus','mediaId','containerId','permalink','instagramPosts','instagramPost'],googleDrive:['driveFile','driveFiles','driveSelection','imageUrl','imagePreviewUrl','imageMime'],approval:['approved','reviewStatus','output','content']}
const previewUrl=(json:Record<string,unknown>)=>{
  const candidate=json.imagePreviewUrl||json.imageUrl
  return typeof candidate==='string'&&(candidate.startsWith('/api/workflow-media/')||candidate.startsWith('https://'))?candidate:''
}

function ResultValue({name,value}:{name:string;value:unknown}) {
  if(name==='driveFiles'&&Array.isArray(value))return <ul className="wf-source-list">{value.map((file,index)=>{const item=file&&typeof file==='object'?file as Record<string,unknown>:{};const href=typeof item.downloadUrl==='string'&&item.downloadUrl.startsWith('/api/google-drive/download/')?item.downloadUrl:'';return <li key={index}><strong>{String(item.name||'File '+(index+1))}</strong><span>ID: {String(item.id||'—')}</span>{href&&<a href={href}>Unduh file</a>}</li>})}</ul>
  if(name==='driveDownloadUrl'&&typeof value==='string'&&value.startsWith('/api/google-drive/download/'))return <a href={value}>Unduh file</a>
  if(name==='sources'&&Array.isArray(value))return <ul className="wf-source-list">{value.map((source,index)=>{
    const item=source&&typeof source==='object'?source as Record<string,unknown>:{}
    const href=typeof item.url==='string'&&item.url.startsWith('https://')?item.url:''
    return <li key={index}>{href?<a href={href} target="_blank" rel="noopener noreferrer">{String(item.title||href)}</a>:<strong>{String(item.title||'Sumber '+(index+1))}</strong>}{Boolean(item.snippet)&&<span>{String(item.snippet)}</span>}{Boolean(item.content)&&<details><summary>Baca isi</summary><p>{String(item.content)}</p></details>}</li>
  })}</ul>
  if(value&&typeof value==='object')return <details className="wf-result-object"><summary>{Array.isArray(value)?`${value.length} item · Lihat rincian`:'Lihat rincian'}</summary><pre>{JSON.stringify(value,null,2)}</pre></details>
  if(typeof value==='boolean')return <>{value?'Ya':'Tidak'}</>
  return <>{String(value??'—')}</>
}

export function WorkflowDataViewer({items,nodeType}:{items:DataItem[];nodeType?:string}) {
  const [technical,setTechnical]=useState(false)
  const [copied,setCopied]=useState(false)
  const [copyError,setCopyError]=useState('')
  return <div className="wf-data">
    <div className="wf-data-toolbar"><span>{items.length} hasil</span><div><button type="button" aria-pressed={!technical} onClick={()=>setTechnical(false)}>Tampilan</button><button type="button" aria-pressed={technical} onClick={()=>setTechnical(true)}>Data</button><button type="button" aria-label="Salin seluruh data" title="Salin seluruh data" onClick={async()=>{try{await navigator.clipboard.writeText(JSON.stringify(items,null,2));setCopied(true);setCopyError('')}catch{setCopyError('Gagal menyalin. Buka tab Data lalu salin teksnya.')}}}>{copied?<Check size={14}/>:<Copy size={14}/>}</button></div></div>
    {copyError&&<p role="status" className="wf-muted">{copyError}</p>}
    {!items.length?<div className="wf-result-empty">Belum ada hasil. Jalankan langkah ini untuk melihat datanya.</div>:technical?<pre tabIndex={0}>{JSON.stringify(items,null,2)}</pre>:<div className="wf-readable-results">{items.slice(0,20).map((item,index)=>{
      const json=item.json||{}
      const image=previewUrl(json)
      const preferred=contractFields[nodeType||'']
      const entries=Object.entries(json).filter(([key])=>!imageKeys.has(key)&&!key.startsWith('_')).sort(([a],[b])=>{if(!preferred)return 0;const ai=preferred.indexOf(a),bi=preferred.indexOf(b);return (ai<0?999:ai)-(bi<0?999:bi)})
      const shown=entries.slice(0,5)
      const rest=entries.slice(5)
      return <article key={index} className="wf-result-card">
        <div className="wf-result-card-heading"><strong>{items.length>1?`Hasil ${index+1}`:'Hasil langkah'}</strong>{Boolean(json.instagramStatus)&&<span>{String(json.instagramStatus==='published'?'Terbit':json.instagramStatus==='already_published'?'Sudah terbit':json.instagramStatus)}</span>}</div>
        {image&&<div className="wf-result-media"><img src={image} alt={`Pratinjau gambar ${index+1}`} loading="lazy" referrerPolicy="no-referrer"/><a href={image} target="_blank" rel="noopener noreferrer"><ImageIcon size={14}/> Buka gambar <ExternalLink size={13}/></a></div>}
        {shown.length>0&&<dl>{shown.map(([key,value])=><div key={key}><dt>{dataLabel(key)}</dt><dd><ResultValue name={key} value={value}/></dd></div>)}</dl>}
        {rest.length>0&&<details className="wf-result-more"><summary>Lihat {rest.length} informasi lain</summary><dl>{rest.map(([key,value])=><div key={key}><dt>{dataLabel(key)}</dt><dd><ResultValue name={key} value={value}/></dd></div>)}</dl></details>}
        {!image&&!entries.length&&<p className="wf-muted">Langkah selesai tanpa data tampilan.</p>}
      </article>
    })}{items.length>20&&<p className="wf-muted">Menampilkan 20 hasil pertama. Semua hasil tersedia di tab Data.</p>}</div>}
  </div>
}
