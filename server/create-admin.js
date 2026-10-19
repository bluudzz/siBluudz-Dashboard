import dotenv from 'dotenv'
import Database from 'better-sqlite3'
import { randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

dotenv.config({ path: '.env.local' })
dotenv.config()

const scrypt = promisify(scryptCallback)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.resolve(process.env.DATA_DIRECTORY || path.join(__dirname, '..', 'data'))
const db = new Database(path.join(dataDirectory, 'sibluudz.sqlite'))

async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = await scrypt(password, salt, 64)
  return `${salt}:${Buffer.from(derived).toString('hex')}`
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'johanhabibie12@gmail.com').trim().toLowerCase()
  const password = process.argv[2] || 'Admin#Bluudz2026!'
  const name = process.argv[3] || 'Johan Habibie (Admin)'

  const existing = db.prepare('select * from users where email = ?').get(email)
  const passwordHash = await hashPassword(password)

  if (existing) {
    db.prepare(`
      update users 
      set password_hash = ?, role = 'admin', name = coalesce(nullif(?, ''), name), updated_at = datetime('now')
      where id = ?
    `).run(passwordHash, name, existing.id)
    console.log(`Akun admin ${email} berhasil diperbarui (Password direset).`)
  } else {
    const id = randomUUID()
    db.prepare(`
      insert into users (id, email, password_hash, name, role)
      values (?, ?, ?, ?, 'admin')
    `).run(id, email, passwordHash, name)
    console.log(`Akun admin ${email} berhasil dibuat dengan role 'admin'.`)
  }

  console.log(`Email    : ${email}`)
  console.log(`Password : ${password}`)
}

main().catch((err) => {
  console.error('Error saat membuat akun admin:', err)
  process.exit(1)
})
