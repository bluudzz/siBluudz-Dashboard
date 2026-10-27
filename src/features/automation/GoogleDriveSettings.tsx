import { useEffect, useState } from 'react'

type DriveAccount={id:string;email:string}

export function GoogleDriveSettings({value,busy,onChange}:{value:string;busy:boolean;onChange:(id:string)=>void}) {
  const [accounts,setAccounts]=useState<DriveAccount[]>([])
  const [enabled,setEnabled]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    const refresh=()=>{void fetch('/api/google-drive/accounts',{credentials:'same-origin'}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Akun Drive gagal dimuat.');if(active){setAccounts(body.accounts||[]);setEnabled(Boolean(body.enabled));setError('')}}).catch(reason=>{if(active)setError(String(reason.message||reason))})}
    refresh()
    window.addEventListener('focus',refresh)
    return()=>{active=false;window.removeEventListener('focus',refresh)}
  },[])
  return <>
    <label className="wf-field"><span>Akun Google Drive</span><select value={value} disabled={busy} onChange={event=>onChange(event.target.value)}><option value="">Pilih akun…</option>{accounts.map(account=><option key={account.id} value={account.id}>{account.email}</option>)}</select></label>
    {enabled?<a href="/api/google-drive/connect" target="_blank" rel="noopener noreferrer">+ Hubungkan akun Google Drive</a>:<p className="wf-inline-note">Google OAuth belum disetel di server. Isi GOOGLE_DRIVE_CLIENT_ID dan GOOGLE_DRIVE_CLIENT_SECRET.</p>}
    {error&&<p role="alert" className="wf-error">{error}</p>}
  </>
}
