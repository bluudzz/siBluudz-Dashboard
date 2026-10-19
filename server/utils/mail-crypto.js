import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function getMailEncryptionKey() {
  const encodedKey = process.env.MAIL_CREDENTIALS_KEY
  if (!encodedKey) {
    throw new Error('MAIL_CREDENTIALS_KEY belum dikonfigurasi di .env.local.')
  }
  const key = Buffer.from(encodedKey, 'base64')
  if (key.length !== 32) {
    throw new Error('MAIL_CREDENTIALS_KEY harus berupa Base64 dari 32 byte acak.')
  }
  return key
}

export function encryptMailCredentials(credentials) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getMailEncryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(credentials), 'utf8'),
    cipher.final(),
  ])
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  })
}

export function decryptMailCredentials(encrypted) {
  const payload = JSON.parse(encrypted)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getMailEncryptionKey(),
    Buffer.from(payload.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
  return JSON.parse(plaintext)
}
