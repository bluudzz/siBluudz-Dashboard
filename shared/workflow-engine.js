import { aiPorts, isSubNode, isTrigger, isStartNode, isAiConnection, agentResources } from './workflow-connections.js'
export const WORKFLOW_NODE_TYPES = new Set([
  'trigger', 'chatTrigger', 'promptTrigger', 'webhookTrigger', 'mediaFile',
  'chatModel', 'memory', 'tool',
  'set', 'splitOut', 'merge', 'jsonParse',
  'if', 'switch', 'wait', 'approval',
  'searchContent', 'httpRequest', 'apiRequest', 'googleDrive',
  'imageGenerate', 'imageEdit', 'videoGenerate', 'aiVision', 'aiAgent',
  'instagram', 'notify',
])
export const CONDITION_OPERATORS = ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'gt', 'lt', 'exists', 'isEmpty']
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
    for(const key of ['inputSource','inputField'])if(node?.data?.[key]!==undefined&&(typeof node.data[key]!=='string'||node.data[key].length>200))errors.push(`Pengaturan input node ${node?.id} tidak valid.`)
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
    if (source.type === 'switch' && !['case1', 'case2', 'case3', 'fallback'].includes(edge.sourceHandle)) errors.push('Koneksi Switch harus memakai output case1, case2, case3, atau fallback.')
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
  if (forRun && !nodes.some(n => isStartNode(n, edges) && !n.data?.disabled)) errors.push('Tambahkan trigger atau node File / Media Referensi yang aktif sebelum menjalankan workflow.')
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
  return value.replace(/\{\{\s*\$json\.([\w.-]+)\s*\}\}|(?<!\{)\{([\w.]+)\}(?!\})/g, (_, path, legacy) => {
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

export function workflowInput(json) {
  if(Object.hasOwn(json,'output'))return json.output
  if(Array.isArray(json.pages)||Array.isArray(json.sources))return json
  for (const key of ['prompt','chatInput','content']) {
    const value=Object.hasOwn(json,key)?json[key]:undefined
    if (value!==undefined&&value!==null&&(typeof value!=='string'||value.trim())) return value
  }
  return json
}

export function workflowNodeInput(node,edges,results) {
  const incoming=edges.filter(edge=>edge.target===node.id&&!isAiConnection(edge))
  const source=String(node.data.inputSource||'')
  if(source&&!incoming.some(edge=>edge.source===source))throw new Error('Sumber input sudah tidak terhubung. Pilih Otomatis atau hubungkan kembali node sumber.')
  const items=incoming.filter(edge=>!source||edge.source===source).flatMap(edge=>{
    const parent=results[edge.source]
    return parent?(parent.branches?parent.branches[edge.sourceHandle]||[]:parent.output):[]
  })
  const field=String(node.data.inputField||'').trim()
  if(!field)return items
  if(field.split('.').some(key=>!key||['__proto__','prototype','constructor'].includes(key)))throw new Error('Field input tidak valid.')
  return items.map(item=>{
    const value=getPath(item.json,field)
    return {json:{...item.json,output:value,...(typeof value==='string'?{prompt:value,chatInput:value}:{})}}
  })
}

export function workflowInputNode(node) {
  if(!String(node.data.inputField||'').trim())return node
  const operation=node.data.operation||'publish'
  const key={
    httpRequest:'url',
    apiRequest:'url',
    googleDrive:{shared:'sharedLink',list:'search',view:'fileId',download:'fileId'}[node.data.operation||'list'],
    instagram:{publish:'imageUrl',stories:'imageUrl',reels:'videoUrl',inspect:'mediaId',comments:'mediaId'}[operation],
    if:'field',
    switch:'field',
    notify:'message',
  }[node.type]
  const changes=node.type==='imageGenerate'||node.type==='imageEdit'||node.type==='aiVision'
    ?{prompt:''}
    :node.type==='searchContent'
      ?(node.data.sourceMode==='url'?{url:'{{ $json.output }}'}:{query:''})
      :key
        ?{[key]:(node.type==='if'||node.type==='switch')?'output':'{{ $json.output }}'}
        :{}
  return {...node,data:{...node.data,...changes}}
}

function currentNodeOutput(node,json) {
  const type=node.type
  const operation=node.data.operation||(type==='googleDrive'?'list':'publish')
  if (type==='aiAgent'||type==='aiVision') return {...json,prompt:json.output}
  if (type==='apiRequest') return {...json,output:json.responseBody}
  if (type==='splitOut') return {...json,output:workflowInput(json)}
  if (type==='httpRequest'||type==='searchContent'&&json.researchMode==='url') return {...json,output:json.content}
  const fields={
    searchContent:['query','queries','followUpQueries','pages','sources','sourceCount','readCount','coverage','note'],
    mediaFile:['referenceMedia','referenceCount','imagePreviewUrl','imageUrl','videoPreviewUrl','videoUrl','prompt'],
    imageGenerate:['imageUrl','imagePreviewUrl','imageMime','imageModel','imagePrompt'],
    imageEdit:['imageUrl','imagePreviewUrl','imageMime','imageModel','imagePrompt','editMode','editedWidth','editedHeight'],
    notify:['notificationStatus','notificationChannel','notificationMessage'],
    googleDrive:operation==='list'?['driveFiles','driveHasMore','driveAccount']:['driveFile','driveDownloadUrl','driveSelection',...(['shared','download'].includes(operation)&&['image/jpeg','image/png'].includes(json.driveFile?.mimeType)?['imageUrl','imagePreviewUrl','imageMime']:[]),...(['shared','download'].includes(operation)&&['video/mp4','video/quicktime'].includes(json.driveFile?.mimeType)?['videoUrl','videoPreviewUrl','videoMime']:[])],
    instagram:{list:['instagramPosts'],inspect:['instagramPost'],comments:['instagramComments'],insights:['instagramInsights']}[operation]||['instagramStatus','instagramMediaId','instagramImageCount','instagramMediaType'],
  }[type]
  return fields?{...json,output:Object.fromEntries(fields.filter(key=>Object.hasOwn(json,key)).map(key=>[key,json[key]]))}:json
}

function findBalancedJsonEnd(text, start) {
  const stack = []
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']')
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return -1
      if (!stack.length) return i
    }
  }
  return -1
}

