import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

test('Instagram connection discovers ID, hides tokens, isolates accounts and enforces denied actions',async t=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-instagram-'))
  process.env.SOCIAL_CREDENTIALS_KEY=randomBytes(32).toString('base64')
  delete process.env.META_APP_ACCESS_TOKEN
  const {db}=await import('../server/db.js')
  const {default:routes}=await import('../server/routes/instagram.routes.js')
  const {runInstagramNode}=await import('../server/workflow-instagram.js')
  const originalFetch=globalThis.fetch
  globalThis.fetch=async(url:any,options:any)=>{
    const parsed=new URL(String(url))
    assert.equal(parsed.hostname,'graph.facebook.com')
    assert.equal(options.headers.Authorization,'Bearer private-test-token')
    const path=parsed.pathname.replace(/^\/v\d+\.\d+\//,'')
    const body=path==='me'?{id:'1440864649100576',instagram_business_account:{id:'17841427422736181',username:'bluudzstore'}}:path==='me/permissions'?{data:[{permission:'instagram_content_publish',status:'granted'}]}:{data:[]}
    return new Response(JSON.stringify(body),{headers:{'Content-Type':'application/json'}})
  }
  const app=express();app.use(express.json());app.use('/api/instagram',routes)
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve))
  t.after(async()=>{globalThis.fetch=originalFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));db.close()})
  const address=server.address();assert.ok(address&&typeof address!=='string')
  const origin=`http://127.0.0.1:${address.port}`
  db.prepare('insert into users (id,email,name) values (?,?,?)').run('ig-test','ig@example.test','IG')
  db.prepare('insert into users (id,email,name) values (?,?,?)').run('other-test','other@example.test','Other')
  for(const [id,token] of [['ig-test','ig-session'],['other-test','other-session']])db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(createHash('sha256').update(token).digest('hex'),id,Date.now()+60000)
  const api=(path:string,method='GET',body?:unknown,session='ig-session')=>originalFetch(origin+'/api/instagram'+path,{method,headers:{Cookie:'sibluudz_session='+session,Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const payload={username:'@bluudzstore',authMode:'facebook',accessToken:'private-test-token'}
  const connected=await api('/accounts','POST',payload)
  assert.equal(connected.status,201)
  const {account}=await connected.json()
  assert.equal(account.igUserId,'17841427422736181')
  const listed=await (await api('/accounts')).text()
  assert.equal(listed.includes('private-test-token'),false)
  assert.equal(listed.includes('encrypted_token'),false)
  assert.equal((await api('/accounts','POST',payload)).status,200)
  assert.equal((await (await api('/accounts')).json()).accounts.length,1)
  assert.equal((await api('/accounts/'+account.id+'/capabilities','GET',undefined,'other-session')).status,404)
  const access=await (await api('/accounts/'+account.id+'/capabilities')).json()
  assert.equal(access.actions[0].id,'publish')
  assert.equal(access.actions[0].enabled,true)
  let writes=0
  await assert.rejects(()=>runInstagramNode({node:{id:'publish',data:{accountId:account.id,operation:'publish'}},input:[{json:{}}]},{id:'ig-test'},'workflow',{
    request:async(_account:any,path:string)=>path==='me/permissions'?{data:[]}:{data:[]},
    publish:async()=>{writes++;return {mediaId:'unexpected'}}
  }),/belum memiliki izin/)
  assert.equal(writes,0)
})
