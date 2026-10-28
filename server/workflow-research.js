import { getPublicText, newsItems, validatePublicUrl } from './workflow-external.js'
import { resolveValue } from '../shared/workflow-engine.js'

const MAX_PAGES = 5
const DEFAULT_NODE_PAGES = 12
const MAX_QUERIES = 5
const MAX_CANDIDATES_PER_QUERY = 8
const RESEARCH_ANGLES = ['Topik utama','Sumber resmi','Panduan mendalam','Komunitas','Sudut alternatif']

function researchQueries(topic) {
  return [
    topic,
    `${topic} official source documentation primary evidence`,
    `${topic} comprehensive guide explanation examples`,
    `${topic} community discussion experience reddit forum`,
    `${topic} alternative perspective limitations recent update`,
  ]
}

// The research connector expects a short topic, while upstream nodes may
// provide a prompt, a chat message, or a whole object. Normalize all of those
// shapes here so a missing {{ $json.topic }} never stops the workflow.
function standardResearchPrompt(value,seen=new Set()) {
  if(value&&typeof value==='object'){
    const objectValue=value
    if(seen.has(objectValue))return ''
    seen.add(objectValue)
    for(const key of ['query','topic','prompt','originalPrompt','chatInput','input']){
      if(objectValue[key]!==undefined){const found=standardResearchPrompt(objectValue[key],seen);if(found)return found}
    }
    return ''
  }
  return String(value||'').replace(/\s+/g,' ').trim().replace(/^(buat|tolong|carikan|cari|riset|research)\s+(informasi|materi|tentang)?\s*/i,'').slice(0,200)
}

function plainText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/\s+/g,' ').trim().slice(0,4500)
}

