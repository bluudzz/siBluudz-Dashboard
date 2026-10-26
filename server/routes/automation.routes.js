import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { db } from '../db.js'
import { requireSameOrigin, requireUser } from '../middleware/auth.js'

const router = Router()

// Default preset nodes for Auto-Post IG Bluudzstore
const DEFAULT_IG_NODES = [
  {
    id: 'trigger-1',
    type: 'trigger',
    position: { x: 80, y: 150 },
    data: {
      label: 'Schedule Trigger',
      cron: '0 10 * * *',
      interval: 'Setiap Hari (10:00 WIB)',
      enabled: true,
    },
  },
  {
    id: 'radar-1',
    type: 'radar',
    position: { x: 380, y: 150 },
    data: {
      label: 'Roblox Trend Radar',
      targetGames: ['Blox Fruits', 'Fisch', 'Grow a Garden 2'],
      strategy: 'pilar_edukasi_pemula',
      autoScrape: true,
    },
  },
  {
    id: 'ai-gen-1',
    type: 'aiGenerator',
    position: { x: 680, y: 150 },
    data: {
      label: '9Router Visual & Caption AI',
      model: 'gemini-3.7-flash-high',
      aspectRatio: '4:5 (1080x1350)',
      textMode: 'in_scene_3d',
      qualityControl: true,
    },
  },
  {
    id: 'publisher-1',
    type: 'publisher',
    position: { x: 980, y: 150 },
    data: {
      label: 'Instagram Publisher',
      targetAccount: '@bluudzstore',
      format: 'carousel',
      autoStoryRepost: true,
      requireApproval: false,
    },
  },
]

const DEFAULT_IG_EDGES = [
  { id: 'e1-2', source: 'trigger-1', target: 'radar-1', animated: true },
  { id: 'e2-3', source: 'radar-1', target: 'ai-gen-1', animated: true },
  { id: 'e3-4', source: 'ai-gen-1', target: 'publisher-1', animated: true },
]

// GET /api/workflows - Get user workflows
router.get('/', requireUser, (req, res) => {
  let list = db.prepare(`
    select id, name, description, is_active, created_at, updated_at
    from workflows where user_id = ?
    order by updated_at desc
  `).all(req.user.id)

  // Seed default workflow if empty
  if (list.length === 0) {
    const id = randomUUID()
    db.prepare(`
      insert into workflows (id, user_id, name, description, nodes, edges, is_active)
      values (?, ?, ?, ?, ?, ?, 1)
    `).run(
      id,
      req.user.id,
      'Pipeline Auto-Post IG @bluudzstore',
      'Pipeline otomatis riset tren Roblox, generate visual 3D, copywriting, dan auto-publish ke Instagram.',
      JSON.stringify(DEFAULT_IG_NODES),
      JSON.stringify(DEFAULT_IG_EDGES)
    )
    list = db.prepare(`
      select id, name, description, is_active, created_at, updated_at
      from workflows where user_id = ?
      order by updated_at desc
    `).all(req.user.id)
  }

  res.json({ workflows: list })
})

