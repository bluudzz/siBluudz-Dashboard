import { randomBytes, randomInt, randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from './db.js'
import { appOrigin, hashToken, parseCookies, requireSameOrigin, requireUser, sessionCookieName } from './middleware/auth.js'
import { decryptSocialToken, encryptSocialToken } from './utils/social-crypto.js'
import { resolveValue } from '../shared/workflow-engine.js'
import { storeWorkflowImage } from './workflow-media.js'
import { parseGoogleDriveLink } from '../shared/google-drive-link.js'

const router=Router()
const stateCookie='sibluudz_drive_oauth_state'
const fileIdPattern=/^[\w-]{10,200}$/
const maxFileBytes=12*1024*1024
const clientId=()=>process.env.GOOGLE_DRIVE_CLIENT_ID||process.env.GOOGLE_CLIENT_ID||''
const clientSecret=()=>process.env.GOOGLE_DRIVE_CLIENT_SECRET||process.env.GOOGLE_CLIENT_SECRET||''
const redirectUri=()=>process.env.GOOGLE_DRIVE_REDIRECT_URI||`${appOrigin}/api/google-drive/callback`
const accountForUser=(userId,id)=>db.prepare('select * from google_drive_accounts where user_id=? and id=?').get(userId,id)

async function googleToken(params) {
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId(),client_secret:clientSecret(),...params}),signal:AbortSignal.timeout(15_000)})
  const body=await response.json().catch(()=>({}))
  if(!response.ok||!body.access_token)throw new Error(body.error==='invalid_grant'?'Akses Google Drive berakhir. Hubungkan kembali akun Google Drive.':'Google Drive gagal memberi token akses.')
  return body
}

async function driveRequest(account,path,{query={},resourceId='',resourceKey='',signal}={}) {
  const refreshToken=decryptSocialToken(account.encrypted_refresh_token)
  const token=await googleToken({refresh_token:refreshToken,grant_type:'refresh_token'})
  const url=new URL(`https://www.googleapis.com/drive/v3/${path}`)
  url.search=new URLSearchParams(query).toString()
  const headers={Authorization:`Bearer ${token.access_token}`}
  if(resourceKey){
    if(!fileIdPattern.test(resourceId)||!/^[\w-]{1,200}$/.test(resourceKey))throw new Error('Kunci link berbagi Google Drive tidak valid.')
    headers['X-Goog-Drive-Resource-Keys']=`${resourceId}/${resourceKey}`
  }
  const response=await fetch(url,{headers,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20_000)]):AbortSignal.timeout(20_000)})
  if(!response.ok){
    const body=await response.json().catch(()=>({}))
    if(response.status===401||response.status===403)throw new Error('Google Drive menolak akses. Periksa izin akun atau hubungkan kembali.')
    throw new Error(`Google Drive (${response.status}): ${String(body.error?.message||'Permintaan gagal.').slice(0,180)}`)
  }
  return response
}

export async function driveFileMetadata(account,fileId,{signal,resourceKey=''}={}) {
  if(!fileIdPattern.test(fileId))throw new Error('ID file Google Drive tidak valid.')
  const response=await driveRequest(account,`files/${fileId}`,{query:{fields:'id,name,mimeType,size,webViewLink,resourceKey,capabilities(canDownload),modifiedTime',supportsAllDrives:'true'},resourceId:fileId,resourceKey,signal})
  return response.json()
}

export async function driveFileBytes(account,fileId,{signal,resourceKey='',metadata}={}) {
  const meta=metadata||await driveFileMetadata(account,fileId,{signal,resourceKey})
  if(meta.capabilities?.canDownload===false)throw new Error('Pemilik file tidak mengizinkan unduhan.')
  if(meta.mimeType?.startsWith('application/vnd.google-apps.'))throw new Error('Google Docs/Sheets/Slides perlu diekspor; node ini hanya mengunduh file biasa.')
  if(Number(meta.size)>maxFileBytes)throw new Error('File Google Drive melebihi batas 12 MB untuk VPS ini.')
  const response=await driveRequest(account,`files/${fileId}`,{query:{alt:'media',supportsAllDrives:'true'},resourceId:fileId,resourceKey,signal})
  const length=Number(response.headers.get('content-length')||0)
  if(length>maxFileBytes){await response.body?.cancel();throw new Error('File Google Drive melebihi batas 12 MB.')}
  const reader=response.body.getReader()
  const chunks=[];let size=0
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxFileBytes)throw new Error('File Google Drive melebihi batas 12 MB.');chunks.push(Buffer.from(value))}
  }finally{await reader.cancel().catch(()=>{})}
  return {meta,bytes:Buffer.concat(chunks)}
}

function downloadUrl(accountId,fileId,resourceKey='') {
  return `/api/google-drive/download/${accountId}/${fileId}${resourceKey?`?resourceKey=${encodeURIComponent(resourceKey)}`:''}`
}

