import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('image node sends prompt to 9router and exposes a generated image URL',async t=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-image-'))
  process.env.NINEROUTER_API_KEY='image-test-key'
  process.env.PUBLIC_BASE_URL='https://dashboard.example.com'
  const {db}=await import('../server/db.js')
  const {runImageNode}=await import('../server/workflow-image.js')
  const {storeWorkflowImage}=await import('../server/workflow-media.js')
  const {default:sharp}=await import('sharp')
  t.after(()=>db.close())
  db.prepare('insert into users (id,email,name,role) values (?,?,?,?)').run('image-user','image@example.test','Image','admin')
  const calls:any[]=[]
  const tinyJpeg=Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64')
  const result=await runImageNode({node:{data:{model:'test-image',prompt:'Gambar {{ $json.topic }}',size:'1024x1024'}},input:[{json:{topic:'produk'}}]},
    {id:'image-user',role:'admin'},
    {fetchImpl:async(url:string,options:any)=>{calls.push({url,options});return {ok:true,status:200,text:async()=>JSON.stringify({data:[{b64_json:tinyJpeg}]})}}})
  assert.equal(calls.length,1)
  assert.equal(calls[0].url,'https://api.9router.com/v1/images/generations')
  assert.equal(JSON.parse(calls[0].options.body).prompt,'Gambar produk')
  assert.equal(JSON.parse(calls[0].options.body).size,undefined)
  assert.match(result[0].json.imageUrl,/^https:\/\/dashboard\.example\.com\/api\/workflow-media\/[a-f0-9]{48}$/)
  assert.equal(result[0].json.imageMime,'image/jpeg')
  assert.equal(db.prepare('select count(*) as total from workflow_media').get().total,1)
  const png=await sharp({create:{width:2,height:2,channels:4,background:'#ff0000'}}).png().toBuffer()
  const converted=await storeWorkflowImage('image-user',png.toString('base64'))
  assert.equal(converted.mimeType,'image/jpeg')
  assert.match(converted.imageUrl,/\.com\/api\/workflow-media\//)

  const museCalls:any[]=[]
  const dataUri='data:image/jpeg;base64,'+Buffer.from([0xff,0xd8,0xff,0xd9]).toString('base64')
  await runImageNode({node:{data:{model:'muse-image/muse-image-1',prompt:'kucing'}},input:[{json:{}}]},
    {id:'image-user',role:'admin'},
    {fetchImpl:async(url:string,options:any)=>{museCalls.push({url,options});return{ok:true,status:200,text:async()=>JSON.stringify({choices:[{message:{content:`![image](${dataUri})`}}]})}}})
  assert.equal(museCalls[0].url,'https://api.9router.com/v1/chat/completions')
  assert.equal(JSON.parse(museCalls[0].options.body).model,'muse-image/muse-image-1')
})
