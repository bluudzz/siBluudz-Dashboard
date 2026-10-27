import { createHash, randomUUID } from 'node:crypto'
import { db } from './db.js'
import { decryptSocialToken } from './utils/social-crypto.js'
import { resolveValue } from '../shared/workflow-engine.js'
import { validatePublicUrl } from './workflow-external.js'
import { inspectInstagramAccess } from './instagram-access.js'

const modes={facebook:'graph.facebook.com',instagram:'graph.instagram.com'}
const mediaFields='id,caption,media_type,media_url,permalink,timestamp'

function graphVersion() {
  const version=process.env.META_GRAPH_VERSION||'v25.0'
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('META_GRAPH_VERSION tidak valid.')
  return version
}

export function accountForUser(userId,accountId) {
  return db.prepare('select id,user_id,label,ig_user_id,username,auth_mode,encrypted_token from instagram_accounts where id=? and user_id=?').get(accountId,userId)
}

export async function metaRequest(account,path,{method='GET',params={},fetchImpl=fetch,bearerToken}={}) {
  const host=modes[account.auth_mode]
  if (!host) throw new Error('Konfigurasi akun Instagram tidak valid.')
  if (!/^\/?[\w,/.-]+$/.test(path) || path.includes('..')) throw new Error('Endpoint Instagram tidak valid.')
  const url=new URL(`https://${host}/${graphVersion()}/${path.replace(/^\//,'')}`)
  const token=bearerToken||decryptSocialToken(account.encrypted_token)
  const form=new URLSearchParams(params)
  if (method==='GET') url.search=form.toString()
  const response=await fetchImpl(url,{method,headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(method==='POST'?{body:form.toString()}:{}),signal:AbortSignal.timeout(30_000),redirect:'error'})
  const raw=await response.text()
  let body
  try { body=JSON.parse(raw) } catch { throw new Error(`Meta API mengembalikan respons tidak valid (${response.status}).`) }
  if (!response.ok || body?.error) throw new Error(`Meta API (${response.status}): ${String(body?.error?.message||'Permintaan ditolak.').slice(0,300)}`)
  return body
}

export async function verifyInstagramAccount(account,{request=metaRequest,...options}={}) {
  const body=await request(account,account.ig_user_id,{params:{fields:'id,username'},...options})
  if (String(body.id)!==String(account.ig_user_id)) throw new Error('ID akun Instagram tidak cocok dengan token.')
  return {id:String(body.id),username:String(body.username||'')}
}

function publicImageUrl(value) {
  const url=validatePublicUrl(String(value||''))
  if (url.protocol!=='https:') throw new Error('Gambar Instagram harus tersedia di URL HTTPS publik.')
  return url.toString()
}

export async function publishInstagramImages(account,images,caption,{request=metaRequest}={}) {
  if (!Array.isArray(images)||images.length<1||images.length>10) throw new Error('Instagram menerima 1 sampai 10 gambar per post.')
  if (typeof caption!=='string'||caption.length>2200) throw new Error('Caption Instagram maksimal 2.200 karakter.')
  const urls=images.map(publicImageUrl)
  let creationId
  if (urls.length===1) {
    const container=await request(account,`${account.ig_user_id}/media`,{method:'POST',params:{image_url:urls[0],caption}})
    creationId=String(container.id||'')
  } else {
    const children=[]
    for (const imageUrl of urls) {
      const child=await request(account,`${account.ig_user_id}/media`,{method:'POST',params:{image_url:imageUrl,is_carousel_item:'true'}})
      if (!child.id) throw new Error('Meta tidak mengembalikan ID gambar carousel.')
      children.push(String(child.id))
    }
    const carousel=await request(account,`${account.ig_user_id}/media`,{method:'POST',params:{media_type:'CAROUSEL',children:children.join(','),caption}})
    creationId=String(carousel.id||'')
  }
  if (!creationId) throw new Error('Meta tidak mengembalikan ID container publikasi.')
  const published=await request(account,`${account.ig_user_id}/media_publish`,{method:'POST',params:{creation_id:creationId}})
  if (!published.id) throw new Error('Meta tidak mengembalikan ID post yang dipublikasikan.')
  return {mediaId:String(published.id),containerId:creationId}
}

