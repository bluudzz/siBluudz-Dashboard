import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { researchWeb } from '../server/workflow-research.js'
import { parseGoogleDriveLink } from '../shared/google-drive-link.js'

test('shared Google Drive links accept file and folder IDs only from Google hosts',()=>{
  assert.deepEqual(parseGoogleDriveLink('https://drive.google.com/drive/folders/folder-id-12345?resourcekey=folder-key'),{type:'folder',id:'folder-id-12345',resourceKey:'folder-key'})
  assert.deepEqual(parseGoogleDriveLink('https://drive.google.com/file/d/file-id-12345/view?usp=sharing'),{type:'file',id:'file-id-12345',resourceKey:''})
  assert.throws(()=>parseGoogleDriveLink('https://evil.example/file/d/file-id-12345/view'),/Google Drive/)
  assert.throws(()=>parseGoogleDriveLink('http://drive.google.com/file/d/file-id-12345/view'),/HTTPS/)
})

test('web research reads no more than five public pages and keeps source URLs',async()=>{
  let reads=0
  const feed='<rss>'+Array.from({length:8},(_,index)=>`<item><title>Source ${index}</title><link>https://example.com/page-${index}</link></item>`).join('')+'</rss>'
  const result=await researchWeb('Roblox update',{read:async url=>{
    if(url.includes('bing.com'))return {body:feed,contentType:'application/rss+xml'}
    reads++
    return {body:`<html><script>ignore</script><p>Verified page ${reads}</p></html>`,contentType:'text/html'}
  }})
  assert.equal(reads,5)
  assert.equal(result.pages.length,5)
  assert.equal(result.pages[0].url,'https://example.com/page-0')
  assert.equal(result.pages[0].content.includes('ignore'),false)
})

test('Google Drive image download gives Instagram a tokenized image URL without exposing OAuth tokens',async()=>{
  process.env.DATA_DIRECTORY=mkdtempSync(join(tmpdir(),'sibluudz-drive-'))
  process.env.SOCIAL_CREDENTIALS_KEY=randomBytes(32).toString('base64')
  process.env.GOOGLE_DRIVE_CLIENT_ID='test-client'
  process.env.GOOGLE_DRIVE_CLIENT_SECRET='test-secret'
  process.env.PUBLIC_BASE_URL='https://panel.example.com'
  const {db}=await import('../server/db.js')
  const {encryptSocialToken}=await import('../server/utils/social-crypto.js')
  const {runDriveNode,chooseSharedFile}=await import('../server/workflow-drive.js')
  db.prepare('insert into users(id,email,name) values(?,?,?)').run('drive-user','drive@example.test','Drive')
  db.prepare('insert into google_drive_accounts(id,user_id,email,encrypted_refresh_token) values(?,?,?,?)').run('drive-account','drive-user','owner@example.test',encryptSocialToken('private-refresh'))
  const originalFetch=globalThis.fetch
  const png=await sharp({create:{width:2,height:2,channels:3,background:'#ff0000'}}).png().toBuffer()
  globalThis.fetch=async(url:any,options:any)=>{
    const target=String(url)
    if(target.includes('/token'))return new Response(JSON.stringify({access_token:'short-access'}),{headers:{'Content-Type':'application/json'}})
    assert.equal(options.headers.Authorization,'Bearer short-access')
    if(target.includes('files/folder-id-12345')){
      assert.equal(options.headers['X-Goog-Drive-Resource-Keys'],'folder-id-12345/folder-key')
      return new Response(JSON.stringify({id:'folder-id-12345',mimeType:'application/vnd.google-apps.folder'}),{headers:{'Content-Type':'application/json'}})
    }
    if(target.includes('/files?')){
      assert.equal(options.headers['X-Goog-Drive-Resource-Keys'],'folder-id-12345/folder-key')
      return new Response(JSON.stringify({files:[{id:'file-id-12345',name:'slide-a.png',mimeType:'image/png',size:String(png.length),resourceKey:'child-key',capabilities:{canDownload:true}},{id:'file-id-67890',name:'slide-b.png',mimeType:'image/png',size:String(png.length),resourceKey:'child-key',capabilities:{canDownload:true}}]}),{headers:{'Content-Type':'application/json'}})
    }
    if(target.includes('alt=media')){
      if(target.includes('file-id-67890'))assert.equal(options.headers['X-Goog-Drive-Resource-Keys'],'file-id-67890/child-key')
      return new Response(png,{headers:{'Content-Type':'image/png'}})
    }
    return new Response(JSON.stringify({id:'file-id-12345',name:'slide.png',mimeType:'image/png',size:String(png.length),capabilities:{canDownload:true}}),{headers:{'Content-Type':'application/json'}})
  }
  try{
    const output=await runDriveNode({node:{data:{accountId:'drive-account',operation:'download',fileId:'file-id-12345'}},input:[{json:{caption:'Caption'}}]},{id:'drive-user'})
    assert.match(output[0].json.imageUrl,/^https:\/\/panel\.example\.com\/api\/workflow-media\/[a-f0-9]{48}$/)
    assert.equal(output[0].json.imageMime,'image/jpeg')
    assert.equal(output[0].json.caption,'Caption')
    assert.equal(JSON.stringify(output).includes('private-refresh'),false)
    const fromShared=await runDriveNode({node:{data:{accountId:'drive-account',operation:'shared',sharedLink:'https://drive.google.com/drive/folders/folder-id-12345?resourcekey=folder-key',selectionMode:'name',nameFilter:'slide-b'}},input:[{json:{caption:'Dari folder'}}]},{id:'drive-user'})
    assert.equal(fromShared[0].json.driveFile.name,'slide-b.png')
    assert.equal(fromShared[0].json.driveSelection.mode,'name')
    assert.match(fromShared[0].json.imageUrl,/^https:\/\/panel\.example\.com\/api\/workflow-media\//)
    assert.equal(chooseSharedFile([{name:'a.jpg',mimeType:'image/jpeg',capabilities:{canDownload:true}},{name:'b.jpg',mimeType:'image/jpeg',capabilities:{canDownload:true}}],'random','',()=>1).file.name,'b.jpg')
  }finally{globalThis.fetch=originalFetch;db.close()}
})
