import test from 'node:test'
import assert from 'node:assert/strict'
import { publishInstagramImages, verifyInstagramAccount } from '../server/workflow-instagram.js'

const account={ig_user_id:'123456789'}

test('Instagram verification requests only identity fields supported by the account route',async()=>{
  let fields=''
  const verified=await verifyInstagramAccount(account,{request:async(_account:any,path:string,options:any)=>{
    assert.equal(path,'123456789')
    fields=options.params.fields
    return {id:'123456789',username:'bluudzstore'}
  }})
  assert.equal(fields,'id,username')
  assert.deepEqual(verified,{id:'123456789',username:'bluudzstore'})
  await assert.rejects(()=>verifyInstagramAccount(account,{request:async()=>({id:'99999',username:'wrong'})}),/tidak cocok/)
})

test('Instagram single image creates a container before publishing',async()=>{
  const calls:any[]=[]
  const result=await publishInstagramImages(account,['https://example.com/a.jpg'],'Caption',{request:async(_account:any,path:string,options:any)=>{
    calls.push({path,...options})
    return {id:calls.length===1?'container-1':'post-1'}
  }})
  assert.deepEqual(result,{mediaId:'post-1',containerId:'container-1'})
  assert.deepEqual(calls.map(call=>call.path),['123456789/media','123456789/media_publish'])
  assert.equal(calls[0].params.image_url,'https://example.com/a.jpg')
  assert.equal(calls[1].params.creation_id,'container-1')
})

test('Instagram carousel creates child containers and publishes once',async()=>{
  const calls:any[]=[]
  const result=await publishInstagramImages(account,['https://example.com/1.jpg','https://example.com/2.jpg'],'Carousel',{request:async(_account:any,path:string,options:any)=>{
    calls.push({path,...options})
    return {id:['child-1','child-2','container-1','post-1'][calls.length-1]}
  }})
  assert.equal(result.mediaId,'post-1')
  assert.equal(calls.length,4)
  assert.equal(calls[2].params.media_type,'CAROUSEL')
  assert.equal(calls[2].params.children,'child-1,child-2')
  assert.equal(calls[3].path,'123456789/media_publish')
})

test('Instagram rejects private image URLs and more than ten slides',async()=>{
  await assert.rejects(()=>publishInstagramImages(account,['http://localhost/p.jpg'],'',{}),/publik|HTTPS|URL/i)
  await assert.rejects(()=>publishInstagramImages(account,Array(11).fill('https://example.com/p.jpg'),'',{}),/1 sampai 10/)
})
