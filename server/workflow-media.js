import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import sharp from 'sharp'
import { db, dataDirectory } from './db.js'

const mediaDirectory = path.join(dataDirectory, 'workflow-media')
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

export function mediaPublicBase() {
  const raw = String(process.env.PUBLIC_BASE_URL || '').trim()
  if (!raw) return ''
  let url
  try { url = new URL(raw) } catch { throw new Error('PUBLIC_BASE_URL harus berupa URL HTTPS publik yang valid.') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('PUBLIC_BASE_URL harus berupa URL HTTPS publik tanpa kredensial.')
  return url.origin
}

export async function storeWorkflowImage(userId, encoded, mimeHint = '') {
  if (typeof encoded !== 'string' || encoded.length > MAX_IMAGE_BYTES * 1.4) throw new Error('Gambar dari model terlalu besar atau tidak valid.')
  let buffer = Buffer.from(encoded, 'base64')
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Ukuran gambar maksimal 12 MB.')
  const jpeg = buffer.subarray(0,3).equals(Buffer.from([0xff,0xd8,0xff]))
  const png = buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))
  if (!jpeg && !png) throw new Error('Model harus mengembalikan gambar JPEG atau PNG.')
  if (mimeHint && !['image/jpeg','image/png'].includes(mimeHint)) throw new Error('Format gambar tidak didukung.')
  if (png) {
    try {
      buffer = await sharp(buffer,{limitInputPixels:25_000_000}).flatten({background:'#ffffff'}).jpeg({quality:90}).toBuffer()
    } catch { throw new Error('Gambar PNG dari model tidak dapat dikonversi menjadi JPEG.') }
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Gambar JPEG hasil konversi melebihi 12 MB.')
  }
  const mimeType = 'image/jpeg'
  const publicBase = mediaPublicBase()
  const token = randomBytes(24).toString('hex')
  const filename = `${token}.jpg`
  await mkdir(mediaDirectory,{recursive:true})
  await writeFile(path.join(mediaDirectory,filename),buffer,{flag:'wx'})
  db.prepare('insert into workflow_media (token,user_id,filename,mime_type) values (?,?,?,?)').run(token,userId,filename,mimeType)
  const previewUrl = `/api/workflow-media/${token}`
  return {previewUrl,imageUrl:publicBase ? publicBase + previewUrl : '',mimeType,token}
}

export const workflowMediaRouter = Router()
workflowMediaRouter.get('/:token',async(req,res)=>{
  if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(404).end()
  const row = db.prepare('select filename,mime_type from workflow_media where token=?').get(req.params.token)
  if (!row) return res.status(404).end()
  try {
    const content = await readFile(path.join(mediaDirectory,row.filename))
    res.set({'Content-Type':row.mime_type,'Content-Length':String(content.length),'X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'})
    res.end(content)
  } catch { res.status(404).end() }
})
