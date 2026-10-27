const idPattern=/^[A-Za-z0-9_-]{10,200}$/
const keyPattern=/^[A-Za-z0-9_-]{1,200}$/

// Only extract an identifier. The backend never fetches the supplied share URL.
export function parseGoogleDriveLink(raw) {
  let url
  try { url=new URL(String(raw||'').trim()) } catch { throw new Error('Tempel link berbagi Google Drive yang lengkap.') }
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['drive.google.com','docs.google.com'].includes(url.hostname))throw new Error('Gunakan link HTTPS dari Google Drive.')
  const path=url.pathname
  let type,id
  let match=path.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)(?:\/)?$/)
  if(match){type='folder';id=match[1]}
  else if((match=path.match(/^\/file\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/))){type='file';id=match[1]}
  else if(url.hostname==='drive.google.com'&&['/open','/uc'].includes(path)){type='file';id=url.searchParams.get('id')}
  else if(url.hostname==='docs.google.com'&&(match=path.match(/^\/(?:document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]+)(?:\/.*)?$/))){type='file';id=match[1]}
  else throw new Error('Link Drive harus menunjuk ke satu file atau folder.')
  if(!idPattern.test(String(id||'')))throw new Error('ID pada link Google Drive tidak valid.')
  const resourceKey=url.searchParams.get('resourcekey')||''
  if(resourceKey&&!keyPattern.test(resourceKey))throw new Error('Kunci akses pada link Google Drive tidak valid.')
  return {type,id,resourceKey}
}
