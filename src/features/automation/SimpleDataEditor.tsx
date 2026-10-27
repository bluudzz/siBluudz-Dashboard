import { useState } from 'react'
import { Plus, X } from 'lucide-react'

export const dataLabels:Record<string,string>={topic:'Topik',product:'Produk',audience:'Audiens',objective:'Tujuan',cta:'Ajakan tindakan',slideCount:'Jumlah slide',approved:'Sudah disetujui',factStatus:'Status fakta',contentStatus:'Status konten',qualityStatus:'Status kualitas',chatInput:'Pesan pengguna',sessionId:'Sesi percakapan',prompt:'Prompt untuk langkah berikutnya',originalPrompt:'Perintah awal',output:'Jawaban AI',headline:'Judul utama',title:'Judul',reviewStatus:'Status peninjauan',researchQuery:'Kata kunci pencarian',sources:'Sumber ditemukan',sourceCount:'Jumlah sumber',toolSteps:'Alat yang dipakai'}
export const dataLabel=(key:string)=>dataLabels[key]||key.replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ')
export function friendlyPrompt(value:string) { return value.replace(/\{\{\s*\$json\.([\w.-]+)\s*\}\}/g,(_,key)=>`[${dataLabel(key)}]`) }
export function technicalPrompt(value:string,keys:string[]) {
  return [...new Set([...Object.keys(dataLabels),...keys])].reduce((text,key)=>text.replaceAll(`[${dataLabel(key)}]`,`{{ $json.${key} }}`),value)
}

export function SimpleDataEditor({value,disabled,onChange}:{value:string;disabled:boolean;onChange:(value:string)=>void}) {
  const [newKey,setNewKey]=useState('')
  const [error,setError]=useState('')
  let data:Record<string,unknown>|null=null
  try { const parsed=JSON.parse(value||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))data=parsed }catch{}
  const commit=(next:Record<string,unknown>)=>onChange(JSON.stringify(next,null,2))
  if(!data)return <p className="wf-inline-note">Data ini memakai format lanjutan. Buka Edit data teknis untuk melihat atau memperbaikinya.</p>
  return <div className="wf-simple-fields">{Object.entries(data).map(([key,item])=><div className="wf-simple-field" key={key}><label className="wf-field"><span>{dataLabel(key)}</span>{typeof item==='boolean'?<select disabled={disabled} value={String(item)} onChange={event=>commit({...data,[key]:event.target.value==='true'})}><option value="false">Belum / Tidak</option><option value="true">Ya</option></select>:item&&typeof item==='object'?<span className="wf-muted">Data terstruktur — tersedia di pengaturan teknis.</span>:<input disabled={disabled} type={typeof item==='number'?'number':'text'} value={friendlyPrompt(String(item??''))} onChange={event=>commit({...data,[key]:typeof item==='number'?Number(event.target.value):technicalPrompt(event.target.value,Object.keys(data||{}))})}/>}</label><button type="button" aria-label={'Hapus isian '+dataLabel(key)} disabled={disabled} onClick={()=>{const next={...data};delete next[key];commit(next)}}><X size={13}/></button></div>)}<div className="wf-add-field"><input aria-label="Nama isian baru" placeholder="Tambah isian, misalnya budget" disabled={disabled} value={newKey} onChange={event=>{setNewKey(event.target.value);setError('')}}/><button type="button" disabled={disabled||!newKey.trim()} onClick={()=>{const key=newKey.trim();if(!/^[a-zA-Z][\w]{0,49}$/.test(key)||Object.hasOwn(data,key)){setError('Gunakan nama unik tanpa spasi, misalnya budget.');return}commit({...data,[key]:''});setNewKey('')}}><Plus size={14}/>Tambah</button></div>{error&&<p role="alert" className="wf-error">{error}</p>}</div>
}
