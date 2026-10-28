import { aiPorts, isSubNode, isTrigger, isAiConnection, agentResources } from './workflow-connections.js'
export const WORKFLOW_NODE_TYPES = new Set(['trigger', 'chatTrigger', 'promptTrigger', 'chatModel', 'memory', 'tool', 'set', 'splitOut', 'if', 'aiAgent', 'approval', 'searchContent', 'httpRequest', 'googleDrive', 'imageGenerate', 'instagram'])
const TYPES = WORKFLOW_NODE_TYPES
const object = value => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const own = (value, key) => object(value) && Object.hasOwn(value, key)

export function validateGraph(nodes, edges, forRun = false) {
  const errors = []
  if (!Array.isArray(nodes) || !Array.isArray(edges)) return ['Nodes dan edges harus berupa array.']
  if (nodes.length > 100 || edges.length > 300) return ['Maksimal 100 node dan 300 koneksi per workflow.']
  const ids = new Set()
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || ids.has(node.id)) errors.push('ID node harus unik dan tidak kosong.')
    ids.add(node?.id)
    if (['__proto__', 'constructor', 'prototype'].includes(node?.id) || node?.id?.length > 200) errors.push('ID node tidak valid.')
    if (!TYPES.has(node?.type)) errors.push(`Tipe node tidak didukung: ${node?.type || 'kosong'}.`)
    if (!object(node?.data)) errors.push(`Parameter node ${node?.id} tidak valid.`)
    if (!Number.isFinite(node?.position?.x) || !Number.isFinite(node?.position?.y)) errors.push(`Posisi node ${node?.id} tidak valid.`)
  }
  if (errors.length) return [...new Set(errors)]
  const outgoing = new Map(nodes.map(n => [n.id, []]))
  const degrees = new Map(nodes.map(n => [n.id, 0]))
  const edgeIds = new Set()
  const connections = new Set()
  for (const edge of edges) {
    if (!edge || !ids.has(edge.source) || !ids.has(edge.target)) { errors.push('Koneksi mengarah ke node yang tidak ada.'); continue }
    if (typeof edge.id !== 'string' || !edge.id || edgeIds.has(edge.id)) errors.push('ID koneksi harus unik.')
    edgeIds.add(edge.id)
    const signature = `${edge.source}:${edge.sourceHandle || ''}:${edge.target}:${edge.targetHandle || ''}`
    if (connections.has(signature)) errors.push('Koneksi yang sama tidak boleh ditambahkan dua kali.')
    connections.add(signature)
    const source = nodes.find(n => n.id === edge.source)
    const target = nodes.find(n => n.id === edge.target)
    if(isSubNode(source.type)||isSubNode(target.type)||isAiConnection(edge)) {
      if(!isSubNode(source.type)||target.type!=='aiAgent'||edge.targetHandle!==aiPorts[source.type]||edge.sourceHandle!==aiPorts[source.type])errors.push('Hubungkan sub-node ke port AI Agent yang sesuai: Chat Model, Memory, atau Tool.')
      if(['chatModel','memory'].includes(source.type)&&edges.filter(other=>other.target===edge.target&&other.targetHandle===edge.targetHandle).length>1)errors.push('AI Agent hanya dapat memakai satu Chat Model dan satu Memory.')
    } else {
    if (source.type === 'if' && !['true', 'false'].includes(edge.sourceHandle)) errors.push('Koneksi IF harus memakai output true atau false.')
    if (isTrigger(target.type)) errors.push('Trigger tidak boleh menerima koneksi masuk.')
    }
    outgoing.get(edge.source).push(edge.target)
    degrees.set(edge.target, degrees.get(edge.target) + 1)
  }
  for (const split of nodes.filter(node => node.type === 'splitOut')) {
    const incoming = edges.filter(edge => edge.target === split.id)
    const nonAgent = incoming.filter(edge => nodes.find(node => node.id === edge.source)?.type !== 'aiAgent')
    if (nonAgent.length) errors.push('Node Split Out hanya boleh menerima output langsung dari AI Agent.')
    if (incoming.length > 1) errors.push('Node Split Out hanya boleh memiliki satu koneksi dari AI Agent.')
    if (forRun && incoming.length === 0) errors.push('Hubungkan node Split Out langsung setelah AI Agent sebelum menjalankan workflow.')
    const count = Number(split.data?.splitCount ?? 3)
    if (!Number.isInteger(count) || count < 1 || count > 20) errors.push('Jumlah output Split Out harus berupa angka bulat antara 1 dan 20.')
  }
  const queue = [...degrees].filter(([, degree]) => degree === 0).map(([id]) => id)
  let count = 0
  while (queue.length) {
    const id = queue.shift(); count++
    for (const next of outgoing.get(id) || []) { degrees.set(next, degrees.get(next) - 1); if (degrees.get(next) === 0) queue.push(next) }
  }
  if (count !== nodes.length) errors.push('Workflow berisi koneksi melingkar. Hapus koneksi yang kembali ke node sebelumnya.')
  if (forRun && !nodes.some(n => isTrigger(n.type) && !n.data?.disabled)) errors.push('Tambahkan setidaknya satu trigger yang aktif sebelum menjalankan workflow.')
  return [...new Set(errors)]
}

