import test from 'node:test'
import assert from 'node:assert/strict'
import { newsItems, publicIpv4, runExternalNode, validatePublicUrl } from '../server/workflow-external.js'

test('public URL guard rejects local, private and credential-bearing destinations',()=>{
  for (const url of ['http://example.com','https://127.0.0.1/x','https://localhost/x','https://user:pass@example.com/x','https://example.com:8443/x','https://example.com/#part','https://example.com/data?api_key=secret']) assert.throws(()=>validatePublicUrl(url))
  assert.equal(validatePublicUrl('https://example.com/data.json').hostname,'example.com')
  for (const address of ['127.0.0.1','10.1.2.3','172.16.0.1','192.168.1.1','169.254.169.254','100.64.0.1','203.0.113.7']) assert.equal(publicIpv4(address),false)
  assert.equal(publicIpv4('8.8.8.8'),true)
})

test('search node sends only the topic to the fixed news endpoint and returns sources',async()=>{
  let requested=''
  const result=await runExternalNode({node:{type:'searchContent',data:{query:'{{ $json.topic }}',limit:'2'}},input:[{json:{topic:'Ide carousel',product:'Contoh'}}]},async url=>{
    requested=url
    return {status:200,contentType:'application/rss+xml',body:'<rss><channel><item><title>Berita A &amp; B</title><link>https://example.com/a</link><pubDate>Mon, 26 Oct 2026 10:00:00 GMT</pubDate><source>Media A</source></item></channel></rss>'}
  })
  const url=new URL(requested)
  assert.equal(url.hostname,'news.google.com')
  assert.equal(url.searchParams.get('q'),'Ide carousel')
  assert.equal(result[0].json.sourceCount,1)
  assert.equal(result[0].json.sources[0].title,'Berita A & B')
  assert.equal(result[0].json.product,'Contoh')
  assert.equal(newsItems('<item><title>Judul</title><link>https://example.com</link></item>',1).length,1)
})

test('HTTP node returns parsed JSON with the original workflow fields',async()=>{
  const result=await runExternalNode({node:{type:'httpRequest',data:{url:'{{ $json.sourceUrl }}'}},input:[{json:{sourceUrl:'https://example.com/data.json',topic:'Produk'}}]},async url=>{
    assert.equal(url,'https://example.com/data.json')
    return {status:200,contentType:'application/json',body:'{"title":"Referensi"}'}
  })
  assert.deepEqual(result[0].json.content,{title:'Referensi'})
  assert.equal(result[0].json.topic,'Produk')
  await assert.rejects(runExternalNode({node:{type:'searchContent',data:{query:'x'.repeat(201)}},input:[{json:{}}]},async()=>({status:200,contentType:'',body:''})),/maksimal 200/)
})
