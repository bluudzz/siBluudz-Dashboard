import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { db } from './db.js'
import { requireSameOrigin, requireUser } from './middleware/auth.js'
import { decryptSocialToken, encryptSocialToken } from './utils/social-crypto.js'
import { resolveValue, workflowInput } from '../shared/workflow-engine.js'
import { validatePublicUrl } from './workflow-external.js'
import { safeHttpsRequest } from './workflow-api-request.js'

const MAX_ITEMS = 10
const ALLOWED_CHANNEL_TYPES = new Set(['telegram', 'discord', 'webhook'])

function channelForUser(userId, channelId) {
  return db.prepare('select id, user_id, label, channel_type, chat_id, encrypted_secret from workflow_notification_channels where id = ? and user_id = ?').get(channelId, userId)
}

function validateChannelInput({ label, channelType, chatId, secret }) {
  const cleanLabel = String(label || '').trim()
  if (!cleanLabel || cleanLabel.length > 80) throw new Error('Nama channel wajib diisi, maksimal 80 karakter.')
  if (!ALLOWED_CHANNEL_TYPES.has(channelType)) throw new Error('Jenis channel harus Telegram, Discord, atau Webhook.')
  const cleanSecret = String(secret || '').trim()
  const cleanChatId = String(chatId || '').trim()
  if (channelType === 'telegram') {
    if (!/^\d{5,20}:[A-Za-z0-9_-]{20,120}$/.test(cleanSecret)) throw new Error('Bot Token Telegram tidak valid (format: 123456:ABC...).')
    if (!/^-?\d{4,30}$|^@[A-Za-z0-9_]{4,40}$/.test(cleanChatId)) throw new Error('Chat ID Telegram wajib diisi (angka atau @channel).')
  } else if (channelType === 'discord') {
    const url = validatePublicUrl(cleanSecret)
    const host = url.hostname.toLowerCase()
    if (!['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'].includes(host) || !url.pathname.startsWith('/api/webhooks/')) {
      throw new Error('URL Webhook Discord harus berasal dari discord.com/api/webhooks/...')
    }
  } else {
    validatePublicUrl(cleanSecret)
  }
  return { cleanLabel, cleanChatId, cleanSecret }
}

function summarizeInput(json) {
  const value = workflowInput(json)
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2)
  return 'Notifikasi dari Auto Workflow siBluudz'
}

export async function dispatchChannelMessage(channel, { message, imageUrl = '', itemJson = {} }, { fetchImpl = fetch, requestImpl, signal } = {}) {
  const secret = decryptSocialToken(channel.encrypted_secret)
  const text = String(message || '').trim().slice(0, 4000)
  if (!text) throw new Error('Pesan notifikasi tidak boleh kosong.')
  const safeImage = typeof imageUrl === 'string' && imageUrl.startsWith('https://') ? (() => { try { return validatePublicUrl(imageUrl).toString() } catch { return '' } })() : ''

  if (channel.channel_type === 'telegram') {
    const endpoint = safeImage
      ? `https://api.telegram.org/bot${secret}/sendPhoto`
      : `https://api.telegram.org/bot${secret}/sendMessage`
    const payload = safeImage
      ? { chat_id: channel.chat_id, photo: safeImage, caption: text.slice(0, 1024) }
      : { chat_id: channel.chat_id, text }
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok || body.ok === false) throw new Error(`Telegram (${response.status}): ${String(body.description || 'Gagal mengirim pesan.').slice(0, 200)}`)
    return { ok: true }
  }

  if (channel.channel_type === 'discord') {
    const url = validatePublicUrl(secret)
    const payload = {
      content: text.slice(0, 2000),
      ...(safeImage ? { embeds: [{ image: { url: safeImage } }] } : {}),
    }
    const response = await fetchImpl(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Discord (${response.status}): ${errText.slice(0, 200) || 'Gagal mengirim pesan.'}`)
    }
    return { ok: true }
  }

  const res = await safeHttpsRequest(secret, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: text, ...(safeImage ? { imageUrl: safeImage } : {}), item: itemJson, sentAt: new Date().toISOString() }),
    signal,
    requestImpl,
  })
  if (res.status < 200 || res.status >= 300) throw new Error(`Webhook (${res.status}): ${String(res.body || 'Gagal mengirim pesan.').slice(0, 200)}`)
  return { ok: true }
}

export async function runNotifyNode({ node, input }, user, { fetchImpl = fetch, requestImpl, signal } = {}) {
  if (input.length > MAX_ITEMS) throw new Error('Kirim Notifikasi menerima maksimal 10 item per pengujian.')
  const channelId = String(node.data.channelId || '').trim()
  const channel = channelForUser(user.id, channelId)
  if (!channel) throw new Error('Pilih channel notifikasi yang terhubung pada node ini.')

  const output = []
  for (const item of input) {
    const rawMessage = String(node.data.message || '').trim()
    const resolved = rawMessage ? String(resolveValue(rawMessage, item.json)).trim() : summarizeInput(item.json)
    const includeImage = Boolean(node.data.includeImage)
    const imageUrl = includeImage ? String(item.json.imageUrl || '') : ''
    await dispatchChannelMessage(channel, { message: resolved, imageUrl, itemJson: item.json }, { fetchImpl, requestImpl, signal })
    output.push({
      json: {
        ...item.json,
        notificationStatus: 'sent',
        notificationChannel: channel.label,
        notificationMessage: resolved.slice(0, 4000),
      },
    })
  }
  return output
}

const router = Router()

router.get('/', requireUser, (req, res) => {
  const channels = db.prepare('select id, label, channel_type as channelType, chat_id as chatId, created_at as createdAt from workflow_notification_channels where user_id = ? order by created_at desc').all(req.user.id)
  res.json({ channels })
})

router.post('/', requireSameOrigin, requireUser, (req, res) => {
  try {
    const channelType = String(req.body?.channelType || '').trim()
    const { cleanLabel, cleanChatId, cleanSecret } = validateChannelInput({
      label: req.body?.label,
      channelType,
      chatId: req.body?.chatId,
      secret: req.body?.secret,
    })
    const id = randomUUID()
    db.prepare('insert into workflow_notification_channels (id, user_id, label, channel_type, chat_id, encrypted_secret) values (?, ?, ?, ?, ?, ?)').run(
      id,
      req.user.id,
      cleanLabel,
      channelType,
      cleanChatId,
      encryptSocialToken(cleanSecret),
    )
    res.status(201).json({ channel: { id, label: cleanLabel, channelType, chatId: cleanChatId } })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Gagal menyimpan channel notifikasi.' })
  }
})

router.post('/:id/test', requireSameOrigin, requireUser, async (req, res) => {
  const channel = channelForUser(req.user.id, req.params.id)
  if (!channel) return res.status(404).json({ error: 'Channel notifikasi tidak ditemukan.' })
  try {
    await dispatchChannelMessage(channel, { message: `Tes notifikasi dari siBluudz Auto Workflow (${channel.label}).` })
    res.json({ ok: true, message: 'Pesan tes berhasil dikirim.' })
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Gagal mengirim pesan tes.' })
  }
})

router.delete('/:id', requireSameOrigin, requireUser, (req, res) => {
  db.prepare('delete from workflow_notification_channels where id = ? and user_id = ?').run(req.params.id, req.user.id)
  res.status(204).end()
})

export const workflowChannelsRouter = router
