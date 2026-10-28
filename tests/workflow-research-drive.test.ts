import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import sharp from 'sharp'
import { researchWeb, runResearchNode } from '../server/workflow-research.js'
import { parseGoogleDriveLink } from '../shared/google-drive-link.js'

test('shared Google Drive links accept file and folder IDs only from Google hosts',()=>{
  assert.deepEqual(parseGoogleDriveLink('https://drive.google.com/drive/folders/folder-id-12345?resourcekey=folder-key'),{type:'folder',id:'folder-id-12345',resourceKey:'folder-key'})
  assert.deepEqual(parseGoogleDriveLink('https://drive.google.com/file/d/file-id-12345/view?usp=sharing'),{type:'file',id:'file-id-12345',resourceKey:''})
  assert.throws(()=>parseGoogleDriveLink('https://evil.example/file/d/file-id-12345/view'),/Google Drive/)
  assert.throws(()=>parseGoogleDriveLink('http://drive.google.com/file/d/file-id-12345/view'),/HTTPS/)
})

test('web research limits page reads and keeps source URLs',async()=>{
  let reads=0
  const feed='<rss>'+Array.from({length:8},(_,index)=>`<item><title>Source ${index}</title><link>https://example.com/page-${index}</link></item>`).join('')+'</rss>'
  const result=await researchWeb('Roblox update',{read:async url=>{
    if(url.includes('bing.com'))return {body:feed,contentType:'application/rss+xml'}
    if(url.includes('news.google.com'))return {body:'<rss></rss>',contentType:'application/rss+xml'}
    reads++
    return {body:`<html><script>ignore</script><p>Verified page ${reads} contains substantive information and further factual context about the research topic, with enough text to assess.</p></html>`,contentType:'text/html'}
  }})
  assert.equal(reads,5)
  assert.equal(result.pages.length,5)
  assert.match(result.pages[0].url,/^https:\/\/example\.com\/page-/)
  assert.equal(result.pages[0].content.includes('ignore'),false)
})

test('combined information node searches and reads pages or accepts one direct URL',async()=>{
  const feed='<rss><item><title>Source A</title><link>https://example.com/article</link><pubDate>Tue, 27 Oct 2026 10:00:00 GMT</pubDate></item></rss>'
  const searched=await runResearchNode({node:{data:{sourceMode:'search',query:'{{ $json.topic }}'}},input:[{json:{topic:'Roblox update'}}]},{read:async url=>url.includes('bing.com')?{status:200,body:feed,contentType:'application/rss+xml'}:url.includes('news.google.com')?{status:200,body:'<rss></rss>',contentType:'application/rss+xml'}:{status:200,body:'<article>Verified detail provides substantial context and an explanation of the topic from the source page for the following node.</article>',contentType:'text/html'}})
  assert.equal(searched[0].json.query,'Roblox update')
  assert.equal(searched[0].json.readCount,1)
  assert.match(searched[0].json.pages[0].content,/Verified detail provides substantial context/)

  const direct=await runResearchNode({node:{data:{sourceMode:'url',url:'{{ $json.sourceUrl }}'}},input:[{json:{sourceUrl:'https://example.com/data.json'}}]},{read:async()=>({status:200,body:'{"fact":"verified"}',contentType:'application/json'})})
  assert.deepEqual(direct[0].json.content,{fact:'verified'})
  assert.equal(direct[0].json.researchMode,'url')
})

