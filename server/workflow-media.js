import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Router } from 'express'
import sharp from 'sharp'
import { db, dataDirectory } from './db.js'

export const mediaDirectory = path.join(dataDirectory, 'workflow-media')
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024

export function mediaPublicBase() {
  const candidates = [process.env.PUBLIC_BASE_URL, process.env.APP_ORIGIN]
  const raw = String(candidates.find((value) => String(value || '').trim().startsWith('https://')) || '').trim()
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

export async function storeWorkflowVideo(userId, buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > MAX_VIDEO_BYTES) throw new Error('Ukuran video maksimal 100 MB.')
  if (!['video/mp4', 'video/quicktime'].includes(mimeType)) throw new Error('Format video harus MP4 atau MOV.')
  if (buffer.length < 12 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('Berkas video bukan MP4/MOV yang valid.')
  const publicBase = mediaPublicBase()
  const token = randomBytes(24).toString('hex')
  const ext = mimeType === 'video/quicktime' ? 'mov' : 'mp4'
  const filename = `${token}.${ext}`
  await mkdir(mediaDirectory, { recursive: true })
  await writeFile(path.join(mediaDirectory, filename), buffer, { flag: 'wx' })
  db.prepare('insert into workflow_media (token,user_id,filename,mime_type) values (?,?,?,?)').run(token, userId, filename, mimeType)
  const previewUrl = `/api/workflow-media/${token}`
  return { previewUrl, videoUrl: publicBase ? publicBase + previewUrl : '', mimeType, token }
}

export async function storeWorkflowUploadedMedia(userId, buffer, mimeType, fileName = '') {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error('File yang diunggah kosong.')
  }
  const cleanMime = String(mimeType || '').split(';')[0].trim().toLowerCase()
  const cleanName = String(fileName || '').replace(/[^\w.\- ()]/g, '_').trim().slice(0, 120)

  if (['image/jpeg', 'image/png', 'image/webp'].includes(cleanMime)) {
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error('Ukuran foto maksimal 12 MB.')
    }
    let normalized = buffer
    if (cleanMime !== 'image/jpeg') {
      try {
        normalized = await sharp(buffer, { limitInputPixels: 25_000_000 })
          .flatten({ background: '#ffffff' })
          .jpeg({ quality: 92 })
          .toBuffer()
      } catch {
        throw new Error('Foto tidak valid atau tidak dapat dibaca.')
      }
      if (normalized.length > MAX_IMAGE_BYTES) {
        throw new Error('Ukuran foto setelah dikonversi melebihi 12 MB.')
      }
    }
    const stored = await storeWorkflowImage(userId, normalized.toString('base64'), 'image/jpeg')
    return {
      token: stored.token,
      previewUrl: stored.previewUrl,
      imageUrl: stored.imageUrl,
      url: stored.imageUrl || stored.previewUrl,
      mimeType: 'image/jpeg',
      mediaType: 'image',
      fileName: cleanName || `${stored.token.slice(0, 8)}.jpg`,
      sizeBytes: normalized.length,
    }
  }

  if (['video/mp4', 'video/quicktime'].includes(cleanMime)) {
    const stored = await storeWorkflowVideo(userId, buffer, cleanMime)
    return {
      token: stored.token,
      previewUrl: stored.previewUrl,
      videoUrl: stored.videoUrl,
      url: stored.videoUrl || stored.previewUrl,
      mimeType: stored.mimeType,
      mediaType: 'video',
      fileName: cleanName || `${stored.token.slice(0, 8)}.${cleanMime === 'video/quicktime' ? 'mov' : 'mp4'}`,
      sizeBytes: buffer.length,
    }
  }

  throw new Error('Format file tidak didukung. Gunakan foto JPG/PNG/WebP atau video MP4/MOV.')
}

export function extractWorkflowMediaToken(urlOrPreview) {
  const raw = String(urlOrPreview || '').trim()
  const relative = raw.match(/^\/api\/workflow-media\/([a-f0-9]{48})(?:[?#].*)?$/i)
  if (relative) return relative[1].toLowerCase()
  try {
    const parsed = new URL(raw)
    const match = parsed.pathname.match(/^\/api\/workflow-media\/([a-f0-9]{48})$/i)
    const base = mediaPublicBase()
    if (match && (!base || parsed.origin === base)) return match[1].toLowerCase()
  } catch { return '' }
  return ''
}

export function resolveWorkflowMediaFilePath(userId, urlOrPreview) {
  const token = extractWorkflowMediaToken(urlOrPreview)
  if (!token) return null
  const row = db.prepare('select filename,mime_type from workflow_media where token=? and user_id=?').get(token, userId)
  if (!row) throw new Error('Media workflow tidak ditemukan atau bukan milik akun Anda.')
  return { filePath: path.join(mediaDirectory, row.filename), mimeType: row.mime_type, token }
}

export async function readWorkflowMedia(userId, urlOrPreview) {
  const resolved = resolveWorkflowMediaFilePath(userId, urlOrPreview)
  if (!resolved) return null
  const buffer = await readFile(resolved.filePath)
  return { buffer, mimeType: resolved.mimeType, token: resolved.token }
}

export const workflowMediaRouter = Router()
workflowMediaRouter.get('/:token',async(req,res)=>{
  if (!/^[a-f0-9]{48}$/.test(req.params.token)) return res.status(404).end()
  const row = db.prepare('select filename,mime_type from workflow_media where token=?').get(req.params.token)
  if (!row) return res.status(404).end()
  try {
    const content = await readFile(path.join(mediaDirectory,row.filename))
    const total = content.length
    const range = req.headers.range
    if (range) {
      const match = String(range).match(/^bytes=(\d+)-(\d*)$/)
      if (!match) return res.status(416).set({ 'Content-Range': `bytes */${total}` }).end()
      const start = Number(match[1])
      const end = match[2] ? Math.min(total - 1, Number(match[2])) : total - 1
      if (start >= total || start > end) return res.status(416).set({ 'Content-Range': `bytes */${total}` }).end()
      const slice = content.subarray(start, end + 1)
      res.status(206).set({
        'Content-Type': row.mime_type,
        'Content-Length': String(slice.length),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, max-age=3600',
      })
      return res.end(slice)
    }
    res.set({'Content-Type':row.mime_type,'Content-Length':String(total),'Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Cache-Control':'public, max-age=3600'})
    res.end(content)
  } catch { res.status(404).end() }
})
