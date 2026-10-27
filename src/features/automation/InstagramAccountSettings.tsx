import { useEffect, useState, type FormEvent } from 'react'
import { Check, RefreshCw, Trash2, Plus } from 'lucide-react'

type Account={id:string;label:string;igUserId:string;username:string;authMode:'facebook'|'instagram'}
type Action={id:string;label:string;enabled:boolean;reason:string}
type Access={checkedAt:string;tokenValid:boolean|null;permissionsKnown:boolean;scopes:string[];actions:Action[]}
async function request<T>(path:string,init?:RequestInit):Promise<T> {
  const response=await fetch('/api/instagram'+path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...init})
  if(response.status===204)return undefined as T
  const body=await response.json().catch(()=>({}))
  if(!response.ok)throw new Error(body.error||`Instagram API gagal (${response.status}).`)
  return body as T
}
export function InstagramAccountSettings({value,busy,onChange,operation,onOperationChange}:{value:string;busy:boolean;onChange:(id:string)=>void;operation:string;onOperationChange:(value:string)=>void}) {
  const [accounts,setAccounts]=useState<Account[]>([])
  const [loading,setLoading]=useState(true)
  const [working,setWorking]=useState(false)
  const [editing,setEditing]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [username,setUsername]=useState('')
  const [igUserId,setIgUserId]=useState('')
  const [authMode,setAuthMode]=useState<'facebook'|'instagram'>('facebook')
  const [accessToken,setAccessToken]=useState('')
  const [confirmRemove,setConfirmRemove]=useState(false)
  const [access,setAccess]=useState<Access|null>(null)
  const [checking,setChecking]=useState(false)
  const [revision,setRevision]=useState(0)
  const selected=accounts.find(account=>account.id===value)
  useEffect(()=>{let cancelled=false;request<{accounts:Account[]}>('/accounts').then(body=>{if(!cancelled){setAccounts(body.accounts);setEditing(!body.accounts.length);if(!value&&body.accounts.length===1)onChange(body.accounts[0].id)}}).catch(err=>{if(!cancelled)setError(err.message)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[])
  useEffect(()=>{
    setAccess(null);setError('');setConfirmRemove(false)
    if(!value){setChecking(false);return}
    let cancelled=false
    setChecking(true)
    request<Access>('/accounts/'+value+'/capabilities').then(result=>{if(!cancelled)setAccess(result)}).catch(err=>{if(!cancelled)setError(err.message)}).finally(()=>{if(!cancelled)setChecking(false)})
    return()=>{cancelled=true}
  },[value,revision])
  const add=async(event:FormEvent)=>{
    event.preventDefault();if(working||busy)return
    setWorking(true);setError('');setNotice('')
    try{
      const {account}=await request<{account:Account}>('/accounts',{method:'POST',body:JSON.stringify({username,igUserId,authMode,accessToken})})
      setAccounts(previous=>[account,...previous.filter(item=>item.id!==account.id)]);onChange(account.id);setUsername('');setIgUserId('');setAccessToken('');setEditing(false);setRevision(number=>number+1);setNotice(`@${account.username} berhasil terhubung.`)
    }catch(err){setError(err instanceof Error?err.message:'Gagal menghubungkan akun.')}finally{setWorking(false)}
  }
  const verify=async()=>{
    setWorking(true);setError('');setNotice('')
    try{const result=await request<{username:string}>('/accounts/'+value+'/verify',{method:'POST'});setAccounts(previous=>previous.map(account=>account.id===value?{...account,username:result.username}:account));setRevision(number=>number+1)}
    catch(err){setError(err instanceof Error?err.message:'Koneksi gagal.')}
    finally{setWorking(false)}
  }
  const remove=async()=>{
    if(!confirmRemove){setConfirmRemove(true);return}
    setWorking(true);setError('')
    try{await request('/accounts/'+value,{method:'DELETE'});setAccounts(previous=>previous.filter(account=>account.id!==value));onChange('');setNotice('Koneksi dilepas. Post Instagram tetap ada.')}
    catch(err){setError(err instanceof Error?err.message:'Gagal melepas akun.')}
    finally{setWorking(false)}
  }
  const current=access?.actions.find(action=>action.id===operation)
  const enabled=access?.actions.filter(action=>action.enabled)||[]
  const disabled=access?.actions.filter(action=>!action.enabled)||[]
  const needsRenewal=access?.tokenValid===false
  return <section className="wf-instagram-accounts wf-instagram-connection">
    <div className="wf-ig-heading"><strong>Akun Instagram</strong><button type="button" disabled={busy||working||loading} onClick={()=>setEditing(previous=>!previous)}><Plus size={13}/>{editing?'Tutup':'Hubungkan akun'}</button></div>
    <label className="wf-field"><span className="sr-only">Pilih akun Instagram</span><select aria-label="Pilih akun Instagram" disabled={busy||working||loading} value={value} onChange={event=>{onChange(event.target.value);setNotice('')}}><option value="">{loading?'Memuat akun…':'Pilih akun…'}</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.username?`@${account.username}`:account.label}</option>)}</select></label>
    {selected&&!editing&&<div className="wf-ig-account-tools"><span>ID {selected.igUserId}</span><button type="button" disabled={busy||working||checking} aria-label="Periksa ulang koneksi dan akses" title="Periksa ulang koneksi dan akses" onClick={()=>void verify()}><RefreshCw size={14}/></button><button type="button" disabled={busy||working} aria-label={confirmRemove?'Konfirmasi lepas akun':'Lepas akun'} title={confirmRemove?'Klik lagi untuk melepas akun':'Lepas akun'} onClick={()=>void remove()}>{confirmRemove?<Check size={14}/>:<Trash2 size={14}/>}</button></div>}
    {editing&&<form className="wf-ig-connect-form" onSubmit={event=>void add(event)}>
      <label className="wf-field"><span>Username Instagram</span><input required value={username} disabled={busy||working} onChange={event=>setUsername(event.target.value)} placeholder="@bluudzstore" autoComplete="off" maxLength={31}/></label>
      <label className="wf-field"><span>Token Meta</span><input required type="password" autoComplete="off" value={accessToken} disabled={busy||working} onChange={event=>setAccessToken(event.target.value)} placeholder="Tempel access token"/></label>
      <details className="wf-account-advanced"><summary>Pengaturan lanjutan</summary><label className="wf-field"><span>Jenis token</span><select value={authMode} disabled={busy||working} onChange={event=>setAuthMode(event.target.value as 'facebook'|'instagram')}><option value="facebook">Facebook / Page access token</option><option value="instagram">Instagram Login token</option></select></label><label className="wf-field"><span>ID Instagram (jika pencarian gagal)</span><input inputMode="numeric" pattern="[0-9]{5,30}" value={igUserId} disabled={busy||working} onChange={event=>setIgUserId(event.target.value)} placeholder="Kosongkan untuk deteksi otomatis"/></label></details>
      <button type="submit" className="wf-primary" disabled={busy||working||!username.trim()||!accessToken.trim()}>{working?'Mencari dan memeriksa akun…':'Hubungkan akun'}</button>
    </form>}
    {notice&&<p className="wf-muted" role="status">{notice}</p>}{error&&<p className="wf-error" role="alert">{error}</p>}
    {selected&&needsRenewal&&<div className="wf-ig-renewal" role="alert"><strong>Token @{selected.username} tidak valid.</strong><span>Perbarui token Meta agar akun ini bisa digunakan lagi.</span><button type="button" disabled={busy||working} onClick={()=>{setUsername(selected.username);setAuthMode(selected.authMode);setIgUserId('');setEditing(true)}}>Perbarui token</button></div>}
    <div className="wf-ig-actions"><label className="wf-field"><span>Tindakan</span><select aria-label="Tindakan Instagram" disabled={busy||working||checking||!access} value={operation} onChange={event=>onOperationChange(event.target.value)}>
      {!access&&<option value={operation}>{checking?'Memeriksa akses token…':'Hubungkan akun untuk melihat tindakan'}</option>}
      {enabled.length>0&&<optgroup label="Tersedia">{enabled.map(action=><option key={action.id} value={action.id}>{action.label}</option>)}</optgroup>}
      {disabled.length>0&&<optgroup label="Tidak tersedia">{disabled.map(action=><option key={action.id} value={action.id} disabled>{action.label} · {['publish','list','inspect'].includes(action.id)?'Akses belum tersedia':'Belum didukung'}</option>)}</optgroup>}
    </select></label>{current&&!current.enabled&&<p className="wf-muted" role="status">{current.reason}</p>}
      {access&&<details className="wf-ig-access-details"><summary>{enabled.length} tindakan tersedia · Lihat akses</summary><ul>{access.actions.map(action=><li key={action.id} className={action.enabled?'':'is-disabled'}><strong>{action.label}</strong><span>{action.reason}</span></li>)}</ul>{!access.permissionsKnown&&<p className="wf-muted">Untuk memeriksa izin Page token, atur META_APP_ACCESS_TOKEN dari aplikasi Meta yang sama di VPS.</p>}</details>}
    </div>
  </section>
}