test('research node validates AI query JSON and falls back when the plan is invalid',async()=>{
  const feed='<rss><item><title>Official guide</title><link>https://example.com/guide</link></item></rss>'
  const searched:string[]=[]
  const read=async(url:string)=>{if(url.includes('bing.com')){searched.push(new URL(url).searchParams.get('q')||'');return {status:200,body:feed,contentType:'application/rss+xml'}}if(url.includes('news.google.com'))return {status:200,body:'<rss></rss>',contentType:'application/rss+xml'};return {status:200,body:'<article>Guide content with a detailed practical explanation and examples that can be passed to the next workflow node.</article>',contentType:'text/html'}}
  const node={data:{sourceMode:'search',query:'',model:'ag/test-model',maxPages:'5'}}
  const input=[{json:{prompt:'Cari panduan kopi untuk pemula'}}]
  const planned=await runResearchNode({node,input},{read,planQuery:async({model}:any)=>{assert.equal(model,'ag/test-model');return '{"queries":["panduan kopi resmi","diskusi komunitas kopi"]}'}})
  assert.deepEqual(planned[0].json.queries,['panduan kopi resmi','diskusi komunitas kopi'])
  assert.equal(planned[0].json.researchPlan,'AI planner')
  assert.equal(searched[0],'panduan kopi resmi')
  const fallback=await runResearchNode({node,input},{read,planQuery:async()=>'{"queries":["",123]}'})
  assert.equal(fallback[0].json.researchPlan,'Fallback query planner')
  assert.equal(fallback[0].json.readCount,1)
})

test('research balances angles and searches again when the first sources cannot be read',async()=>{
  const searched:string[]=[]
  const rss=(host:string,count:number)=>'<rss>'+Array.from({length:count},(_,index)=>`<item><title>Topic guide ${index}</title><link>https://${host}/article-${index}</link></item>`).join('')+'</rss>'
  const result=await researchWeb('coffee brewing',{
    maxPages:5,
    queries:['coffee brewing','coffee brewing official','coffee brewing community'],
    read:async(url:string)=>{
      if(url.includes('bing.com')){
        const q=new URL(url).searchParams.get('q')||''
        searched.push(q)
        if(q==='coffee brewing')return {body:rss('first.example',5),contentType:'application/rss+xml'}
        if(q==='coffee brewing official')return {body:rss('official.example',2),contentType:'application/rss+xml'}
        if(q==='coffee brewing community')return {body:rss('forum.example',2),contentType:'application/rss+xml'}
        return {body:rss('followup.example',2),contentType:'application/rss+xml'}
      }
      if(url.includes('news.google.com'))return {body:'<rss></rss>',contentType:'application/rss+xml'}
      if(url.includes('first.example'))throw new Error('blocked')
      return {body:'<article>Detailed source material about coffee brewing with enough context and practical evidence to support the next step of the workflow.</article>',contentType:'text/html'}
    },
  })
  assert.equal(result.pages.length,5)
  assert.ok(result.pages.some(page=>page.url.includes('official.example')))
  assert.ok(result.pages.some(page=>page.url.includes('forum.example')))
  assert.ok(result.followUpQueries.length>0)
  assert.ok(searched.some(q=>q.includes('primary source')))
  assert.ok(result.coverage.domains.includes('official.example'))
  assert.equal(result.coverage.unreadableCount,result.sourceCount-result.readCount)
})

test('optional SearXNG results are used alongside RSS without requiring another local service',async()=>{
  const result=await researchWeb('urban gardening',{
    maxPages:1,
    queries:['urban gardening'],
    searxngUrl:'https://search.example.com',
    read:async(url:string)=>{
      if(url.startsWith('https://search.example.com/search?'))return {body:JSON.stringify({results:[{title:'Urban gardening handbook',url:'https://handbook.example.com/gardening',content:'Practical guide'}]}),contentType:'application/json'}
      if(url.includes('bing.com')||url.includes('news.google.com'))return {body:'<rss></rss>',contentType:'application/rss+xml'}
      return {body:'<article>Urban gardening handbook with practical guidance and detailed explanations for a reader preparing a small garden.</article>',contentType:'text/html'}
    },
  })
  assert.equal(result.searchProvider,'SearXNG + RSS')
  assert.equal(result.readCount,1)
  assert.equal(result.pages[0].url,'https://handbook.example.com/gardening')
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
