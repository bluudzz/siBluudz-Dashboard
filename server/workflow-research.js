import { getPublicText, newsItems, validatePublicUrl } from './workflow-external.js'

const MAX_PAGES = 5

function plainText(html) {
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>')
    .replace(/\s+/g,' ').trim().slice(0,4500)
}

export async function researchWeb(query,{read=getPublicText,signal}={}) {
  const topic=String(query||'').trim()
  if(topic.length<2||topic.length>200)throw new Error('Topik riset harus 2–200 karakter.')
  const search=new URL('https://www.bing.com/search')
  search.search=new URLSearchParams({q:topic,format:'rss'}).toString()
  let results=[]
  try { results=newsItems((await read(search.toString(),{signal})).body,MAX_PAGES) } catch(error) { if(signal?.aborted)throw error }
  if(!results.length){
    const fallback=new URL('https://news.google.com/rss/search')
    fallback.search=new URLSearchParams({q:topic,hl:'id',gl:'ID',ceid:'ID:id'}).toString()
    results=newsItems((await read(fallback.toString(),{signal})).body,MAX_PAGES)
  }
  if(!results.length)throw new Error('Pencarian tidak memberi hasil. Coba topik lebih spesifik atau gunakan URL sumber langsung.')
  const pages=[]
  for(const source of results){
    if(signal?.aborted)throw signal.reason instanceof Error?signal.reason:new Error('Riset dihentikan.')
    try {
      const url=validatePublicUrl(source.url).toString()
      const response=await read(url,{signal,maxBytes:1_000_000})
      if(!/text\/html|text\/plain|application\/json|application\/xml|text\/xml/i.test(response.contentType))throw new Error('Format halaman tidak didukung.')
      pages.push({title:source.title,url,publishedAt:source.publishedAt||'',content:plainText(response.body),status:'read'})
    } catch(error) {
      pages.push({title:source.title,url:source.url,publishedAt:source.publishedAt||'',status:'unreadable',reason:String(error.message||error).slice(0,160)})
    }
  }
  return {query:topic,searchedAt:new Date().toISOString(),pages,readCount:pages.filter(page=>page.status==='read').length,note:'Gunakan hanya fakta dari halaman berstatus read; simpan URL sumber. Hasil pencarian belum membuktikan kebenaran klaim.'}
}