function normalizedUrl(raw) {
  try {
    const url=validatePublicUrl(raw)
    url.hash=''
    for(const key of [...url.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/i.test(key))url.searchParams.delete(key)
    return url.toString()
  } catch { return '' }
}

function sourceHost(raw) {
  try { return new URL(raw).hostname.replace(/^www\./,'') } catch { return '' }
}

function relevantScore(source,query,topic) {
  const text=`${source.title||''} ${source.description||''}`.toLowerCase()
  const terms=[...new Set(String(topic).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[])].slice(0,8)
  const overlap=terms.filter(term=>text.includes(term)).length
  const host=sourceHost(source.url)
  const official=/\b(official|documentation|docs|wiki|research|study|panduan|guide)\b/i.test(text)?1:0
  return overlap*3+official+(host&&query.includes(host)?1:0)
}

function roundRobinCandidates(buckets,limit,seen=new Set()) {
  const result=[]
  const positions=buckets.map(()=>0)
  while(result.length<limit){
    let added=false
    for(let index=0;index<buckets.length;index++){
      const bucket=buckets[index]
      while(positions[index]<bucket.length&&seen.has(bucket[positions[index]].url))positions[index]++
      if(positions[index]<bucket.length){
        const source=bucket[positions[index]++]
        seen.add(source.url)
        result.push(source)
        added=true
        if(result.length>=limit)break
      }
    }
    if(!added)break
  }
  return result
}

async function discoverSources(planned,{read,signal,searxngUrl,topic}) {
  const buckets=Array.from({length:planned.length},()=>[])
  let next=0
  const worker=async()=>{
    while(next<planned.length){
      const index=next++
      const q=planned[index]
      const feeds=[
        {url:`https://www.bing.com/search?${new URLSearchParams({q,format:'rss'})}`,kind:'rss'},
        {url:`https://news.google.com/rss/search?${new URLSearchParams({q,hl:'id',gl:'ID',ceid:'ID:id'})}`,kind:'rss'},
      ]
      if(searxngUrl){
        const url=new URL(searxngUrl)
        url.pathname='/search'
        url.search=new URLSearchParams({q,format:'json'}).toString()
        feeds.unshift({url:url.toString(),kind:'searxng'})
      }
      const candidates=new Map()
      for(const feed of feeds){
        if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:new Error('Riset dihentikan.')
        try {
          const response=await read(feed.url,{signal})
          const found=feed.kind==='searxng'
            ? JSON.parse(response.body).results?.slice(0,MAX_CANDIDATES_PER_QUERY).map(item=>({title:item.title,url:item.url,description:item.content||'',publishedAt:item.publishedDate||'',source:'SearXNG'}))||[]
            : newsItems(response.body,MAX_CANDIDATES_PER_QUERY)
          for(const item of found){
            const url=normalizedUrl(item.url)
            if(url&&!candidates.has(url))candidates.set(url,{...item,url,matchedQuery:q,researchAngle:RESEARCH_ANGLES[index]||'Pencarian lanjutan'})
          }
        } catch(error) { if(signal?.aborted)throw error }
      }
      buckets[index]=[...candidates.values()].sort((a,b)=>relevantScore(b,q,topic)-relevantScore(a,q,topic)).slice(0,MAX_CANDIDATES_PER_QUERY)
    }
  }
  await Promise.all(Array.from({length:Math.min(3,planned.length)},worker))
  return buckets
}

async function readCandidates(candidates,{read,signal}) {
  const pages=[]
  for(const source of candidates){
    if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:new Error('Riset dihentikan.')
    try {
      const response=await read(source.url,{signal,maxBytes:1_000_000})
      if(!/text\/html|text\/plain|application\/json|application\/xml|text\/xml/i.test(response.contentType))throw new Error('Format halaman tidak didukung.')
      const content=plainText(response.body)
      if(content.length<80)throw new Error('Isi halaman terlalu singkat untuk riset.')
      pages.push({title:source.title,url:source.url,publishedAt:source.publishedAt||'',matchedQuery:source.matchedQuery,researchAngle:source.researchAngle,content,status:'read'})
    } catch(error) {
      pages.push({title:source.title,url:source.url,publishedAt:source.publishedAt||'',matchedQuery:source.matchedQuery,researchAngle:source.researchAngle,status:'unreadable',reason:String(error.message||error).slice(0,160)})
    }
  }
  return pages
}

export async function researchWeb(query,{read=getPublicText,signal,maxPages=MAX_PAGES,queries,searxngUrl=process.env.RESEARCH_SEARXNG_URL||''}={}) {
  const topic=String(query||'').trim()
  if(topic.length<2||topic.length>200)throw new Error('Topik riset harus 2–200 karakter.')
  const pageLimit=Math.min(20,Math.max(1,Number(maxPages)||MAX_PAGES))
  const planned=[...new Set((Array.isArray(queries)&&queries.length?queries:researchQueries(topic)).map(value=>String(value).trim()).filter(Boolean))].slice(0,MAX_QUERIES)
  const connectorUrl=searxngUrl?validatePublicUrl(searxngUrl).toString():''
  const firstBuckets=await discoverSources(planned,{read,signal,searxngUrl:connectorUrl,topic})
  const found=firstBuckets.reduce((sum,bucket)=>sum+bucket.length,0)
  if(!found)throw new Error('Pencarian tidak memberi hasil. Coba topik lebih spesifik atau gunakan URL sumber langsung.')
  const seen=new Set()
  const firstBudget=Math.min(pageLimit,Math.max(1,Math.ceil(pageLimit*0.7)))
  const pages=await readCandidates(roundRobinCandidates(firstBuckets,firstBudget,seen),{read,signal})
  const readable=pages.filter(page=>page.status==='read')
  const hosts=new Set(readable.map(page=>sourceHost(page.url)))
  const needMore=pages.length<pageLimit&&(readable.length<Math.min(3,pageLimit)||hosts.size<Math.min(2,pageLimit)||firstBuckets.some(bucket=>!bucket.length))
  let followUpQueries=[]
  let secondBuckets=firstBuckets
  if(needMore){
    followUpQueries=[
      `${topic} primary source official documentation`,
      `${topic} detailed community discussion practical experience`,
    ].filter(q=>!planned.includes(q))
    const extra=await discoverSources(followUpQueries,{read,signal,searxngUrl:connectorUrl,topic})
    secondBuckets=[...firstBuckets,...extra]
  }
  const remaining=roundRobinCandidates(secondBuckets,pageLimit-pages.length,seen)
  pages.push(...await readCandidates(remaining,{read,signal}))
  const readCount=pages.filter(page=>page.status==='read').length
  const coverage={angles:[...new Set(pages.filter(page=>page.status==='read').map(page=>page.researchAngle))],domains:[...new Set(pages.filter(page=>page.status==='read').map(page=>sourceHost(page.url)))],unreadableCount:pages.length-readCount}
  return {query:topic,queries:planned,followUpQueries,searchedAt:new Date().toISOString(),pages,readCount,sourceCount:pages.length,coverage,alternativeSearchUsed:followUpQueries.length>0,searchProvider:connectorUrl?'SearXNG + RSS':'RSS',note:'Gunakan hanya fakta dari halaman berstatus read; simpan URL sumber. Hasil pencarian belum membuktikan kebenaran klaim.'}
}

export function parseResearchPlan(raw) {
  const text=String(raw||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')
  let plan
  try { plan=JSON.parse(text) } catch { throw new Error('AI planner belum menghasilkan JSON pencarian yang valid.') }
  if(!plan||typeof plan!=='object'||!Array.isArray(plan.queries))throw new Error('AI planner harus menghasilkan daftar queries.')
  const queries=[...new Set(plan.queries.filter(value=>typeof value==='string').map(value=>value.replace(/\s+/g,' ').trim()).filter(value=>value.length>=2&&value.length<=200))].slice(0,5)
  if(!queries.length)throw new Error('AI planner tidak menghasilkan query pencarian yang dapat dipakai.')
  return {queries}
}

async function mapLimited(items,limit,task) {
  const output=new Array(items.length)
  let next=0
  const worker=async()=>{
    while(next<items.length){
      const index=next++
      output[index]=await task(items[index])
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker))
  return output
}

export async function runResearchNode({node,input},{read=getPublicText,signal,planQuery}={}) {
  if(input.length>10)throw new Error('Riset Informasi menerima maksimal 10 item per pengujian.')
  const mode=String(node.data.sourceMode||'search')
  if(!['search','url'].includes(mode))throw new Error('Pilih cara pencarian Topik atau URL langsung.')
  return await mapLimited(input,2,async item=>{
    if(mode==='url'){
      const raw=String(resolveValue(node.data.url||'',item.json)).trim()
      const url=validatePublicUrl(raw).toString()
      const response=await read(url,{signal,maxBytes:1_000_000})
      if(!/text\/html|text\/plain|application\/json|application\/xml|text\/xml/i.test(response.contentType))throw new Error('Format halaman tidak didukung.')
      let content=response.body
      if(/application\/json/i.test(response.contentType)){try{content=JSON.parse(response.body)}catch{throw new Error('Sumber mengaku JSON tetapi isinya tidak valid.')}}
      else content=plainText(response.body)
      return {json:{...item.json,researchMode:'url',url,statusCode:response.status,content,pages:[{url,content,status:'read'}],sourceCount:1,readCount:1,searchedAt:new Date().toISOString()}}
    }
    let rawQuery=''
    try { rawQuery=node.data.query?resolveValue(node.data.query,item.json):item.json } catch { rawQuery=item.json }
    const query=standardResearchPrompt(rawQuery)||standardResearchPrompt(item.json)
    if(!query)throw new Error('Topik riset belum ditemukan. Isi topik, prompt, atau query pada langkah sebelumnya.')
    let plannedQueries
    if(typeof planQuery==='function'){
      try {
        const planned=await planQuery({topic:query,context:item.json,model:String(node.data.model||''),signal})
        plannedQueries=parseResearchPlan(planned).queries
      } catch(error) {
        if(signal?.aborted)throw error
        plannedQueries=undefined
      }
    }
    const research=await researchWeb(query,{read,signal,maxPages:node.data.maxPages||DEFAULT_NODE_PAGES,queries:plannedQueries})
    return {json:{...item.json,researchMode:'search',researchPrompt:`Cari dan baca informasi terverifikasi tentang: ${query}`,researchPlan:plannedQueries?.length?'AI planner':'Fallback query planner',...research,sources:research.pages,sourceCount:research.pages.length}}
  })
}