function getPath(value, path) {
  for (const key of path.split('.')) {
    if (['__proto__', 'constructor', 'prototype'].includes(key) || !own(value, key)) throw new Error(`Field input tidak ditemukan: ${path}`)
    value = value[key]
  }
  return value
}

// A small, explicit expression subset. No arbitrary JavaScript evaluation.
export function resolveValue(value, json) {
  if (Array.isArray(value)) return value.map(item => resolveValue(item, json))
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveValue(item, json)]))
  if (typeof value !== 'string') return value
  const exact = value.match(/^\s*\{\{\s*\$json\.([\w.-]+)\s*\}\}\s*$/)
  if (exact) return getPath(json, exact[1])
  return value.replace(/\{\{\s*\$json\.([\w.-]+)\s*\}\}|\{([\w.]+)\}/g, (_, path, legacy) => {
    const result = getPath(json, path || legacy)
    return typeof result === 'object' ? JSON.stringify(result) : String(result)
  }).replace(/\{\{[\s\S]*?\}\}/g, () => { throw new Error('Ekspresi belum didukung. Gunakan {{ $json.namaField }}.') })
}

function parseItems(value, fallback = []) {
  const parsed = typeof value === 'string' ? JSON.parse(value || '[]') : value
  if (parsed === undefined) return fallback
  if (object(parsed)) return [{ json: parsed }]
  if (!Array.isArray(parsed) || parsed.length > 1000 || parsed.some(item => !object(item) || !object(item.json))) throw new Error('Data harus berupa objek JSON atau array item [{"json": {...}}], maksimal 1000 item.')
  return parsed
}