async function sharedFolderFiles(account,folderId,resourceKey,{name='',signal}={}) {
  const escaped=name.replace(/\\/g,'\\\\').replace(/'/g,"\\'")
  const q=`'${folderId}' in parents and trashed = false and (mimeType = 'image/jpeg' or mimeType = 'image/png')${name?` and name contains '${escaped}'`:''}`
  const files=[]
  let pageToken=''
  for(let page=0;page<3;page++){
    const response=await driveRequest(account,'files',{query:{q,pageSize:'100',fields:'nextPageToken,files(id,name,mimeType,size,resourceKey,webViewLink,modifiedTime,capabilities(canDownload))',supportsAllDrives:'true',includeItemsFromAllDrives:'true',...(pageToken?{pageToken}:{})},resourceId:folderId,resourceKey,signal})
    const body=await response.json()
    files.push(...(Array.isArray(body.files)?body.files:[]).filter(file=>fileIdPattern.test(String(file.id||''))))
    pageToken=String(body.nextPageToken||'')
    if(!pageToken)break
  }
  return {files,capped:Boolean(pageToken)}
}

export function chooseSharedFile(files,mode,name,randomIndex=upper=>randomInt(upper)) {
  const eligible=files.filter(file=>['image/jpeg','image/png'].includes(file.mimeType)&&file.capabilities?.canDownload!==false)
  if(mode==='random'){
    if(!eligible.length)throw new Error('Folder bersama tidak berisi gambar JPEG/PNG yang dapat diunduh.')
    return {file:eligible[randomIndex(eligible.length)],candidateCount:eligible.length}
  }
  if(mode==='name'){
    const wanted=String(name||'').trim().toLocaleLowerCase()
    if(!wanted)throw new Error('Isi nama gambar yang ingin dipilih.')
    const matches=eligible.filter(file=>String(file.name||'').toLocaleLowerCase().includes(wanted))
    if(!matches.length)throw new Error('Tidak ada gambar dengan nama tersebut di folder bersama.')
    matches.sort((a,b)=>Number(String(b.name).toLocaleLowerCase()===wanted)-Number(String(a.name).toLocaleLowerCase()===wanted)||String(a.name).localeCompare(String(b.name)))
    return {file:matches[0],candidateCount:matches.length}
  }
  throw new Error('Pilih cara memilih gambar: acak atau berdasarkan nama.')
}

export async function runDriveNode({node,input},user,{signal}={}) {
  if(input.length>10)throw new Error('Google Drive menerima maksimal 10 item per pengujian.')
  const account=accountForUser(user.id,String(node.data.accountId||''))
  if(!account)throw new Error('Hubungkan dan pilih akun Google Drive pada node ini.')
  const operation=String(node.data.operation||'list')
  const output=[]
  for(const item of input){
    if(operation==='shared'){
      const link=String(resolveValue(node.data.sharedLink||'',item.json)).trim()
      const shared=parseGoogleDriveLink(link)
      const mode=String(node.data.selectionMode||'random')
      const name=String(resolveValue(node.data.nameFilter||'',item.json)).trim()
      let selected,selection
      if(shared.type==='file'){
        selected=await driveFileMetadata(account,shared.id,{signal,resourceKey:shared.resourceKey})
        selection={mode:'direct',candidateCount:1,capped:false}
      }else{
        const folder=await driveFileMetadata(account,shared.id,{signal,resourceKey:shared.resourceKey})
        if(folder.mimeType!=='application/vnd.google-apps.folder')throw new Error('Link yang dimasukkan bukan folder Google Drive.')
        const found=await sharedFolderFiles(account,shared.id,shared.resourceKey,{name:mode==='name'?name:'',signal})
        const picked=chooseSharedFile(found.files,mode,name)
        selected=picked.file
        selection={mode,candidateCount:picked.candidateCount,capped:found.capped}
      }
      const key=String(selected.resourceKey||shared.type==='file'&&shared.resourceKey||'')
      const {meta,bytes}=await driveFileBytes(account,selected.id,{signal,resourceKey:key,metadata:selected})
      const json={...item.json,driveFile:meta,driveSelection:selection,driveDownloadUrl:downloadUrl(account.id,selected.id,key)}
      if(['image/jpeg','image/png'].includes(meta.mimeType)){
        const stored=await storeWorkflowImage(user.id,bytes.toString('base64'),meta.mimeType)
        Object.assign(json,{imageUrl:stored.imageUrl,imagePreviewUrl:stored.previewUrl,imageMime:stored.mimeType})
      }
      output.push({json})
    }else if(operation==='list'){
      const search=String(resolveValue(node.data.search||'',item.json)).trim()
      if(search.length>100)throw new Error('Pencarian Drive maksimal 100 karakter.')
      const q=`trashed = false${search?` and name contains '${search.replace(/\\/g,'\\\\').replace(/'/g,"\\'")}'`:''}`
      const response=await driveRequest(account,'files',{query:{q,pageSize:'30',fields:'nextPageToken,files(id,name,mimeType,size,webViewLink,modifiedTime,capabilities(canDownload))',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true'},signal})
      const body=await response.json()
      output.push({json:{...item.json,driveFiles:(body.files||[]).map(file=>({...file,downloadUrl:downloadUrl(account.id,file.id,file.resourceKey)})),driveHasMore:Boolean(body.nextPageToken),driveAccount:account.email}})
    }else if(operation==='view'||operation==='download'){
      const fileId=String(resolveValue(node.data.fileId||'{{ $json.driveFileId }}',item.json)).trim()
      if(operation==='view'){
        const meta=await driveFileMetadata(account,fileId,{signal})
        output.push({json:{...item.json,driveFile:meta,driveDownloadUrl:downloadUrl(account.id,fileId,meta.resourceKey)}})
      }else{
        const {meta,bytes}=await driveFileBytes(account,fileId,{signal})
        const json={...item.json,driveFile:meta,driveDownloadUrl:downloadUrl(account.id,fileId,meta.resourceKey)}
        if(['image/jpeg','image/png'].includes(meta.mimeType)){
          const stored=await storeWorkflowImage(user.id,bytes.toString('base64'),meta.mimeType)
          Object.assign(json,{imageUrl:stored.imageUrl,imagePreviewUrl:stored.previewUrl,imageMime:stored.mimeType})
        }
        output.push({json})
      }
    }else throw new Error('Tindakan Google Drive tidak didukung.')
  }
  return output
}

router.get('/accounts',requireUser,(req,res)=>{
  res.json({enabled:Boolean(clientId()&&clientSecret()),accounts:db.prepare('select id,email from google_drive_accounts where user_id=? order by created_at desc').all(req.user.id)})
})
router.get('/connect',requireUser,(req,res)=>{
  if(!clientId()||!clientSecret())return res.status(503).json({error:'Google OAuth belum dikonfigurasi di server.'})
  const state=randomBytes(24).toString('hex')
  res.cookie(stateCookie,state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/google-drive/callback',maxAge:600000})
  const url=new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search=new URLSearchParams({client_id:clientId(),redirect_uri:redirectUri(),response_type:'code',scope:'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email',access_type:'offline',prompt:'consent select_account',state}).toString()
  res.redirect(url.toString())
})
router.get('/callback',async(req,res)=>{
  const failure=()=>res.redirect(`${appOrigin}/?driveOAuth=error`)
  try{
    const cookies=parseCookies(req.headers.cookie)
    res.clearCookie(stateCookie,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/google-drive/callback'})
    const session=cookies[sessionCookieName]?db.prepare('select user_id from sessions where token_hash=? and expires_at>?').get(hashToken(cookies[sessionCookieName]),Date.now()):null
    if(!session||!cookies[stateCookie]||cookies[stateCookie]!==req.query.state||typeof req.query.code!=='string')return failure()
    const token=await googleToken({code:req.query.code,redirect_uri:redirectUri(),grant_type:'authorization_code'})
    if(!token.refresh_token)return failure()
    const response=await fetch('https://www.googleapis.com/oauth2/v2/userinfo',{headers:{Authorization:`Bearer ${token.access_token}`},signal:AbortSignal.timeout(10000)})
    const profile=await response.json().catch(()=>({}))
    const email=String(profile.email||'').toLowerCase()
    if(!response.ok||!email)return failure()
    db.prepare(`insert into google_drive_accounts(id,user_id,email,encrypted_refresh_token) values(?,?,?,?) on conflict(user_id,email) do update set encrypted_refresh_token=excluded.encrypted_refresh_token,updated_at=datetime('now')`).run(randomUUID(),session.user_id,email,encryptSocialToken(token.refresh_token))
    res.redirect(`${appOrigin}/?driveOAuth=connected`)
  }catch{return failure()}
})
router.get('/download/:accountId/:fileId',requireUser,async(req,res)=>{
  try{
    const account=accountForUser(req.user.id,req.params.accountId)
    if(!account)return res.status(404).json({error:'Akun Google Drive tidak ditemukan.'})
    const {meta,bytes}=await driveFileBytes(account,req.params.fileId,{resourceKey:String(req.query.resourceKey||'')})
    const name=String(meta.name||'download').replace(/[\r\n"\\/]/g,'_').slice(0,150)
    res.set({'Content-Type':meta.mimeType||'application/octet-stream','Content-Length':String(bytes.length),'Content-Disposition':`attachment; filename="${name}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})
    res.end(bytes)
  }catch(error){res.status(400).json({error:String(error.message||error)})}
})
router.delete('/accounts/:id',requireSameOrigin,requireUser,(req,res)=>{
  db.prepare('delete from google_drive_accounts where id=? and user_id=?').run(req.params.id,req.user.id)
  res.status(204).end()
})

export const googleDriveRouter=router
