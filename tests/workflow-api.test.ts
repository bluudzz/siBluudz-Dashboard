import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

test('workflow API checks readiness before AI calls and rejects simultaneous runs without a cooldown',async t=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-readiness-'))
  process.env.NODE_ENV='test'
  process.env.NINEROUTER_API_KEY='isolated-test-key'
  let calls=0
  const app=express()
  app.use(express.json())
  app.post('/mock/v1/chat/completions',async(_req,res)=>{
    calls++
    await new Promise(resolve=>setTimeout(resolve,150))
    res.json({choices:[{message:{role:'assistant',content:'Hasil pengujian'}}],usage:{prompt_tokens:1,completion_tokens:1}})
  })
  const server=app.listen(0,'127.0.0.1')
  await new Promise(resolve=>server.once('listening',resolve))
  const address=server.address()
  assert.ok(address&&typeof address!=='string')
  const origin=`http://127.0.0.1:${address.port}`
  process.env.NINEROUTER_BASE_URL=origin+'/mock/v1'
  const {db}=await import('../server/db.js')
  const {default:routes}=await import('../server/routes/automation.routes.js')
  app.use('/api/workflows',routes)
  t.after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));db.close()})
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('readiness','readiness@example.test','Test','admin')
  db.prepare('insert into sessions (token_hash,user_id,expires_at) values (?,?,?)').run(createHash('sha256').update('readiness-token').digest('hex'),'readiness',Date.now()+60000)
  const request=(path='',method='GET',body?:unknown)=>fetch(origin+'/api/workflows'+path,{method,headers:{Cookie:'sibluudz_session=readiness-token',Origin:origin,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})})
  const created=await (await request('','POST',{name:'Readiness test',template:'chat-agent'})).json()
  const path='/'+created.id
  const graph=(await (await request(path)).json()).workflow
  const legacy=[...graph.nodes,{id:'legacy-radar',type:'radar',position:{x:0,y:0},data:{label:'Riset lama'}}]
  db.prepare('update workflows set nodes=? where id=?').run(JSON.stringify(legacy),created.id)
  const opened=await (await request(path)).json()
  assert.equal(opened.workflow.nodes.some(node=>node.type==='radar'),false)
  assert.equal(JSON.parse(db.prepare('select nodes from workflows where id=?').get(created.id).nodes).length,legacy.length)
  assert.equal((await request(path+'/execute','POST',{})).status,422)
  assert.equal(calls,0)
  assert.equal((await request(path+'/test-node','POST',{nodeId:'chat-1'})).status,200)
  graph.nodes.find(node=>node.id==='model-1').data.model='test-model'
  assert.equal((await request(path,'PUT',graph)).status,200)
  const responses=await Promise.all([
    request(path+'/chat','POST',{message:'First',sessionId:'first'}),
    request(path+'/chat','POST',{message:'Second',sessionId:'second'}),
  ])
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,409])
  assert.equal(calls,1)
  assert.equal((await request(path+'/chat','POST',{message:'Next',sessionId:'next'})).status,200)
  assert.equal(calls,2)
  const running=request(path+'/chat','POST',{message:'Stop this run',sessionId:'stop'})
  await new Promise(resolve=>setTimeout(resolve,25))
  const stopped=await request(path+'/stop','POST',{})
  assert.equal(stopped.status,200)
  const stoppedRun=await running
  assert.equal(stoppedRun.status,200)
  assert.equal((await stoppedRun.json()).status,'cancelled')
  assert.equal((await request(path+'/stop','POST',{})).status,409)
})
