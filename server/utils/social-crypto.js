import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function encryptionKey() {
  const encoded = process.env.SOCIAL_CREDENTIALS_KEY || process.env.MAIL_CREDENTIALS_KEY
  if (!encoded) throw new Error('Atur SOCIAL_CREDENTIALS_KEY (Base64 dari 32 byte) di server sebelum menyimpan akun Instagram.')
  const key = Buffer.from(encoded,'base64')
  if (key.length !== 32) throw new Error('SOCIAL_CREDENTIALS_KEY harus berupa Base64 dari 32 byte.')
  return key
}

export function encryptSocialToken(token) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm',encryptionKey(),iv)
  const ciphertext = Buffer.concat([cipher.update(token,'utf8'),cipher.final()])
  return JSON.stringify({iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')})
}

export function decryptSocialToken(encoded) {
  const payload=JSON.parse(encoded)
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(payload.iv,'base64'))
  decipher.setAuthTag(Buffer.from(payload.tag,'base64'))
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext,'base64')),decipher.final()]).toString('utf8')
}