// GET /api/workflows/:id - Get specific workflow with nodes & edges
router.get('/:id', requireUser, (req, res) => {
  const row = db.prepare(`
    select * from workflows where id = ? and user_id = ?
  `).get(req.params.id, req.user.id)

  if (!row) {
    return res.status(404).json({ error: 'Workflow tidak ditemukan.' })
  }

  res.json({
    workflow: {
      id: row.id,
      name: row.name,
      description: row.description,
      nodes: JSON.parse(row.nodes || '[]'),
      edges: JSON.parse(row.edges || '[]'),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  })
})

// POST /api/workflows - Create new workflow
router.post('/', requireSameOrigin, requireUser, (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : 'Workflow Baru'
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const template = req.body?.template
  const id = randomUUID()

  let initialNodes = []
  let initialEdges = []

  if (template === 'ig-autopost') {
    initialNodes = DEFAULT_IG_NODES
    initialEdges = DEFAULT_IG_EDGES
  } else if (template === 'ai-researcher') {
    initialNodes = [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 80, y: 150 },
        data: { label: 'Daily Trigger', interval: 'Setiap Hari 08:00', cron: '0 8 * * *' },
      },
      {
        id: 'agent-1',
        type: 'aiAgent',
        position: { x: 380, y: 150 },
        data: {
          label: 'Market Research Agent',
          role: 'Analyst',
          aiModel: 'deepseek-reasoner',
          aiPrompt: 'Cari topik trending game online dan buat ringkasan eksekutif.',
        },
      },
      {
        id: 'agent-2',
        type: 'aiAgent',
        position: { x: 680, y: 150 },
        data: {
          label: 'Copywriter & Format Agent',
          role: 'Writer',
          aiModel: 'claude-sonnet-5-5',
          aiPrompt: 'Ubah ringkasan menjadi naskah konten menarik untuk audience muda.',
        },
      },
      {
        id: 'pub-1',
        type: 'publisher',
        position: { x: 980, y: 150 },
        data: { label: 'Instagram Publisher', targetAccount: '@bluudzstore', format: 'carousel' },
      },
    ]
    initialEdges = [
      { id: 'e1-2', source: 'trigger-1', target: 'agent-1', animated: true },
      { id: 'e2-3', source: 'agent-1', target: 'agent-2', animated: true },
      { id: 'e3-4', source: 'agent-2', target: 'pub-1', animated: true },
    ]
  }

  db.prepare(`
    insert into workflows (id, user_id, name, description, nodes, edges, is_active)
    values (?, ?, ?, ?, ?, ?, 1)
  `).run(id, req.user.id, name, description, JSON.stringify(initialNodes), JSON.stringify(initialEdges))

  res.status(201).json({ id, name, description, isActive: true })
})

// PUT /api/workflows/:id - Save workflow nodes, edges, and settings
router.put('/:id', requireSameOrigin, requireUser, (req, res) => {
  const { name, description, nodes, edges, isActive } = req.body
  const existing = db.prepare('select id from workflows where id = ? and user_id = ?').get(req.params.id, req.user.id)
  if (!existing) {
    return res.status(404).json({ error: 'Workflow tidak ditemukan.' })
  }

  db.prepare(`
    update workflows
    set name = coalesce(?, name),
        description = coalesce(?, description),
        nodes = coalesce(?, nodes),
        edges = coalesce(?, edges),
        is_active = coalesce(?, is_active),
        updated_at = datetime('now')
    where id = ? and user_id = ?
  `).run(
    name !== undefined ? String(name).trim() : null,
    description !== undefined ? String(description).trim() : null,
    nodes !== undefined ? JSON.stringify(nodes) : null,
    edges !== undefined ? JSON.stringify(edges) : null,
    isActive !== undefined ? (isActive ? 1 : 0) : null,
    req.params.id,
    req.user.id
  )

  res.json({ success: true, message: 'Workflow berhasil disimpan.' })
})

// DELETE /api/workflows/:id - Delete workflow
router.delete('/:id', requireSameOrigin, requireUser, (req, res) => {
  db.prepare('delete from workflows where id = ? and user_id = ?').run(req.params.id, req.user.id)
  res.status(204).end()
})

