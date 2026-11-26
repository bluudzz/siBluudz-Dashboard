import { CONDITION_OPERATORS, validateGraph, workflowInputNode, workflowNodeInput } from './workflow-engine.js'
import { agentResources, isAiConnection, isSubNode, isTrigger } from './workflow-connections.js'
import { parseGoogleDriveLink } from './google-drive-link.js'
import { validateCron } from './workflow-cron.js'

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const EXPR_FIELDS = ['query', 'url', 'prompt', 'aiPrompt', 'caption', 'message', 'videoUrl', 'coverUrl', 'imageUrl', 'mediaId']
const BAD_EXPR = /\{\{\s*(?!\$json\.)[\w.-]+\s*\}\}/

// Shared by the editor and backend so users see the same checks before spending AI quota.
export function inspectWorkflow(nodes, edges, targetNodeId) {
  const issues = []
  const add = (severity, code, message, nodeId) => {
    if (!issues.some(issue => issue.code === code && issue.nodeId === nodeId)) issues.push({severity, code, message, ...(nodeId ? {nodeId} : {})})
  }
  const structural = validateGraph(nodes, edges)
  if (structural.length) return structural.map(message => ({severity:'error', code:'graph', message}))
  if (targetNodeId && !nodes.some(node => node.id === targetNodeId && !isSubNode(node.type))) return [{severity:'error', code:'target', message:'Pilih langkah utama yang tersedia untuk diuji.'}]
  const dataEdges = edges.filter(edge => !isAiConnection(edge))
  const scope = new Set()
  const ancestors = id => {
    if (scope.has(id)) return
    scope.add(id)
    dataEdges.filter(edge => edge.target === id).forEach(edge => ancestors(edge.source))
  }
  if (targetNodeId) ancestors(targetNodeId)
  else nodes.filter(node => !isSubNode(node.type)).forEach(node => scope.add(node.id))
  const triggers = nodes.filter(node => scope.has(node.id) && isTrigger(node.type) && !node.data.disabled)
  if (!triggers.length) add('error', 'trigger', targetNodeId ? 'Hubungkan langkah ini ke trigger yang aktif.' : 'Tambahkan Prompt Trigger, Manual Trigger, Webhook Trigger, atau Chat Trigger yang aktif.')
  const reachable = new Set()
  const visit = id => {
    if (reachable.has(id)) return
    reachable.add(id)
    dataEdges.filter(edge => edge.source === id).forEach(edge => visit(edge.target))
  }
  triggers.forEach(node => visit(node.id))
  for (const node of nodes.filter(node => scope.has(node.id))) {
    const data = workflowInputNode(node).data
    const label = String(data.label || node.type)
    if (!reachable.has(node.id)) { if (!targetNodeId) add('warning', 'disconnected', `${label} tidak terhubung ke trigger aktif dan akan dilewati.`, node.id); continue }
    if (data.disabled) continue
    if (data.pinnedOutput != null) { add('warning', 'pinned', `${label} memakai hasil tersimpan (pin), bukan hasil pengujian baru.`, node.id); continue }
    try{workflowNodeInput(node,dataEdges,{})}catch(error){add('error','input-source',`${label}: ${error.message}`,node.id)}
    for (const key of EXPR_FIELDS) {
      if (typeof data[key] === 'string') {
        const match = data[key].match(BAD_EXPR)
        if (match) add('error', 'expression-syntax', `${label}: ekspresi "${match[0]}" tidak didukung. Gunakan {{ $json.namaField }}.`, node.id)
      }
    }
    if (node.type === 'trigger' || node.type === 'set' || node.type === 'webhookTrigger') {
      try {
        const raw = node.type === 'set' ? data.fields : data.sampleData
        const parsed = typeof raw === 'string' ? JSON.parse(raw || (node.type === 'set' ? '{}' : node.type === 'webhookTrigger' ? '{}' : '[]')) : raw
        if (node.type === 'set' && parsed !== undefined && !object(parsed)) throw Error()
        if (node.type !== 'set' && parsed !== undefined && !object(parsed) && (!Array.isArray(parsed) || parsed.length > 1000 || parsed.some(item => !object(item) || !object(item.json)))) throw Error()
      } catch { add('error', 'data', `${label}: perbaiki bahan atau informasi yang diisi. Data teknis harus berupa JSON yang valid sesuai format node.`, node.id) }
      if (node.type === 'trigger' && data.triggerMode === 'schedule') {
        const cron = String(data.cron || '').trim()
        const check = validateCron(cron)
        if (!cron || !check.valid) add('error', 'cron', `${label}: ${check.error || 'isi jadwal cron 5 bagian yang valid (contoh: 0 10 * * *).'}`, node.id)
      }
    }
    if (node.type === 'promptTrigger') {
      if (!String(data.prompt||'').trim() || String(data.prompt||'').length>16000) add('error','prompt-trigger-text',`${label}: tulis prompt, maksimal 16.000 karakter.`,node.id)
      const mode=String(data.promptMode||'normal')
      if (!['normal','ai'].includes(mode)) add('error','prompt-trigger-mode',`${label}: pilih mode Normal atau AI.`,node.id)
      if (mode==='ai'&&!String(data.model||'').trim()) add('warning','prompt-trigger-model',`${label}: memakai model utama 9router dari pengaturan AI.`,node.id)
    }
    if (node.type === 'aiAgent') {
      if (data.executionMode !== 'live') { add('warning', 'preview', `${label} masih pratinjau dan tidak memanggil model AI.`, node.id); continue }
      const resources = agentResources(node.id, nodes, edges)
      if (!resources.model || resources.model.data.disabled) add('error', 'model', `${label}: hubungkan Model AI yang aktif.`, node.id)
      else if (!String(resources.model.data.model || '').trim()) add('error', 'model-selection', `Pilih model 9router untuk ${label}.`, resources.model.id)
      for (const tool of resources.tools.filter(tool => !tool.data.disabled)) {
        if (!['knowledge', 'textLength','webResearch'].includes(tool.data.toolType)) add('error', 'tool', `${String(tool.data.label || 'Tools')}: pilih kemampuan yang didukung pada pengaturan Tools.`, tool.id)
        else if (tool.data.toolType === 'knowledge' && !String(tool.data.content || '').trim()) add('warning', 'brief', `${String(tool.data.label || 'Tools')}: brief masih kosong. Isi agar AI memiliki bahan tambahan.`, tool.id)
      }
    }
    if (node.type === 'splitOut' && !dataEdges.some(edge => edge.target === node.id)) add('error', 'split-input', `${label}: hubungkan langsung setelah AI Agent.`, node.id)
    if (node.type === 'merge') {
      const mode = String(data.mode || 'combineByPosition')
      if (!['combineByPosition', 'append', 'aggregate'].includes(mode)) add('error', 'merge-mode', `${label}: pilih mode penggabungan yang didukung.`, node.id)
      if (mode === 'combineByPosition' && dataEdges.filter(edge => edge.target === node.id).length < 2) add('warning', 'merge-inputs', `${label}: hubungkan minimal 2 cabang untuk menggabungkan data antar jalur.`, node.id)
    }
    if (node.type === 'jsonParse') {
      if (!['parse', 'splitArray'].includes(String(data.parseMode || 'parse'))) add('error', 'json-mode', `${label}: pilih mode Parse JSON yang didukung.`, node.id)
    }
    if (node.type === 'wait') {
      const seconds = Number(data.durationSeconds ?? 5)
      if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 300) add('error', 'wait-duration', `${label}: durasi tunda harus antara 0,1 dan 300 detik.`, node.id)
    }
    if (node.type === 'approval') {
      if (data.approvedItems == null) add('warning', 'approval-pending', `${label}: alur akan menunggu sampai hasilnya ditinjau dan disetujui.`, node.id)
      else if (!Array.isArray(data.approvedItems) || !data.approvedItems.length || data.approvedItems.length > 1000 || data.approvedItems.some(item => !object(item) || !object(item.json))) add('error', 'approval-data', `${label}: data persetujuan tidak valid. Cabut persetujuan lalu uji ulang.`, node.id)
    }
    if (node.type === 'searchContent') {
      const mode=String(data.sourceMode||'search')
      if(!['search','url'].includes(mode))add('error','search-mode',`${label}: pilih pencarian topik atau URL langsung.`,node.id)
      if(mode==='search'&&String(data.query||'').length>200)add('error','search-query',`${label}: topik pencarian maksimal 200 karakter.`,node.id)
      if(mode==='url'){
        const raw=String(data.url||'').trim()
        if(!raw)add('error','search-url',`${label}: isi alamat HTTPS publik yang akan dibaca.`,node.id)
        else if(!raw.includes('{{'))try{const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443')throw Error()}catch{add('error','search-url',`${label}: gunakan URL HTTPS publik tanpa kredensial.`,node.id)}
      }
    }
    if (node.type === 'apiRequest') {
      const method = String(data.method || 'GET').toUpperCase()
      if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) add('error', 'api-method', `${label}: metode HTTP tidak didukung.`, node.id)
      const raw = String(data.url || '').trim()
      if (!raw) add('error', 'api-url', `${label}: isi alamat HTTPS publik tujuan.`, node.id)
      else if (!raw.includes('{{')) {
        try { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw Error() }
        catch { add('error', 'api-url', `${label}: gunakan URL HTTPS publik tanpa kredensial.`, node.id) }
      }
      if (String(data.headers || '').trim()) {
        try { const parsed = JSON.parse(String(data.headers)); if (!object(parsed)) throw Error() }
        catch { add('error', 'api-headers', `${label}: headers harus berupa objek JSON yang valid.`, node.id) }
      }
      if (['POST', 'PUT', 'PATCH'].includes(method) && String(data.body || '').trim() && !String(data.body).includes('{{')) {
        try { JSON.parse(String(data.body)) } catch { add('error', 'api-body', `${label}: body JSON tidak valid.`, node.id) }
      }
    }
    if(node.type==='googleDrive'){
      if(!String(data.accountId||'').trim())add('error','drive-account',`${label}: hubungkan dan pilih akun Google Drive.`,node.id)
      if(!['shared','list','view','download'].includes(String(data.operation||'shared')))add('error','drive-operation',`${label}: pilih tindakan Google Drive yang didukung.`,node.id)
      if(data.mediaFilter&&!['images','videos','all'].includes(String(data.mediaFilter)))add('error','drive-media',`${label}: pilih jenis file Google Drive yang didukung.`,node.id)
      if(String(data.search||'').length>100)add('error','drive-search',`${label}: nama file maksimal 100 karakter.`,node.id)
      if(String(data.operation||'shared')==='shared'){
        const link=String(data.sharedLink||'').trim()
        if(!link)add('error','drive-link',`${label}: tempel link berbagi file atau folder Google Drive.`,node.id)
        else if(!link.includes('{{'))try{parseGoogleDriveLink(link)}catch(error){add('error','drive-link',`${label}: ${error.message}`,node.id)}
        if(!['random','name'].includes(String(data.selectionMode||'random')))add('error','drive-selection',`${label}: pilih media acak atau berdasarkan nama.`,node.id)
        if(data.selectionMode==='name'&&!String(data.nameFilter||'').trim())add('error','drive-name',`${label}: isi nama file yang dicari.`,node.id)
      }
    }
    if (node.type === 'imageGenerate') {
      if (!String(data.model||'').trim()) add('error','image-model',`${label}: pilih model gambar 9router.`,node.id)
      if (String(data.prompt||'').length > 4000) add('error','image-prompt',`${label}: prompt gambar maksimal 4.000 karakter.`,node.id)
      if (!String(data.prompt||'').trim()) add('warning','image-input',`${label}: prompt akan dibaca dari data "prompt" pada langkah sebelumnya.`,node.id)
    }
    if (node.type === 'imageEdit') {
      const editMode = String(data.editMode || 'igFormat')
      if (!['igFormat', 'aiEdit'].includes(editMode)) add('error', 'image-edit-mode', `${label}: pilih mode edit gambar yang didukung.`, node.id)
      else if (editMode === 'igFormat') {
        if (!['4:5', '1:1', '9:16', 'original'].includes(String(data.aspectRatio || '4:5'))) add('error', 'image-aspect', `${label}: pilih rasio gambar yang didukung.`, node.id)
      } else {
        if (!String(data.model || '').trim()) add('error', 'image-edit-model', `${label}: pilih model gambar 9router untuk AI Edit.`, node.id)
        if (String(data.prompt || '').length > 4000) add('error', 'image-edit-prompt', `${label}: prompt edit gambar maksimal 4.000 karakter.`, node.id)
        if (!String(data.prompt || '').trim()) add('warning', 'image-edit-input', `${label}: prompt edit akan dibaca dari langkah sebelumnya.`, node.id)
      }
    }
    if (node.type === 'aiVision') {
      if (!String(data.model || '').trim()) add('warning', 'vision-model', `${label}: memakai model utama 9router dari pengaturan AI.`, node.id)
      if (String(data.prompt || '').length > 4000) add('error', 'vision-prompt', `${label}: instruksi analisis gambar maksimal 4.000 karakter.`, node.id)
    }
    if (node.type === 'notify') {
      if (!String(data.channelId || '').trim()) add('error', 'notify-channel', `${label}: hubungkan dan pilih channel notifikasi.`, node.id)
      if (String(data.message || '').length > 4000) add('error', 'notify-message', `${label}: pesan notifikasi maksimal 4.000 karakter.`, node.id)
    }
    if (node.type === 'instagram') {
      const operation=String(data.operation||'publish')
      if (!['publish','reels','stories','list','inspect','comments','insights'].includes(operation)) add('error','instagram-operation',`${label}: pilih operasi Instagram yang didukung.`,node.id)
      if (!String(data.accountId||'').trim()) add('error','instagram-account',`${label}: hubungkan dan pilih akun Instagram.`,node.id)
      if (['publish','reels','stories'].includes(operation)) {
        const previous=new Set()
        const collect=id=>{if(previous.has(id))return;previous.add(id);dataEdges.filter(edge=>edge.target===id).forEach(edge=>collect(edge.source))}
        collect(node.id)
        if (!nodes.some(candidate=>previous.has(candidate.id)&&candidate.type==='approval'&&!candidate.data.disabled&&candidate.data.pinnedOutput==null)) add('error','instagram-approval',`${label}: hubungkan Persetujuan Manual yang aktif sebelum publikasi.`,node.id)
        if (['publish','reels'].includes(operation)&&String(data.caption||'').length>2200) add('error','instagram-caption',`${label}: caption maksimal 2.200 karakter.`,node.id)
      }
      if (operation==='reels'&&!String(data.videoUrl||'').trim()) add('warning','instagram-video-input',`${label}: video Reel akan dibaca dari data "videoUrl" langkah sebelumnya.`,node.id)
      if (['inspect','comments'].includes(operation)&&!String(data.mediaId||'').trim()) add('warning','instagram-media-input',`${label}: ID post akan dibaca dari langkah sebelumnya.`,node.id)
    }
    if (node.type === 'httpRequest') {
      const raw = String(data.url || '').trim()
      if (!raw) add('error', 'http-url', `${label}: isi alamat HTTPS publik yang akan dibaca.`, node.id)
      else if (!raw.includes('{{')) {
        try { const url = new URL(raw); if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw Error() }
        catch { add('error', 'http-url', `${label}: gunakan URL HTTPS publik tanpa kredensial.`, node.id) }
      }
    }
    if (node.type === 'if') {
      if (!String(data.field || '').trim()) add('error', 'condition-field', `${label}: pilih informasi yang ingin diperiksa.`, node.id)
      if (!CONDITION_OPERATORS.includes(String(data.operator || 'equals'))) add('error', 'condition-operator', `${label}: pilih syarat yang didukung.`, node.id)
    }
    if (node.type === 'switch') {
      if (!String(data.field || '').trim()) add('error', 'switch-field', `${label}: pilih informasi yang ingin diperiksa.`, node.id)
      for (const n of [1, 2, 3]) {
        const op = String(data[`rule${n}Operator`] || '')
        if (op && !CONDITION_OPERATORS.includes(op)) add('error', `switch-rule-${n}`, `${label}: operator aturan ${n} tidak didukung.`, node.id)
      }
    }
  }
  return issues
}
