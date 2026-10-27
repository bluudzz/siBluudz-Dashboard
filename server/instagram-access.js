import { decryptSocialToken } from './utils/social-crypto.js'

export function normalizeInstagramUsername(value) {
  const username=String(value||'').trim().replace(/^@/,'').toLowerCase()
  if(!/^[a-z0-9._]{1,30}$/.test(username))throw new Error('Isi username Instagram yang valid, misalnya @bluudzstore.')
  return username
}

export async function discoverInstagramAccount(account,username,{request}={}) {
  const expected=normalizeInstagramUsername(username)
  const matches=async profile=>{
    const id=String(profile?.user_id||profile?.id||'')
    if(!/^\d{5,30}$/.test(id))return null
    let identity=profile
    if(!identity.username) {
      try{identity=await request({...account,ig_user_id:id},id,{params:{fields:'id,username'}})}catch{return null}
    }
    return String(identity.username||'').toLowerCase()===expected?{id,username:String(identity.username)}:null
  }
  if(account.auth_mode==='instagram') {
    const profile=await request(account,'me',{params:{fields:'user_id,username'}})
    const found=await matches(profile)
    if(found)return found
    throw new Error('Username tidak cocok dengan akun pemilik token Instagram ini.')
  }
  // Page tokens resolve directly; user tokens can enumerate their managed Pages.
  try {
    const page=await request(account,'me',{params:{fields:'id,instagram_business_account{id,username}'}})
    const found=await matches(page.instagram_business_account)
    if(found)return found
  } catch { /* A User token is not a Page object. Try the managed Pages edge. */ }
  let after=''
  for(let page=0;page<5;page++) {
    let response
    try {response=await request(account,'me/accounts',{params:{fields:'id,instagram_business_account{id,username}',limit:'100',...(after?{after}:{})}})}
    catch {break}
    for(const item of response.data||[]) {
      const found=await matches(item.instagram_business_account)
      if(found)return found
    }
    if(!response.paging?.next||!response.paging?.cursors?.after)break
    after=String(response.paging.cursors.after)
  }
  throw new Error(`@${expected} belum ditemukan pada akun yang dapat diakses token. Periksa username dan token, atau isi ID melalui Pengaturan lanjutan.`)
}

async function readPermissions(account,request) {
  try {
      const result=await request({...account,auth_mode:'facebook'},'debug_token',{...(process.env.META_APP_ACCESS_TOKEN?{bearerToken:process.env.META_APP_ACCESS_TOKEN}:{}),params:{input_token:decryptSocialToken(account.encrypted_token)}})
      if(result.data?.is_valid===false)return {known:true,valid:false,scopes:[]}
      if(result.data?.is_valid===true&&Array.isArray(result.data?.scopes))return {known:true,valid:true,scopes:result.data.scopes.filter(scope=>typeof scope==='string')}
  } catch { /* Some tokens need the issuing app's access token for introspection. */ }
  try {
    const result=await request(account,'me/permissions')
    if(Array.isArray(result.data)&&result.data.every(item=>typeof item.permission==='string'&&typeof item.status==='string'))return {known:true,valid:true,scopes:result.data.filter(item=>item.status==='granted').map(item=>item.permission)}
  } catch { /* Page tokens may not expose /me/permissions. Unknown is not granted. */ }
  return {known:false,valid:true,scopes:[]}
}