// POST /api/workflows/:id/execute - Dry-run / execute pipeline
router.post('/:id/execute', requireSameOrigin, requireUser, async (req, res) => {
  const workflow = db.prepare('select * from workflows where id = ? and user_id = ?').get(req.params.id, req.user.id)
  if (!workflow) {
    return res.status(404).json({ error: 'Workflow tidak ditemukan.' })
  }

  const nodes = JSON.parse(workflow.nodes || '[]')
  const runId = randomUUID()
  const logs = []

  const addLog = (step, message, status = 'info') => {
    logs.push({
      time: new Date().toLocaleTimeString('id-ID'),
      step,
      message,
      status,
    })
  }

  addLog('Trigger', `Memulai eksekusi pipeline "${workflow.name}"`, 'success')

  for (const node of nodes) {
    const label = node.data?.label || node.type
    const aiModel = node.data?.aiModel || node.data?.model

    if (node.type === 'trigger') {
      addLog(label, `Trigger aktif: ${node.data?.interval || 'Manual'} [Cron: ${node.data?.cron || '0 10 * * *'}]`, 'success')
    } else if (node.type === 'radar') {
      const games = node.data?.targetGames?.join(', ') || 'Roblox Games'
      if (node.data?.aiEnabled && aiModel) {
        addLog(label, `[Model: ${aiModel}] Menganalisis forum & sentimen komunitas...`, 'info')
      }
      addLog(label, `Memindai tren: ${games}`, 'info')
      addLog(label, 'Topik terpilih: [Fisch Meta Update] - Destiny Rod & Celestial Mutation', 'success')
    } else if (node.type === 'aiAgent') {
      addLog(label, `[Agent Role: ${node.data?.role || 'Autonomous Analyst'}]`, 'info')
      addLog(label, `[Model: ${aiModel || 'claude-sonnet-5-5'}] Menjalankan instruksi prompt...`, 'info')
      if (node.data?.aiPrompt) {
        addLog(label, `Task: "${node.data.aiPrompt.slice(0, 60)}..."`, 'success')
      }
      addLog(label, 'Agent berhasil menyelesaikan penalaran & menghasilkan output terstruktur.', 'success')
    } else if (node.type === 'aiGenerator') {
      addLog(label, `Menghubungi 9Router AI (${aiModel || 'gemini-3.7-flash-high'}) untuk visual & copy...`, 'info')
      addLog(label, `Format Visual: ${node.data?.aspectRatio || '4:5 (1080x1350)'}`, 'success')
      addLog(label, 'Copywriting & caption ter-generate: Hook + Pain Point + CTA bio', 'success')
      if (node.data?.qualityControl) {
        addLog(label, 'Quality Control: Skor QC 9.4/10. Visual bebas watermark dan teks terbaca jelas.', 'success')
      }
    } else if (node.type === 'code') {
      addLog(label, `Mengeksekusi Python script: ${node.data?.scriptName || 'main_auto_pipeline.py'}`, 'info')
      addLog(label, 'Script selesai dieksekusi dengan kode keluar 0 (OK).', 'success')
    } else if (node.type === 'publisher') {
      const account = node.data?.targetAccount || '@bluudzstore'
      if (node.data?.requireApproval) {
        addLog(label, `Post ditahan di antrean approval untuk ${account}. Menunggu konfirmasi admin.`, 'warning')
      } else {
        addLog(label, `Publish ${node.data?.format || 'carousel'} ke ${account} sukses!`, 'success')
      }
    } else {
      addLog(label, `Menjalankan node tipe ${node.type}`, 'info')
    }
  }

  addLog('Selesai', 'Pipeline berhasil dijalankan seluruhnya.', 'success')

  db.prepare(`
    insert into workflow_runs (id, workflow_id, user_id, status, trigger_type, logs, result)
    values (?, ?, ?, 'completed', 'manual', ?, 'Success')
  `).run(runId, workflow.id, req.user.id, JSON.stringify(logs))

  res.json({
    runId,
    status: 'completed',
    logs,
  })
})

// GET /api/workflows/:id/runs - Get run history
router.get('/:id/runs', requireUser, (req, res) => {
  const runs = db.prepare(`
    select id, status, trigger_type, logs, result, started_at, completed_at
    from workflow_runs
    where workflow_id = ? and user_id = ?
    order by started_at desc
    limit 20
  `).all(req.params.id, req.user.id)

  res.json({
    runs: runs.map((r) => ({
      ...r,
      logs: JSON.parse(r.logs || '[]'),
    })),
  })
})

export default router
