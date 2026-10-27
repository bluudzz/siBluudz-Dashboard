import { validateGraph } from './workflow-engine.js'
import { agentResources, isAiConnection, isSubNode, isTrigger } from './workflow-connections.js'

const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))

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
  if (!triggers.length) add('error', 'trigger', targetNodeId ? 'Hubungkan langkah ini ke trigger yang aktif.' : 'Tambahkan Prompt Trigger, Manual Trigger, atau Chat Trigger yang aktif.')
  const reachable = new Set()
  const visit = id => {
    if (reachable.has(id)) return
    reachable.add(id)
    dataEdges.filter(edge => edge.source === id).forEach(edge => visit(edge.target))
  }
  triggers.forEach(node => visit(node.id))
  for (const node of nodes.filter(node => scope.has(node.id))) {
    const data = node.data
    const label = String(data.label || node.type)
    if (!reachable.has(node.id)) { if (!targetNodeId) add('warning', 'disconnected', `${label} tidak terhubung ke trigger aktif dan akan dilewati.`, node.id); continue }
    if (data.disabled) continue
    if (data.pinnedOutput != null) { add('warning', 'pinned', `${label} memakai hasil tersimpan (pin), bukan hasil pengujian baru.`, node.id); continue }
    if (node.type === 'trigger' || node.type === 'set') {
      try {
        const raw = node.type === 'trigger' ? data.sampleData : data.fields
        const parsed = typeof raw === 'string' ? JSON.parse(raw || (node.type === 'trigger' ? '[]' : '{}')) : raw
        if (node.type === 'set' && parsed !== undefined && !object(parsed)) throw Error()
        if (node.type === 'trigger' && parsed !== undefined && !object(parsed) && (!Array.isArray(parsed) || parsed.length > 1000 || parsed.some(item => !object(item) || !object(item.json)))) throw Error()
      } catch { add('error', 'data', `${label}: perbaiki bahan atau informasi yang diisi. Data teknis harus berupa JSON yang valid sesuai format node.`, node.id) }
      if (node.type === 'trigger' && data.triggerMode === 'schedule') add('warning', 'schedule', `${label} hanya bisa dijalankan manual; jadwal otomatis belum aktif.`, node.id)
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
        if (!['knowledge', 'textLength'].includes(tool.data.toolType)) add('error', 'tool', `${String(tool.data.label || 'Tools')}: pilih kemampuan yang didukung pada pengaturan Tools.`, tool.id)
        else if (tool.data.toolType === 'knowledge' && !String(tool.data.content || '').trim()) add('warning', 'brief', `${String(tool.data.label || 'Tools')}: brief masih kosong. Isi agar AI memiliki bahan tambahan.`, tool.id)
      }
    }
    if (node.type === 'splitOut' && !dataEdges.some(edge => edge.target === node.id)) add('error', 'split-input', `${label}: hubungkan langsung setelah AI Agent.`, node.id)
    if (node.type === 'approval') {
      if (data.approvedItems == null) add('warning', 'approval-pending', `${label}: alur akan menunggu sampai hasilnya ditinjau dan disetujui.`, node.id)
      else if (!Array.isArray(data.approvedItems) || !data.approvedItems.length || data.approvedItems.length > 1000 || data.approvedItems.some(item => !object(item) || !object(item.json))) add('error', 'approval-data', `${label}: data persetujuan tidak valid. Cabut persetujuan lalu uji ulang.`, node.id)
    }
    if (node.type === 'searchContent') {
      if (String(data.query || '').length > 200) add('error', 'search-query', `${label}: topik pencarian maksimal 200 karakter.`, node.id)
      if (!Number.isInteger(Number(data.limit || 5)) || Number(data.limit || 5) < 1 || Number(data.limit || 5) > 10) add('error', 'search-limit', `${label}: pilih 1 sampai 10 sumber.`, node.id)
    }
    if (node.type === 'imageGenerate') {
      if (!String(data.model||'').trim()) add('error','image-model',`${label}: pilih model gambar 9router.`,node.id)
      if (String(data.prompt||'').length > 4000) add('error','image-prompt',`${label}: prompt gambar maksimal 4.000 karakter.`,node.id)
      if (!String(data.prompt||'').trim()) add('warning','image-input',`${label}: prompt akan dibaca dari data "prompt" pada langkah sebelumnya.`,node.id)
    }
    if (node.type === 'instagram') {
      const operation=String(data.operation||'publish')
      if (!['publish','list','inspect'].includes(operation)) add('error','instagram-operation',`${label}: pilih operasi Instagram yang didukung.`,node.id)
      if (!String(data.accountId||'').trim()) add('error','instagram-account',`${label}: hubungkan dan pilih akun Instagram.`,node.id)
      if (operation==='publish') {
        const previous=new Set()
        const collect=id=>{if(previous.has(id))return;previous.add(id);dataEdges.filter(edge=>edge.target===id).forEach(edge=>collect(edge.source))}
        collect(node.id)
        if (!nodes.some(candidate=>previous.has(candidate.id)&&candidate.type==='approval'&&!candidate.data.disabled&&candidate.data.pinnedOutput==null)) add('error','instagram-approval',`${label}: hubungkan Persetujuan Manual yang aktif sebelum publikasi.`,node.id)
        if (String(data.caption||'').length>2200) add('error','instagram-caption',`${label}: caption maksimal 2.200 karakter.`,node.id)
      }
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
      if (!['equals', 'contains', 'exists'].includes(data.operator || 'equals')) add('error', 'condition-operator', `${label}: pilih syarat yang didukung.`, node.id)
    }
  }
  return issues
}