export async function inspectInstagramAccess(account,{request}={}) {
  const [permissions,read]=await Promise.all([
    readPermissions(account,request),
    request(account,`${account.ig_user_id}/media`,{params:{fields:'id',limit:'1'}}).then(()=>({ok:true,invalid:false}),error=>({ok:false,invalid:/\(#190\)|OAuthException|access token (?:has expired|is invalid|is malformed)/i.test(String(error?.message||''))})),
  ])
  const tokenValid=!permissions.valid||read.invalid?false:read.ok?true:null
  const scope=account.auth_mode==='instagram'?'instagram_business_content_publish':'instagram_content_publish'
  const canPublish=read.ok&&tokenValid!==false&&permissions.known&&permissions.scopes.includes(scope)
  const commentScope=account.auth_mode==='instagram'?'instagram_business_manage_comments':'instagram_manage_comments'
  const messageScope=account.auth_mode==='instagram'?'instagram_business_manage_messages':'instagram_manage_messages'
  const requiredScopes={reels:scope,stories:scope,comments:commentScope,messages:messageScope}
  const actions=[
    {id:'publish',label:'Terbitkan foto / carousel',enabled:canPublish,reason:canPublish?'Izin publikasi terdeteksi; Meta memeriksa syarat akhir saat publikasi.':tokenValid===false?'Token tidak valid. Perbarui token Meta.':!permissions.known?'Izin token belum dapat dibaca. Periksa konfigurasi aplikasi Meta di server.':!read.ok?'Akses akun belum berhasil diperiksa.':`Token belum memiliki izin ${scope}.`},
    {id:'list',label:'Lihat post terbaru',enabled:read.ok&&tokenValid!==false,reason:tokenValid===false?'Token tidak valid. Perbarui token Meta.':read.ok?'Akses baca berhasil diperiksa.':'Akses baca post belum tersedia untuk token ini.'},
    {id:'inspect',label:'Periksa satu post',enabled:read.ok&&tokenValid!==false,reason:tokenValid===false?'Token tidak valid. Perbarui token Meta.':read.ok?'Akses baca berhasil diperiksa.':'Akses baca post belum tersedia untuk token ini.'},
    {id:'reels',label:'Terbitkan Reel',enabled:canPublish,reason:canPublish?'Izin publikasi terdeteksi; video harus tersedia di URL HTTPS publik.':tokenValid===false?'Token tidak valid. Perbarui token Meta.':!permissions.known?'Izin token belum dapat dibaca.':!read.ok?'Akses akun belum berhasil diperiksa.':`Token belum memiliki izin ${scope}.`},
    {id:'stories',label:'Terbitkan Story',enabled:canPublish,reason:canPublish?'Izin publikasi terdeteksi; gambar harus tersedia di URL HTTPS publik.':tokenValid===false?'Token tidak valid. Perbarui token Meta.':!permissions.known?'Izin token belum dapat dibaca.':!read.ok?'Akses akun belum berhasil diperiksa.':`Token belum memiliki izin ${scope}.`},
    {id:'comments',label:'Baca komentar',enabled:read.ok&&tokenValid!==false&&permissions.known&&permissions.scopes.includes(commentScope),reason:read.ok&&permissions.known&&permissions.scopes.includes(commentScope)?'Akses komentar tersedia.':tokenValid===false?'Token tidak valid.':!permissions.known?'Izin token belum dapat dibaca.':`Token belum memiliki izin ${commentScope}.`},
    {id:'insights',label:'Lihat statistik',enabled:read.ok&&tokenValid!==false,reason:read.ok&&tokenValid!==false?'Akses statistik tersedia.':'Token tidak valid atau akses belum tersedia.'},
    ...[
      ['messages','Kelola pesan'],
    ].map(([id,label])=>({id,label,enabled:false,reason:permissions.valid&&permissions.known&&requiredScopes[id]
      ?(permissions.scopes.includes(requiredScopes[id])?'Izin token terdeteksi; fitur ini belum tersedia di node.':`Izin ${requiredScopes[id]} belum diberikan; fitur ini juga belum tersedia di node.`)
      :'Belum tersedia pada node Instagram ini.'})),
    {id:'delete',label:'Hapus post',enabled:false,reason:'Penghapusan post melalui API belum didukung node ini.'},
  ]
  return {checkedAt:new Date().toISOString(),tokenValid,permissionsKnown:permissions.known,scopes:permissions.scopes,actions:actions.sort((a,b)=>Number(b.enabled)-Number(a.enabled))}
}
