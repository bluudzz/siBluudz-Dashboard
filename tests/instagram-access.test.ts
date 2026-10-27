import test from 'node:test'
import assert from 'node:assert/strict'
import { discoverInstagramAccount, inspectInstagramAccess } from '../server/instagram-access.js'
import { encryptSocialToken } from '../server/utils/social-crypto.js'
import { randomBytes } from 'node:crypto'

test('Page token discovers only the connected account matching the supplied username',async()=>{
  const account={auth_mode:'facebook'}
  const request=async(_account:any,path:string)=>path==='me'?{id:'12345',instagram_business_account:{id:'17841427422736181',username:'bluudzstore'}}:{data:[]}
  assert.deepEqual(await discoverInstagramAccount(account,'@BluudzStore',{request}),{id:'17841427422736181',username:'bluudzstore'})
  await assert.rejects(()=>discoverInstagramAccount(account,'@different',{request}),/belum ditemukan/)
})

test('User token discovery searches paginated managed Pages without following arbitrary next URLs',async()=>{
  const calls:string[]=[]
  const result=await discoverInstagramAccount({auth_mode:'facebook'},'bluudzstore',{request:async(_account:any,path:string,options:any)=>{
    calls.push(path)
    if(path==='me')throw Error('Not a Page token')
    if(!options.params.after)return {data:[],paging:{next:'https://should-not-be-followed.example',cursors:{after:'cursor-2'}}}
    return {data:[{instagram_business_account:{id:'17841427422736181',username:'bluudzstore'}}]}
  }})
  assert.equal(result.id,'17841427422736181')
  assert.deepEqual(calls,['me','me/accounts','me/accounts'])
})

test('Instagram Login resolves user_id and rejects username mismatch',async()=>{
  const request=async()=>({user_id:'17841427422736181',username:'bluudzstore'})
  assert.equal((await discoverInstagramAccount({auth_mode:'instagram'},'bluudzstore',{request})).id,'17841427422736181')
  await assert.rejects(()=>discoverInstagramAccount({auth_mode:'instagram'},'other',{request}),/tidak cocok/)
})

test('Action availability uses granted permissions and successful read checks; unknown is never granted',async()=>{
  const old=process.env.META_APP_ACCESS_TOKEN
  delete process.env.META_APP_ACCESS_TOKEN
  try{
    const account={auth_mode:'facebook',ig_user_id:'123456'}
    const access=await inspectInstagramAccess(account,{request:async(_account:any,path:string)=>path==='me/permissions'?{data:[{permission:'instagram_content_publish',status:'declined'}]}:{data:[]}})
    assert.equal(access.actions.find(action=>action.id==='publish').enabled,false)
    assert.equal(access.actions[0].id,'list')
    const unknown=await inspectInstagramAccess(account,{request:async(_account:any,path:string)=>{if(path==='me/permissions')throw Error('Not supported');return {data:[]}}})
    assert.equal(unknown.permissionsKnown,false)
    assert.equal(unknown.actions.find(action=>action.id==='publish').enabled,false)
    const granted=await inspectInstagramAccess(account,{request:async(_account:any,path:string)=>path==='me/permissions'?{data:[{permission:'instagram_content_publish',status:'granted'}]}:{data:[]}})
    assert.equal(granted.actions[0].id,'publish')
    assert.equal(granted.actions[0].enabled,true)
    assert.equal(granted.actions.find(action=>action.id==='delete').enabled,false)
  }finally{if(old===undefined)delete process.env.META_APP_ACCESS_TOKEN;else process.env.META_APP_ACCESS_TOKEN=old}
})

test('App token introspection grants scoped publishing and rejects invalid tokens without exposing secrets',async()=>{
  const key=process.env.SOCIAL_CREDENTIALS_KEY,app=process.env.META_APP_ACCESS_TOKEN
  process.env.SOCIAL_CREDENTIALS_KEY=randomBytes(32).toString('base64')
  process.env.META_APP_ACCESS_TOKEN='server-only-app-token'
  try {
    const account={auth_mode:'facebook',ig_user_id:'123456',encrypted_token:encryptSocialToken('private-page-token')}
    const access=await inspectInstagramAccess(account,{request:async(_account:any,path:string,options:any)=>{
      if(path==='debug_token'){
        assert.equal(options.bearerToken,'server-only-app-token')
        assert.equal(options.params.input_token,'private-page-token')
        return {data:{is_valid:true,scopes:['instagram_content_publish']}}
      }
      return {data:[]}
    }})
    assert.equal(access.actions[0].enabled,true)
    assert.equal(JSON.stringify(access).includes('private-page-token'),false)
    assert.equal(JSON.stringify(access).includes('server-only-app-token'),false)
    const invalid=await inspectInstagramAccess(account,{request:async(_account:any,path:string)=>path==='debug_token'?{data:{is_valid:false}}:{data:[]}})
    assert.equal(invalid.actions.some(action=>action.enabled),false)
    assert.equal(invalid.tokenValid,false)
    const expired=await inspectInstagramAccess(account,{request:async(_account:any,path:string)=>{
      if(path==='debug_token'||path==='me/permissions')throw Error('Unavailable')
      throw Error('Meta API (400): (#190) Error validating access token')
    }})
    assert.equal(expired.tokenValid,false)
    assert.match(expired.actions.find(action=>action.id==='publish').reason,/Perbarui token/)
  } finally {
    if(key===undefined)delete process.env.SOCIAL_CREDENTIALS_KEY;else process.env.SOCIAL_CREDENTIALS_KEY=key
    if(app===undefined)delete process.env.META_APP_ACCESS_TOKEN;else process.env.META_APP_ACCESS_TOKEN=app
  }
})
