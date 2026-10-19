import { Router } from 'express'
import { db } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'

const router = Router()

// Update/Save user invoices list
router.put('/', requireSameOrigin, requireUser, (req, res) => {
  const invoices = req.body?.invoices
  if (!Array.isArray(invoices) || invoices.length > 500) {
    return res.status(400).json({ error: 'Daftar invoice tidak valid atau melebihi 500 dokumen.' })
  }
  const ids = new Set()
  for (const invoice of invoices) {
    if (!invoice || typeof invoice !== 'object' || typeof invoice.id !== 'string' || !invoice.id || ids.has(invoice.id)) {
      return res.status(400).json({ error: 'Setiap invoice harus memiliki ID unik yang valid.' })
    }
    ids.add(invoice.id)
  }

  const transaction = db.transaction(() => {
    const upsert = db.prepare(`
      insert into invoices (user_id, id, data, updated_at)
      values (?, ?, ?, datetime('now'))
      on conflict(user_id, id) do update set data = excluded.data, updated_at = excluded.updated_at
    `)
    for (const invoice of invoices) upsert.run(req.user.id, invoice.id, JSON.stringify(invoice))

    if (invoices.length === 0) {
      db.prepare('delete from invoices where user_id = ?').run(req.user.id)
    } else {
      const placeholders = invoices.map(() => '?').join(', ')
      db.prepare(`delete from invoices where user_id = ? and id not in (${placeholders})`)
        .run(req.user.id, ...invoices.map((invoice) => invoice.id))
    }
  })
  transaction()
  res.json({ saved: invoices.length })
})

export default router