function* graphSteps(nodes, allEdges, targetNodeId, live=false, onProgress=()=>{}) {
  const edges=allEdges.filter(edge=>!isAiConnection(edge))
  const errors = validateGraph(nodes, allEdges, true)
  if (targetNodeId && !nodes.some(n => n.id === targetNodeId)) errors.push('Node tujuan tidak ditemukan.')
  if(targetNodeId&&isSubNode(nodes.find(node=>node.id===targetNodeId)?.type))errors.push('Sub-node dijalankan melalui AI Agent. Pilih Execute step pada AI Agent.')
  if (errors.length) throw new Error(errors.join(' '))
  const allowed = new Set()
  if (targetNodeId) {
    const collect = id => { if (allowed.has(id)) return; allowed.add(id); edges.filter(e => e.target === id).forEach(e => collect(e.source)) }
    collect(targetNodeId)
    if (!nodes.some(n => allowed.has(n.id) && isTrigger(n.type) && !n.data.disabled)) throw new Error('Hubungkan node tujuan ke trigger yang aktif sebelum Execute step.')
  } else nodes.forEach(n => allowed.add(n.id))
  const degrees = new Map(nodes.map(n => [n.id, edges.filter(e => e.target === n.id).length]))
  const queue = nodes.filter(n => degrees.get(n.id) === 0).map(n => n.id)
  const order = []
  while (queue.length) { const id = queue.shift(); order.push(id); for (const edge of edges.filter(e => e.source === id)) { degrees.set(edge.target, degrees.get(edge.target)-1); if (degrees.get(edge.target) === 0) queue.push(edge.target) } }
  const nodeResults = {}
  const logs = []
  let failed = false
  let usedLive = false
  let awaitingApproval = false
  const blocked = new Set()
  const blockDescendants = id => {
    for (const edge of edges.filter(edge => edge.source === id)) {
      if (blocked.has(edge.target)) continue
      blocked.add(edge.target)
      blockDescendants(edge.target)
    }
  }
  for (const id of order) {
    if (!allowed.has(id)) continue
    const node = nodes.find(n => n.id === id)
    if(isSubNode(node.type))continue
    const data = node.data
    const start = Date.now()
    const input = edges.filter(e => e.target === id).flatMap(e => {
      const parent = nodeResults[e.source]
      if (!parent) return []
      return parent.branches ? parent.branches[e.sourceHandle] || [] : parent.output
    })
    const result = { nodeId: id, label: data.label || node.type, status: 'success', input, output: [], durationMs: 0 }
    nodeResults[id] = result
    onProgress({phase:'start',nodeId:id,label:result.label})
    try {
      if (input.length > 1000) throw new Error('Input gabungan melebihi batas 1000 item per node.')
      if (failed || blocked.has(id) || (!isTrigger(node.type) && input.length === 0)) { result.status = 'skipped'; result.message = blocked.has(id) ? 'Menunggu persetujuan manual.' : failed ? 'Dilewati karena eksekusi sebelumnya gagal.' : 'Tidak ada item masuk pada cabang ini.' }
      else if (data.disabled) { result.status = 'skipped'; result.output = input; result.message = 'Node dinonaktifkan; input diteruskan.'; if(node.type === 'if') result.branches = {true:input,false:[]} }
      else if (data.pinnedOutput !== undefined && data.pinnedOutput !== null) { result.output = parseItems(data.pinnedOutput); result.status = 'pinned'; result.message = 'Menggunakan data pin untuk pengujian.'; if(node.type === 'if') throw new Error('Pin pada IF belum didukung. Pin data pada node sebelum IF.') }
      else if (node.type === 'trigger') result.output = parseItems(data.sampleData, [{ json: { triggeredAt: new Date().toISOString() } }])
      else if (node.type === 'chatTrigger') result.output = [{json:{chatInput:String(data.chatInput||''),sessionId:String(data.sessionId||'test-session')}}]
      else if (node.type === 'promptTrigger') {
        const prompt=String(data.prompt||'').trim()
        if(!prompt||prompt.length>16000)throw new Error('Tulis prompt pemicu, maksimal 16.000 karakter.')
        const mode=String(data.promptMode||'normal')
        if(mode==='normal') {
          result.output=[{json:{prompt,originalPrompt:prompt}}]
          result.message='Prompt diteruskan tanpa memanggil AI.'
        } else if(mode==='ai') {
          if(!live)throw new Error('Mode AI Prompt Trigger hanya dapat dijalankan melalui backend.')
          const response=yield {kind:'promptTrigger',node,input:[]}
          if(response.error)throw new Error(response.error)
          result.output=response.output
          result.message='AI menyelesaikan prompt dan mengirim hasilnya ke langkah berikutnya.'
          usedLive=true
        } else throw new Error('Mode Prompt Trigger tidak didukung.')
      }
      else if (node.type === 'approval') {
        if (data.approvedItems != null) { result.output = parseItems(data.approvedItems); if (!result.output.length) throw new Error('Hasil persetujuan kosong. Cabut persetujuan lalu uji ulang.'); result.message = 'Meneruskan versi konten yang sudah Anda setujui.' }
        else { result.status = 'waiting'; result.message = 'Tinjau bahan masuk, lalu setujui hasilnya pada node ini dan jalankan ulang.'; awaitingApproval = true; blockDescendants(id) }
      }
      else if (node.type === 'searchContent' || node.type === 'httpRequest' || node.type === 'googleDrive') {
        if (!live) throw new Error('Langkah internet hanya dapat diuji lewat backend.')
        const response = yield {kind:node.type==='googleDrive'?'googleDrive':node.type==='searchContent'?'research':'external',node,input}
        if (response.error) throw new Error(response.error)
        result.output = response.output
        usedLive = true
        result.message = node.type === 'searchContent' ? 'Informasi dan isi sumber berhasil diambil; gunakan hanya halaman yang berhasil dibaca.' : node.type==='googleDrive'?'File Google Drive berhasil dibaca.':'Respons halaman/API berhasil diambil.'
      }
      else if (node.type === 'imageGenerate' || node.type === 'instagram') {
        if (!live) throw new Error('Langkah ini hanya dapat diuji lewat backend.')
        if (node.type === 'instagram' && (data.operation || 'publish') === 'publish') {
          const parents = new Set()
          const collect = current => { if (parents.has(current)) return; parents.add(current); edges.filter(edge => edge.target === current).forEach(edge => collect(edge.source)) }
          collect(node.id)
          const approved = nodes.some(candidate => candidate.type === 'approval' && parents.has(candidate.id) && nodeResults[candidate.id]?.status === 'success' && nodeResults[candidate.id].output.length > 0)
          if (!approved) throw new Error('Publikasi memerlukan hasil Persetujuan Manual yang benar-benar sudah dijalankan.')
        }
        const response = yield {kind:node.type,node,input}
        if (response.error) throw new Error(response.error)
        result.output = response.output
        usedLive = true
        result.message = node.type === 'imageGenerate' ? 'Gambar dibuat dengan model 9router; periksa hasil sebelum publikasi.' : 'Operasi Instagram selesai; lihat ID dan status post pada hasil.'
      }
      else if (node.type === 'set') {
        const fields = typeof data.fields === 'string' ? JSON.parse(data.fields || '{}') : data.fields || {}
        if (!object(fields)) throw new Error('Fields harus berupa objek JSON.')
        result.output = input.map(item => ({ json: { ...(data.keepInput !== false ? item.json : {}), ...resolveValue(fields, item.json) } }))
       } else if (node.type === 'splitOut') {
         const sourceField = 'output'
         const arrayField = 'prompts'
         const expectedCount = Number(data.splitCount ?? 3)
         result.output = input.flatMap(item => {
           const source = getPath(item.json, sourceField)
           const parsed = typeof source === 'string' ? JSON.parse(source) : source
           const values = object(parsed) && Array.isArray(parsed[arrayField]) ? parsed[arrayField] : null
           if (!values || values.some(value => !object(value))) throw new Error('Hasil AI Agent harus berupa JSON dengan daftar prompts berisi objek.')
           if (values.length !== expectedCount) throw new Error(`Split Out meminta ${expectedCount} output, tetapi AI Agent menghasilkan ${values.length}. Periksa instruksi AI Agent.`)
           return values.map((value, index) => ({json:{...value,splitIndex:index+1}}))
         })
       } else if (node.type === 'if') {
        const yes = [], no = []
        if (!['equals','contains','exists'].includes(data.operator || 'equals')) throw new Error('Operator IF tidak didukung.')
        for (const item of input) {
          let value
          try { value = getPath(item.json, String(data.field || '')) } catch (error) { if(data.operator !== 'exists') throw error }
          const expected = resolveValue(data.value ?? '', item.json)
          const pass = data.operator === 'exists' ? value !== undefined && value !== null : data.operator === 'contains' ? String(value).includes(String(expected)) : String(value) === String(expected)
          ;(pass ? yes : no).push(item)
        }
        result.branches = { true: yes, false: no }; result.output = [...yes, ...no]
       } else if(node.type==='aiAgent'&&data.executionMode==='live') {
        if(!live)throw new Error('AI Agent aktif memerlukan runtime backend. Gunakan endpoint Execute atau Uji chat.')
        const resources=agentResources(node.id,nodes,allEdges)
        if(!resources.model||resources.model.data.disabled)throw new Error('Hubungkan Chat Model yang aktif ke port Chat Model AI Agent.')
        usedLive=true
         const splitTarget=edges.map(edge=>nodes.find(candidate=>candidate.id===edge.target)).find(candidate=>candidate?.type==='splitOut'&&edges.some(edge=>edge.source===node.id&&edge.target===candidate.id))
         const executionNode=splitTarget?{...node,data:{...node.data,splitOutCount:Number(splitTarget.data.splitCount??3)}}:node
         const response=yield {kind:'agent',node:executionNode,input,resources}
        if(response.error)throw new Error(response.error)
         result.output=response.output
         result.message='AI Agent memanggil model 9router; lihat output dan jejak tool.'
       }
       else {
        result.status = 'simulated'
        result.message = 'Pratinjau konfigurasi; tidak ada layanan eksternal yang dipanggil.'
        result.output = input.map(item => ({ json: {
          ...item.json,
           preview: { type: node.type, model: data.aiModel || data.model || '', prompt: resolveValue(data.aiPrompt || '', item.json), status: 'not_requested' },
        } }))
      }
    } catch (error) { result.status = 'error'; result.error = error.message; result.output = []; failed = true }
    result.durationMs = Date.now() - start
    logs.push({ nodeId:id, step:result.label, status:result.status, time:new Date().toISOString(), message:result.error || result.message || `${result.output.length} item dihasilkan.` })
    onProgress({phase:'complete',nodeId:id,label:result.label,status:result.status,error:result.error,result})
  }
  return { status: failed ? 'error' : awaitingApproval ? 'waiting_approval' : 'completed', mode: usedLive?'live':'simulation', nodeResults, nodeOutputs: Object.fromEntries(Object.entries(nodeResults).map(([id,result]) => [id,result.output])), logs }
}

export function executeGraph(nodes,edges,targetNodeId) {
  return graphSteps(nodes,edges,targetNodeId).next().value
}
export async function executeGraphAsync(nodes,edges,targetNodeId,runAgent,onProgress=()=>{},signal) {
  const steps=graphSteps(nodes,edges,targetNodeId,true,onProgress)
  let step=steps.next()
  while(!step.done){
    let response
    if(signal?.aborted)response={error:'Pengujian dihentikan pengguna.'}
    else try { response={output:await runAgent(step.value)} }
    catch(error) { response={error:error.message} }
    step=steps.next(response)
    if(signal?.aborted){
      while(!step.done)step=steps.next({error:'Pengujian dihentikan pengguna.'})
      return {...step.value,status:'cancelled'}
    }
  }
  return step.value
}