export async function runInstagramNode({node,input},user,workflowId,{request=metaRequest,publish=publishInstagramImages}={}) {
  const accountId=String(node.data.accountId||'')
  const account=accountForUser(user.id,accountId)
  if (!account) throw new Error('Pilih akun Instagram yang terhubung pada node ini.')
  const operation=String(node.data.operation||'publish')
  const access=await inspectInstagramAccess(account,{request})
  const action=access.actions.find(item=>item.id===operation)
  if(!action?.enabled)throw new Error(action?.reason||'Tindakan Instagram tidak didukung.')
  if (operation==='list') {
    const body=await request(account,`${account.ig_user_id}/media`,{params:{fields:mediaFields,limit:'20'}})
    return input.map(item=>({json:{...item.json,instagramPosts:Array.isArray(body.data)?body.data:[]}}))
  }
  if (operation==='inspect') {
    return await Promise.all(input.map(async item=>{
      const mediaId=String(resolveValue(node.data.mediaId||'{{ $json.instagramMediaId }}',item.json)).trim()
      if (!/^\d{5,30}$/.test(mediaId)) throw new Error('ID post Instagram tidak valid.')
      const post=await request(account,mediaId,{params:{fields:mediaFields}})
      return {json:{...item.json,instagramPost:post}}
    }))
  }
  if (operation==='reels') {
    const caption=node.data.caption
      ? String(resolveValue(node.data.caption,input[0]?.json||{})).trim()
      : String(input[0]?.json?.caption||'').trim()
    const videoUrl=publicImageUrl(resolveValue(node.data.videoUrl||'{{ $json.videoUrl }}',input[0]?.json||{}))
    const coverUrl=node.data.coverUrl?publicImageUrl(resolveValue(node.data.coverUrl,input[0]?.json||{})):undefined
    const containerParams={media_type:'REELS',video_url:videoUrl,caption,...(coverUrl?{cover_url:coverUrl}:{})}
    const container=await request(account,`${account.ig_user_id}/media`,{method:'POST',params:containerParams})
    if(!container.id)throw new Error('Meta tidak mengembalikan ID container Reel.')
    // Poll until container is ready (FINISHED) or failed
    const containerId=String(container.id)
    for(let i=0;i<30;i++){
      await new Promise(r=>setTimeout(r,2000))
      const status=await request(account,containerId,{params:{fields:'status_code'}})
      if(status.status_code==='FINISHED')break
      if(status.status_code==='ERROR')throw new Error('Meta gagal memproses video Reel.')
    }
    const published=await request(account,`${account.ig_user_id}/media_publish`,{method:'POST',params:{creation_id:containerId}})
    if(!published.id)throw new Error('Meta tidak mengembalikan ID Reel yang dipublikasikan.')
    return [{json:{...input[0].json,instagramMediaId:String(published.id),instagramStatus:'published',instagramMediaType:'REELS'}}]
  }
  if (operation==='stories') {
    const imageUrl=publicImageUrl(resolveValue(node.data.imageUrl||'{{ $json.imageUrl }}',input[0]?.json||{}))
    const container=await request(account,`${account.ig_user_id}/media`,{method:'POST',params:{image_url:imageUrl,media_type:'STORIES'}})
    if(!container.id)throw new Error('Meta tidak mengembalikan ID container Story.')
    const published=await request(account,`${account.ig_user_id}/media_publish`,{method:'POST',params:{creation_id:String(container.id)}})
    if(!published.id)throw new Error('Meta tidak mengembalikan ID Story yang dipublikasikan.')
    return [{json:{...input[0].json,instagramMediaId:String(published.id),instagramStatus:'published',instagramMediaType:'STORIES'}}]
  }
  if (operation==='comments') {
    const mediaId=String(resolveValue(node.data.mediaId||'{{ $json.instagramMediaId }}',input[0]?.json||{})).trim()
    if(!/^\d{5,30}$/.test(mediaId))throw new Error('ID post Instagram tidak valid.')
    const body=await request(account,`${mediaId}/comments`,{params:{fields:'id,text,username,timestamp',limit:'50'}})
    return input.map(item=>({json:{...item.json,instagramComments:Array.isArray(body.data)?body.data:[]}}))
  }
  if (operation==='insights') {
    const metrics='impressions,reach,profile_views'
    const period='day'
    const body=await request(account,`${account.ig_user_id}/insights`,{params:{metric:metrics,period,metric_type:'total_value'}}).catch(()=>({data:[]}))
    return input.map(item=>({json:{...item.json,instagramInsights:Array.isArray(body.data)?body.data:[]}}))
  }
  if (operation!=='publish') throw new Error('Operasi Instagram tidak didukung.')
  const caption=node.data.caption
    ? String(resolveValue(node.data.caption,input[0]?.json||{})).trim()
    : String(input[0]?.json?.caption||'').trim()
  const images=input.map(item=>{
    if (item.json.imageMime && item.json.imageMime!=='image/jpeg') throw new Error('Instagram membutuhkan JPEG. Pilih model gambar yang menghasilkan JPEG sebelum memposting.')
    return resolveValue(node.data.imageUrl||'{{ $json.imageUrl }}',item.json)
  })
  const normalizedImages=images.map(publicImageUrl)
  const contentHash=createHash('sha256').update(JSON.stringify({accountId,caption,images:normalizedImages})).digest('hex')
  const existing=db.prepare('select status,media_id from instagram_publications where user_id=? and workflow_id=? and node_id=? and content_hash=?').get(user.id,workflowId,node.id,contentHash)
  if (existing?.status==='published') return [{json:{...input[0].json,instagramMediaId:existing.media_id,instagramStatus:'already_published',instagramImageCount:images.length}}]
  if (existing) throw new Error('Publikasi sebelumnya masih belum pasti. Periksa akun Instagram sebelum mencoba lagi agar post tidak terduplikasi.')
  const publicationId=randomUUID()
  db.prepare("insert into instagram_publications (id,user_id,workflow_id,node_id,content_hash,account_id,status) values (?,?,?,?,?,?,'preparing')").run(publicationId,user.id,workflowId,node.id,contentHash,accountId)
  let publishStarted=false
  try {
    publishStarted=true
    db.prepare("update instagram_publications set status='publishing',updated_at=datetime('now') where id=?").run(publicationId)
    const result=await publish(account,normalizedImages,caption,{request})
    db.prepare("update instagram_publications set status='published',media_id=?,updated_at=datetime('now') where id=?").run(result.mediaId,publicationId)
    return [{json:{...input[0].json,instagramMediaId:result.mediaId,instagramStatus:'published',instagramImageCount:images.length}}]
  } catch(error) {
    if (!publishStarted) db.prepare('delete from instagram_publications where id=?').run(publicationId)
    throw error
  }
}
