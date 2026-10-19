import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.resolve(__dirname, '..', 'data')
const db = new Database(path.join(dataDirectory, 'sibluudz.sqlite'))

const adminEmail = 'johanhabibie12@gmail.com'
const admin = db.prepare('select * from users where email = ?').get(adminEmail)

if (!admin) {
  console.error(`Admin dengan email ${adminEmail} tidak ditemukan di database.`)
  process.exit(1)
}

const backupPath = path.join(dataDirectory, 'recovered_invoices_backup.json')
if (!fs.existsSync(backupPath)) {
  console.error(`File backup ${backupPath} tidak ditemukan.`)
  process.exit(1)
}

const backupInvoices = JSON.parse(fs.readFileSync(backupPath, 'utf8'))
console.log(`Memproses ${backupInvoices.length} invoice dari backup untuk akun admin (${admin.email})...`)

const upsert = db.prepare(`
  insert into invoices (user_id, id, data, updated_at)
  values (?, ?, ?, datetime('now'))
  on conflict(user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at
`)

const insertAll = db.transaction((invoices) => {
  for (const inv of invoices) {
    if (inv && inv.id) {
      upsert.run(admin.id, inv.id, JSON.stringify(inv))
    }
  }
})

insertAll(backupInvoices)

const totalAdminInvoices = db.prepare('select count(*) as count from invoices where user_id = ?').get(admin.id)
console.log(`Selesai! Akun admin (${admin.email}) sekarang memiliki ${totalAdminInvoices.count} invoice di database.`)
