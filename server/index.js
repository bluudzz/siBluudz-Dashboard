import './env.js'
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { dataDirectory } from './db.js'
import authRoutes, { googleEnabled } from './routes/auth.routes.js'
import invoiceRoutes from './routes/invoice.routes.js'
import mailRoutes from './routes/mail.routes.js'
import outlookRoutes from './outlook/outlook.routes.js'
import gmailRoutes from './gmail/gmail.routes.js'
import aiRoutes from './routes/ai.routes.js'
import adminRoutes from './routes/admin.routes.js'

const app = express()
const port = Number(process.env.API_PORT || 3001)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
app.use(express.json({ limit: '32mb' }))

// Mount modular feature routes
app.use('/api', authRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/mail', mailRoutes)
app.use('/api/outlook', outlookRoutes)
app.use('/api/gmail', gmailRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/admin', adminRoutes)

// Error handler
app.use('/api', (error, _req, res, _next) => {
  console.error('API request failed:', error)
  res.status(500).json({ error: 'Terjadi kesalahan server. Periksa log backend.' })
})

// Static serve in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(__dirname, '..', 'dist')
  app.use(express.static(distPath))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distPath, 'index.html')))
}

app.listen(port, '127.0.0.1', () => {
  console.log(`Local API running at http://127.0.0.1:${port}`)
  console.log(`SQLite database: ${path.join(dataDirectory, 'sibluudz.sqlite')}`)
  console.log(`Google OAuth: ${googleEnabled ? 'configured' : 'not configured'}`)
})