function extractJsonValue(raw) {
  if (typeof raw !== 'string') return raw
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = fenced ? fenced[1].trim() : trimmed
  try { return JSON.parse(candidate) } catch {}
  const objStart = candidate.indexOf('{')
  const arrStart = candidate.indexOf('[')
  const start = objStart >= 0 && arrStart >= 0 ? Math.min(objStart, arrStart) : Math.max(objStart, arrStart)
  if (start >= 0) {
    const end = findBalancedJsonEnd(candidate, start)
    if (end > start) {
      try { return JSON.parse(candidate.slice(start, end + 1)) } catch {}
    }
  }
  throw new Error('Teks input bukan JSON yang valid.')
}

function evaluateCondition(value, operator, expected) {
  if (operator === 'exists') return value !== undefined && value !== null
  if (operator === 'isEmpty') return value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0)
  if (operator === 'equals') return String(value) === String(expected)
  if (operator === 'notEquals') return String(value) !== String(expected)
  if (operator === 'contains') return String(value).includes(String(expected))
  if (operator === 'notContains') return !String(value).includes(String(expected))
  if (operator === 'startsWith') return String(value).startsWith(String(expected))
  if (operator === 'gt' || operator === 'lt') {
    const left = typeof value === 'number' ? value : (typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN)
    const right = typeof expected === 'number' ? expected : (typeof expected === 'string' && expected.trim() !== '' ? Number(expected) : NaN)
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false
    return operator === 'gt' ? left > right : left < right
  }
  throw new Error('Operator kondisi tidak didukung.')
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
    if (!nodes.some(n => allowed.has(n.id) && isStartNode(n, edges) && !n.data.disabled)) throw new Error('Hubungkan node tujuan ke trigger atau File / Media Referensi yang aktif sebelum Execute step.')
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
    const node = workflowInputNode(nodes.find(n => n.id === id))
    if(isSubNode(node.type))continue
    const data = node.data
    const start = Date.now()
    let input = edges.filter(e => e.target === id).flatMap(e => {
      const parent = nodeResults[e.source]
      if (!parent) return []
      return parent.branches ? parent.branches[e.sourceHandle] || [] : parent.output
    })
    const result = { nodeId: id, label: data.label || node.type, status: 'success', input, output: [], durationMs: 0 }
    nodeResults[id] = result
    onProgress({phase:'start',nodeId:id,label:result.label})
    try {
      if(!failed&&!blocked.has(id)&&!data.disabled&&data.pinnedOutput==null&&!isStartNode(node,edges)) {
        input=workflowNodeInput(node,edges,nodeResults)
        result.input=input
      }
      if (input.length > 1000) throw new Error('Input gabungan melebihi batas 1000 item per node.')
      if (failed || blocked.has(id) || (!isStartNode(node, edges) && input.length === 0)) { result.status = 'skipped'; result.message = blocked.has(id) ? 'Menunggu persetujuan manual.' : failed ? 'Dilewati karena eksekusi sebelumnya gagal.' : 'Tidak ada item masuk pada cabang ini.' }
      else if (data.disabled) { result.status = 'skipped'; result.output = input; result.message = 'Node dinonaktifkan; input diteruskan.'; if(node.type === 'if') result.branches = {true:input,false:[]}; if(node.type === 'switch') result.branches = {case1:input,case2:[],case3:[],fallback:[]} }
      else if (data.pinnedOutput !== undefined && data.pinnedOutput !== null) { result.output = parseItems(data.pinnedOutput); result.status = 'pinned'; result.message = 'Menggunakan data pin untuk pengujian.'; if(node.type === 'if') throw new Error('Pin pada IF belum didukung. Pin data pada node sebelum IF.'); if(node.type === 'switch') throw new Error('Pin pada Switch belum didukung. Pin data pada node sebelum Switch.') }
      else if (node.type === 'mediaFile') {
        const rawFiles = Array.isArray(data.files) ? data.files : []
        const files = rawFiles
          .filter(file => object(file) && typeof file.previewUrl === 'string' && /^\/api\/workflow-media\/[a-f0-9]{48}$/i.test(file.previewUrl))
          .slice(0, 10)
          .map(file => ({
            previewUrl: file.previewUrl,
            url: typeof file.url === 'string' && file.url ? file.url : file.previewUrl,
            mediaType: file.mediaType === 'video' || String(file.mimeType || '').startsWith('video/') ? 'video' : 'image',
            mimeType: typeof file.mimeType === 'string' && file.mimeType ? file.mimeType : (file.mediaType === 'video' ? 'video/mp4' : 'image/jpeg'),
            fileName: typeof file.fileName === 'string' ? file.fileName.slice(0, 120) : '',
            category: typeof file.category === 'string' && file.category ? file.category : ((file.mediaType === 'video' || String(file.mimeType || '').startsWith('video/')) ? 'motion' : 'subject'),
          }))
        if (!files.length) throw new Error('Unggah minimal 1 foto atau video referensi pada node File / Media Referensi.')
        const firstImage = files.find(file => file.mediaType === 'image')
        const firstVideo = files.find(file => file.mediaType === 'video')
        const nodePrompt = String(data.prompt || '').trim()
        if (nodePrompt.length > 20000) throw new Error('Prompt referensi maksimal 20.000 karakter.')
        const mediaFields = {
          referenceMedia: files,
          referenceCount: files.length,
          ...(firstImage ? { imagePreviewUrl: firstImage.previewUrl, imageUrl: firstImage.url, imageMime: firstImage.mimeType } : {}),
          ...(firstVideo ? { videoPreviewUrl: firstVideo.previewUrl, videoUrl: firstVideo.url, videoMime: firstVideo.mimeType } : {}),
        }
        result.output = input.length
          ? input.map(item => ({ json: { ...item.json, ...mediaFields, ...(nodePrompt ? { prompt: nodePrompt } : {}) } }))
          : [{ json: { ...mediaFields, ...(nodePrompt ? { prompt: nodePrompt } : {}) } }]
        result.message = `Menyiapkan ${files.length} file referensi media.`
      }
      else if (node.type === 'trigger') result.output = parseItems(data.sampleData, [{ json: { triggeredAt: new Date().toISOString() } }])
      else if (node.type === 'webhookTrigger') result.output = parseItems(data.webhookPayload ?? data.sampleData, [{ json: { triggeredAt: new Date().toISOString() } }])
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
      else if (node.type === 'searchContent' || node.type === 'httpRequest' || node.type === 'apiRequest' || node.type === 'googleDrive') {
        if (!live) throw new Error('Langkah internet hanya dapat diuji lewat backend.')
        const kind = node.type==='googleDrive'?'googleDrive':node.type==='searchContent'?'research':node.type==='apiRequest'?'apiRequest':'external'
        const response = yield {kind,node,input}
        if (response.error) throw new Error(response.error)
        result.output = response.output
        usedLive = true
        result.message = node.type === 'searchContent' ? 'Informasi dan isi sumber berhasil diambil; gunakan hanya halaman yang berhasil dibaca.' : node.type==='googleDrive'?'File Google Drive berhasil dibaca.':node.type==='apiRequest'?'Permintaan HTTP selesai; lihat status dan respons di Output.':'Respons halaman/API berhasil diambil.'
      }
      else if (node.type === 'imageGenerate' || node.type === 'imageEdit' || node.type === 'videoGenerate' || node.type === 'aiVision' || node.type === 'instagram' || node.type === 'notify') {
        if (!live) throw new Error('Langkah ini hanya dapat diuji lewat backend.')
        if (node.type === 'instagram' && ['publish', 'reels', 'stories'].includes(data.operation || 'publish')) {
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
        result.message = node.type === 'imageGenerate' ? (data.provider === 'googleFlow' ? 'Gambar dibuat lewat Google Flow; periksa hasil sebelum langkah berikutnya.' : 'Gambar dibuat dengan model 9router; periksa hasil sebelum publikasi.')
          : node.type === 'imageEdit' ? 'Gambar selesai diolah; periksa hasil sebelum langkah berikutnya.'
          : node.type === 'videoGenerate' ? 'Video selesai dibuat lewat Google Flow; periksa pratinjau sebelum langkah berikutnya.'
          : node.type === 'aiVision' ? 'Gambar selesai dianalisis oleh AI Vision.'
          : node.type === 'notify' ? 'Notifikasi berhasil dikirim.'
          : 'Operasi Instagram selesai; lihat ID dan status post pada hasil.'
      }
      else if (node.type === 'wait') {
        const seconds = Number(data.durationSeconds ?? 5)
        if (!Number.isFinite(seconds) || seconds < 0.1 || seconds > 300) throw new Error('Durasi tunda harus antara 0,1 dan 300 detik.')
        if (live) {
          const response = yield {kind:'wait',node,input,durationMs:Math.round(seconds*1000)}
          if (response.error) throw new Error(response.error)
          result.output = response.output ?? input
          usedLive = true
          result.message = `Menunggu ${seconds} detik selesai.`
        } else {
          result.output = input
          result.message = `Pratinjau tunda ${seconds} detik dilewati.`
        }
      }
      else if (node.type === 'merge') {
        const mode = String(data.mode || 'combineByPosition')
        if (!['combineByPosition', 'append', 'aggregate'].includes(mode)) throw new Error('Mode penggabungan tidak didukung.')
        const incomingEdges = edges.filter(e => e.target === id)
        const branchArrays = incomingEdges.map(e => {
          const parent = nodeResults[e.source]
          if (!parent) return []
          return parent.branches ? parent.branches[e.sourceHandle] || [] : parent.output
        }).filter(arr => arr.length > 0)
        if (!branchArrays.length) {
          result.output = []
        } else if (mode === 'append') {
          result.output = branchArrays.flat()
          result.message = `Menggabungkan ${result.output.length} item secara berurutan.`
        } else if (mode === 'aggregate') {
          const rawField = String(data.aggregateField || 'items').trim() || 'items'
          const field = ['__proto__', 'constructor', 'prototype'].includes(rawField) ? 'items' : rawField
          const rawItems = branchArrays.flat().map(item => item.json)
          const imageUrls = rawItems.map(j => j.imageUrl).filter(u => typeof u === 'string' && u)
          const outputs = rawItems.map(j => workflowInput(j)).filter(v => v !== undefined)
          result.output = [{ json: { [field]: rawItems, count: rawItems.length, ...(imageUrls.length ? { imageUrls } : {}), outputs, output: rawItems } }]
          result.message = `Merangkum ${rawItems.length} item menjadi satu data.`
        } else {
          const maxLen = Math.max(...branchArrays.map(arr => arr.length))
          const mergedItems = []
          for (let i = 0; i < maxLen; i++) {
            const merged = {}
            for (const arr of branchArrays) {
              const entry = arr[i] ?? (arr.length === 1 ? arr[0] : null)
              if (entry && object(entry.json)) {
                for (const [k, v] of Object.entries(entry.json)) {
                  if (v !== undefined && !['__proto__', 'constructor', 'prototype'].includes(k)) merged[k] = v
                }
              }
            }
            mergedItems.push({ json: merged })
          }
          result.output = mergedItems
          result.message = `Menggabungkan data menjadi ${mergedItems.length} item.`
        }
      }
      else if (node.type === 'jsonParse') {
        const parseMode = String(data.parseMode || 'parse')
        if (!['parse', 'splitArray'].includes(parseMode)) throw new Error('Mode Parse JSON tidak didukung.')
        const sourceField = String(data.sourceField || 'output').trim()
        const arrayPath = String(data.arrayPath || '').trim()
        const keepInput = data.keepInput !== false
        const outItems = []
        for (const item of input) {
          const rawVal = sourceField ? getPath(item.json, sourceField) : workflowInput(item.json)
          const parsed = extractJsonValue(rawVal)
          if (parseMode === 'splitArray') {
            const list = arrayPath ? getPath(parsed, arrayPath) : parsed
            if (!Array.isArray(list)) throw new Error('Data hasil parse bukan daftar/array untuk dipecah.')
            if (list.length > 200) throw new Error('Daftar hasil parse maksimal 200 item per input.')
            list.forEach((entry, index) => {
              const base = keepInput ? { ...item.json } : {}
              if (object(entry)) outItems.push({ json: { ...base, ...entry, splitIndex: index + 1 } })
              else outItems.push({ json: { ...base, value: entry, output: entry, splitIndex: index + 1 } })
            })
          } else if (object(parsed)) {
            outItems.push({ json: { ...(keepInput ? item.json : {}), ...parsed, parsedJson: parsed, output: parsed } })
          } else {
            outItems.push({ json: { ...(keepInput ? item.json : {}), items: parsed, parsedJson: parsed, ...(Array.isArray(parsed) ? { count: parsed.length } : {}), output: parsed } })
          }
        }
        if (outItems.length > 1000) throw new Error('Hasil Parse JSON melebihi batas 1000 item.')
        result.output = outItems
        result.message = parseMode === 'splitArray' ? `Memecah JSON menjadi ${outItems.length} item.` : 'JSON berhasil diurai ke field terstruktur.'
      }
      else if (node.type === 'set') {
        const fields = typeof data.fields === 'string' ? JSON.parse(data.fields || '{}') : data.fields || {}
        if (!object(fields)) throw new Error('Fields harus berupa objek JSON.')
        result.output = input.map(item => {
          const updated=resolveValue(fields,item.json)
          const json={...(data.keepInput!==false?item.json:{}),...updated}
          const changed=['output','prompt','content','chatInput','query','topic','input','text'].find(key=>Object.hasOwn(updated,key))
          if(changed){json.output=updated[changed];if(typeof json.output==='string')json.prompt=json.output}
          return {json}
        })
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
        const operator = String(data.operator || 'equals')
        if (!CONDITION_OPERATORS.includes(operator)) throw new Error('Operator IF tidak didukung.')
        for (const item of input) {
          let value
          try { value = getPath(item.json, String(data.field || '')) } catch (error) { if(!['exists', 'isEmpty'].includes(operator)) throw error }
          const expected = ['exists', 'isEmpty'].includes(operator) ? '' : resolveValue(data.value ?? '', item.json)
          const pass = evaluateCondition(value, operator, expected)
          ;(pass ? yes : no).push(item)
        }
        result.branches = { true: yes, false: no }; result.output = [...yes, ...no]
       } else if (node.type === 'switch') {
        if (!String(data.field || '').trim()) throw new Error('Pilih informasi yang ingin diperiksa pada node Switch.')
        const branches = { case1: [], case2: [], case3: [], fallback: [] }
        const rules = [1, 2, 3].map(n => ({
          handle: `case${n}`,
          operator: String(data[`rule${n}Operator`] || ''),
          value: data[`rule${n}Value`] ?? '',
        })).filter(r => r.operator)
        for (const rule of rules) {
          if (!CONDITION_OPERATORS.includes(rule.operator)) throw new Error('Operator Switch tidak didukung.')
        }
        for (const item of input) {
          let value
          let missing = false
          try { value = getPath(item.json, String(data.field || '')) } catch (error) { missing = true; if (rules.every(r => !['exists', 'isEmpty'].includes(r.operator))) throw error }
          let matchedHandle = 'fallback'
          for (const rule of rules) {
            if (missing && !['exists', 'isEmpty'].includes(rule.operator)) continue
            const expected = ['exists', 'isEmpty'].includes(rule.operator) ? '' : resolveValue(rule.value, item.json)
            if (evaluateCondition(value, rule.operator, expected)) { matchedHandle = rule.handle; break }
          }
          branches[matchedHandle].push(item)
        }
        result.branches = branches
        result.output = [...branches.case1, ...branches.case2, ...branches.case3, ...branches.fallback]
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
    if(result.status==='success'&&!data.disabled&&data.pinnedOutput==null&&node.type!=='approval') {
      result.output=result.output.map(item=>({...item,json:currentNodeOutput(node,item.json)}))
    }
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
