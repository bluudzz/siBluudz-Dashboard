import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'
import { encryptSocialToken } from '../utils/social-crypto.js'
import { accountForUser, metaRequest, verifyInstagramAccount } from '../workflow-instagram.js'
import { discoverInstagramAccount, inspectInstagramAccess, normalizeInstagramUsername } from '../instagram-access.js'

const router=Router()
const publicAccount=row=>({id:row.id,label:row.label,igUserId:row.ig_user_id,username:row.username,authMode:row.auth_mode,createdAt:row.created_at})

router.get('/accounts',requireUser,(req,res)=>{
  const rows=db.prepare('select id,label,ig_user_id,username,auth_mode,created_at from instagram_accounts where user_id=? order by created_at desc').all(req.user.id)
  res.json({accounts:rows.map(publicAccount)})
})

router.post('/accounts',requireSameOrigin,requireUser,async(req,res)=>{
  const suppliedId=String(req.body?.igUserId||'').trim()
  const username=String(req.body?.username||'').trim()
  const authMode=String(req.body?.authMode||'')
  const token=String(req.body?.accessToken||'').trim()
  if ((!username&&!suppliedId)||(suppliedId&&!/^\d{5,30}$/.test(suppliedId))||!['facebook','instagram'].includes(authMode)||!token||token.length>4000) return res.status(400).json({error:'Isi username dan token Meta yang valid.'})
  try {
    const encryptedToken=encryptSocialToken(token)
    const connection={ig_user_id:suppliedId,auth_mode:authMode,encrypted_token:encryptedToken}
    const verified=suppliedId?await verifyInstagramAccount(connection):await discoverInstagramAccount(connection,username,{request:metaRequest})
    if(username&&normalizeInstagramUsername(username)!==String(verified.username).toLowerCase())throw new Error('Username tidak cocok dengan akun dari token dan ID ini.')
    const igUserId=verified.id
    const label='@'+verified.username
    const existing=db.prepare('select id from instagram_accounts where user_id=? and ig_user_id=? and auth_mode=?').get(req.user.id,igUserId,authMode)
    if(existing) {
      db.prepare("update instagram_accounts set label=?,username=?,encrypted_token=?,updated_at=datetime('now') where id=? and user_id=?").run(label,verified.username,encryptedToken,existing.id,req.user.id)
      return res.json({account:{id:existing.id,label,igUserId,username:verified.username,authMode}})
    }
    const id=randomUUID()
    db.prepare('insert into instagram_accounts (id,user_id,label,ig_user_id,username,auth_mode,encrypted_token) values (?,?,?,?,?,?,?)').run(id,req.user.id,label,igUserId,verified.username,authMode,encryptedToken)
    res.status(201).json({account:{id,label,igUserId,username:verified.username,authMode}})
  }catch(error){res.status(400).json({error:error.message})}
})

router.post('/accounts/:id/verify',requireSameOrigin,requireUser,async(req,res)=>{
  const account=accountForUser(req.user.id,req.params.id)
  if(!account)return res.status(404).json({error:'Akun Instagram tidak ditemukan.'})
  try{
    const verified=await verifyInstagramAccount(account)
    db.prepare("update instagram_accounts set username=?,updated_at=datetime('now') where id=? and user_id=?").run(verified.username,account.id,req.user.id)
    res.json({verified:true,username:verified.username})
  }catch(error){res.status(400).json({error:error.message})}
})

router.get('/accounts/:id/capabilities',requireUser,async(req,res)=>{
  const account=accountForUser(req.user.id,req.params.id)
  if(!account)return res.status(404).json({error:'Akun Instagram tidak ditemukan.'})
  try{res.json(await inspectInstagramAccess(account,{request:metaRequest}))}
  catch(error){res.status(400).json({error:error.message})}
})

router.get('/accounts/:id/posts',requireUser,async(req,res)=>{
  const account=accountForUser(req.user.id,req.params.id)
  if(!account)return res.status(404).json({error:'Akun Instagram tidak ditemukan.'})
  try{
    const body=await metaRequest(account,`${account.ig_user_id}/media`,{params:{fields:'id,caption,media_type,permalink,timestamp',limit:'20'}})
    res.json({posts:Array.isArray(body.data)?body.data:[]})
  }catch(error){res.status(400).json({error:error.message})}
})

router.delete('/accounts/:id',requireSameOrigin,requireUser,(req,res)=>{
  const deleted=db.prepare('delete from instagram_accounts where id=? and user_id=?').run(req.params.id,req.user.id)
  if(!deleted.changes)return res.status(404).json({error:'Akun Instagram tidak ditemukan.'})
  res.status(204).end()
})

export default router
