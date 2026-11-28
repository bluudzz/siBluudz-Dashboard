import { execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp from 'sharp'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { dataDirectory } from './db.js'
import { resolveWorkflowMediaFilePath, storeWorkflowImage, storeWorkflowVideo } from './workflow-media.js'
import { resolveValue, workflowInput } from '../shared/workflow-engine.js'

const execFileAsync = promisify(execFile)
const DEFAULT_FLOW_CDP_PORT = Number(process.env.GOOGLE_FLOW_CDP_PORT || 9222)
const DEFAULT_FLOW_CDP_URL = `http://127.0.0.1:${DEFAULT_FLOW_CDP_PORT}`

const IN_PROGRESS_STATUSES = new Set([
  'created',
  'configuring',
  'submitted',
  'processing',
  'ready',
  'upscaling',
  'downloading',
])

let sharedClientPromise = null
let sharedClientState = null
let shutdownHooksRegistered = false

function findSystemChromePath() {
  const candidates = [
    process.env.FLOW_MCP_BROWSER_EXECUTABLE,
    process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' ? 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe' : '',
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : '',
    process.platform === 'win32' && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Chromium', 'Application', 'chrome.exe')
      : '',
    process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '',
    process.platform === 'linux' ? '/usr/bin/google-chrome' : '',
    process.platform === 'linux' ? '/usr/bin/chromium' : '',
    process.platform === 'linux' ? '/usr/bin/chromium-browser' : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return ''
}

export function getGoogleFlowPaths() {
  const rootDir = process.env.GOOGLE_FLOW_MCP_DIR || path.join(dataDirectory, 'google-flow-mcp')
  const entryPath = process.env.GOOGLE_FLOW_MCP_ENTRY || path.join(rootDir, 'dist', 'index.js')
  const cliPath = path.join(rootDir, 'dist', 'cli.js')
  const extensionDir = path.join(rootDir, 'extension')
  const outputDir = path.join(dataDirectory, 'google-flow-output')
  const profileDir = process.env.GOOGLE_FLOW_PROFILE_DIR || path.join(dataDirectory, 'google-flow-chrome-profile')
  const chromePath = findSystemChromePath()
  return {
    installed: existsSync(entryPath),
    rootDir,
    entryPath,
    cliPath,
    extensionDir,
    outputDir,
    profileDir,
    cdpUrl: DEFAULT_FLOW_CDP_URL,
    chromePath,
  }
}

async function getCdpVersion(cdpUrl = DEFAULT_FLOW_CDP_URL) {
  try {
    const response = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(1200) })
    if (!response.ok) return null
    return await response.json().catch(() => ({}))
  } catch {
    return null
  }
}

async function isCdpReachable(cdpUrl = DEFAULT_FLOW_CDP_URL) {
  return Boolean(await getCdpVersion(cdpUrl))
}

export async function closePersistentFlowChrome(cdpUrl = DEFAULT_FLOW_CDP_URL) {
  const version = await getCdpVersion(cdpUrl)
  if (!version) return false

  const wsUrl = typeof version.webSocketDebuggerUrl === 'string' ? version.webSocketDebuggerUrl : ''
  if (wsUrl && typeof WebSocket === 'function') {
    await new Promise(resolve => {
      const ws = new WebSocket(wsUrl)
      const finish = () => {
        clearTimeout(timer)
        try { ws.close() } catch { }
        resolve()
      }
      const timer = setTimeout(finish, 2500)
      ws.addEventListener('open', () => {
        try {
          ws.send(JSON.stringify({ id: 1, method: 'Browser.close' }))
        } catch { }
        setTimeout(finish, 250)
      })
      ws.addEventListener('error', finish)
      ws.addEventListener('close', finish)
    })
  }

  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (!(await isCdpReachable(cdpUrl))) return true
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  return !(await isCdpReachable(cdpUrl))
}

export async function ensurePersistentFlowChrome({ openFlowUrl = true, headless = false } = {}) {
  const paths = getGoogleFlowPaths()
  if (!paths.chromePath) {
    throw new Error('Google Chrome tidak ditemukan di komputer ini.')
  }
  await mkdir(paths.profileDir, { recursive: true })

  const existing = await getCdpVersion(paths.cdpUrl)
  if (existing) {
    const runningHeadless = typeof existing.Browser === 'string' && /headless/i.test(existing.Browser)
    if (!headless && runningHeadless) {
      await closePersistentFlowChrome(paths.cdpUrl)
    } else {
      return {
        started: false,
        alreadyRunning: true,
        headless: runningHeadless,
        cdpUrl: paths.cdpUrl,
        profileDir: paths.profileDir,
      }
    }
  }

  // Launch regular Chrome with a dedicated user-data-dir (no --enable-automation)
  // so Google keeps the signed-in session persistently across restarts.
  // Background automation runs use --headless=new so no browser window pops up.
  const child = spawn(
    paths.chromePath,
    [
      `--remote-debugging-port=${DEFAULT_FLOW_CDP_PORT}`,
      `--user-data-dir=${paths.profileDir}`,
      '--profile-directory=Default',
      '--no-first-run',
      '--no-default-browser-check',
      ...(headless ? ['--headless=new', '--window-size=1440,900'] : []),
      ...(openFlowUrl && !headless ? ['https://flow.google.com/'] : []),
    ],
    { detached: true, stdio: 'ignore', windowsHide: headless },
  )
  child.unref()

  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    if (await isCdpReachable(paths.cdpUrl)) {
      return {
        started: true,
        alreadyRunning: false,
        headless,
        cdpUrl: paths.cdpUrl,
        profileDir: paths.profileDir,
      }
    }
    await new Promise(resolve => setTimeout(resolve, 300))
  }

  throw new Error(
    `Chrome gagal membuka port koneksi lokal (${DEFAULT_FLOW_CDP_PORT}). Jika ada jendela Chrome profil Flow yang terbuka sebelumnya, tutup dulu lalu coba lagi.`,
  )
}

export async function savePersistentBrowserAccount({ accountId = 'personal', label = 'Google Flow Pro' } = {}) {
  const paths = getGoogleFlowPaths()
  if (!paths.installed || !existsSync(paths.cliPath)) {
    throw new Error('Google Flow MCP belum terpasang di komputer ini.')
  }
  if (!(await isCdpReachable(paths.cdpUrl))) {
    await ensurePersistentFlowChrome({ openFlowUrl: true, headless: false })
  }

  const cleanId = String(accountId || 'personal').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40) || 'personal'
  const cleanLabel = String(label || 'Google Flow Pro').trim().slice(0, 80) || 'Google Flow Pro'

  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [paths.cliPath, 'account', 'connect', cleanId, cleanLabel, '--cdp', paths.cdpUrl, '--wait', '20'],
      {
        timeout: 60_000,
        env: {
          ...process.env,
          ...(paths.chromePath ? { FLOW_MCP_BROWSER_EXECUTABLE: paths.chromePath } : {}),
        },
      },
    )
    await closeGoogleFlowClient()
    // Gracefully close the login window so cookies flush to disk and future runs execute invisibly.
    const closedLoginWindow = await closePersistentFlowChrome(paths.cdpUrl)
    return {
      accountId: cleanId,
      label: cleanLabel,
      cdpUrl: paths.cdpUrl,
      profileDir: paths.profileDir,
      closedLoginWindow,
      output: String(stdout || '').trim(),
    }
  } catch (error) {
    const stderr = typeof error?.stderr === 'string' ? error.stderr.trim() : ''
    const message = stderr || (error instanceof Error ? error.message : 'Gagal menyimpan akun Chrome Google Flow.')
    throw new Error(message)
  }
}

export async function closeGoogleFlowClient() {
  const current = sharedClientState
  sharedClientState = null
  sharedClientPromise = null
  if (!current) return
  try { await current.client.close() } catch { }
  try { await current.transport.close() } catch { }
}

function registerShutdownHooks() {
  if (shutdownHooksRegistered) return
  shutdownHooksRegistered = true
  process.once('SIGINT', () => { void closeGoogleFlowClient() })
  process.once('SIGTERM', () => { void closeGoogleFlowClient() })
}

async function getFlowClient() {
  if (sharedClientState) return sharedClientState.client
  if (sharedClientPromise) return sharedClientPromise

  const paths = getGoogleFlowPaths()
  if (!paths.installed) {
    throw new Error('Google Flow MCP belum terpasang di komputer ini (dist/index.js tidak ditemukan).')
  }

  registerShutdownHooks()
  sharedClientPromise = (async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [paths.entryPath],
      env: {
        ...process.env,
        FLOW_MCP_HEADLESS: process.env.FLOW_MCP_HEADLESS ?? '0',
        ...(paths.chromePath ? { FLOW_MCP_BROWSER_EXECUTABLE: paths.chromePath } : {}),
      },
      stderr: 'pipe',
    })

    const client = new Client({ name: 'sibluudz-workflow', version: '1.0.0' })
    transport.onclose = () => {
      if (sharedClientState?.transport === transport) {
        sharedClientState = null
        sharedClientPromise = null
      }
    }
    transport.onerror = () => {
      if (sharedClientState?.transport === transport) {
        sharedClientState = null
        sharedClientPromise = null
      }
    }

    try {
      await client.connect(transport)
      sharedClientState = { client, transport }
      return client
    } catch (error) {
      sharedClientState = null
      sharedClientPromise = null
      try { await transport.close() } catch { }
      throw error
    }
  })()

  return sharedClientPromise
}

export async function callFlowTool(name, args = {}, { timeoutMs = 120_000, signal } = {}) {
  const client = await getFlowClient()
  const requestOptions = signal ? { timeout: timeoutMs, signal } : { timeout: timeoutMs }
  const result = await client.callTool({ name, arguments: args }, requestOptions)
  const text = (Array.isArray(result?.content) ? result.content : [])
    .filter(part => part?.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('\n')
    .trim()

  let parsed = null
  if (text) {
    try { parsed = JSON.parse(text) } catch { }
  }
  if (result?.isError) {
    const message = parsed?.error || parsed?.message || text || `Tool Google Flow "${name}" gagal.`
    throw new Error(String(message))
  }
  return parsed ?? { text }
}

export async function getGoogleFlowStatus() {
  const paths = getGoogleFlowPaths()
  const chromeRunning = await isCdpReachable(paths.cdpUrl)
  if (!paths.installed) {
    return {
      ...paths,
      chromeRunning,
      accounts: [],
      defaultAccountId: '',
      bridgeError: '',
    }
  }
  try {
    const data = await callFlowTool('flow_list_accounts', {}, { timeoutMs: 30_000 })
    const accounts = Array.isArray(data?.accounts) ? data.accounts : []
    return {
      ...paths,
      chromeRunning,
      accounts,
      defaultAccountId: typeof data?.defaultAccountId === 'string' ? data.defaultAccountId : '',
      bridgeError: '',
    }
  } catch (error) {
    return {
      ...paths,
      chromeRunning,
      accounts: [],
      defaultAccountId: '',
      bridgeError: error instanceof Error ? error.message : 'Gagal menghubungi Google Flow MCP.',
    }
  }
}

async function ensureChromeIfCdpAccount(accountId = '') {
  const status = await getGoogleFlowStatus()
  if (!status.installed || status.chromeRunning) return
  const accounts = status.accounts || []
  const target = (accountId && accounts.find(a => a.id === accountId))
    || (status.defaultAccountId && accounts.find(a => a.id === status.defaultAccountId))
    || accounts.find(a => a.connectionStatus === 'connected')
    || accounts[0]
  if (target?.browserMode === 'attach_cdp' && target.cdpUrl === status.cdpUrl) {
    const headless = process.env.GOOGLE_FLOW_VISIBLE !== '1'
    await ensurePersistentFlowChrome({ openFlowUrl: false, headless })
  }
}

export async function inspectGoogleFlowAccount(accountId = '') {
  const id = String(accountId || '').trim()
  await ensureChromeIfCdpAccount(id)
  return callFlowTool('flow_inspect_account', id ? { accountId: id } : {}, { timeoutMs: 90_000 })
}

export async function beginGoogleFlowConnection({ accountId = '', label = '' } = {}) {
  const args = {
    ...(String(accountId || '').trim() ? { accountId: String(accountId).trim() } : {}),
    ...(String(label || '').trim() ? { label: String(label).trim() } : {}),
  }
  return callFlowTool('flow_begin_account_connection', args, { timeoutMs: 30_000 })
}

export async function completeGoogleFlowConnection({ connectionId, accountId = '', label = '' }) {
  const cleanId = String(connectionId || '').trim()
  if (!cleanId) throw new Error('Token connectionId wajib disertakan.')
  const args = {
    connectionId: cleanId,
    userConfirmedSessionSent: true,
    chooseGoogleAccount: true,
    waitForAccountSelectionSeconds: 300,
    ...(String(accountId || '').trim() ? { accountId: String(accountId).trim() } : {}),
    ...(String(label || '').trim() ? { label: String(label).trim() } : {}),
  }
  return callFlowTool('flow_complete_account_connection', args, { timeoutMs: 360_000 })
}

const REFERENCE_CATEGORY_GUIDES = {
  subject: 'Karakter / Subjek utama (pertahankan wajah, postur, pakaian, dan identitas subjek pada file ini)',
  product: 'Produk / Objek utama (tampilkan bentuk, warna, label, dan detail produk sesuai foto ini)',
  startFrame: 'Frame Awal video (mulai adegan dari komposisi dan subjek pada gambar ini)',
  endFrame: 'Frame Akhir video (arahkan akhir adegan menuju tampilan ini)',
  style: 'Referensi Gaya & Pencahayaan (ikuti tone warna, mood, pencahayaan, dan estetika visualnya)',
  background: 'Referensi Latar / Lokasi (gunakan lingkungan, arsitektur, atau suasana tempat ini)',
  motion: 'Referensi Gerakan / Kamera (ikuti alur gerakan subjek dan pergerakan kameranya)',
  general: 'Bahan referensi visual pendukung',
}

function mergeParallelReferenceInputs(input, node, mediaKind) {
  if (!Array.isArray(input) || input.length <= 1) return input
  const hasExplicitPrompt = typeof node.data.prompt === 'string' && Boolean(node.data.prompt.trim())
  const isPromptCarrier = item => {
    const j = item?.json || {}
    const latest = workflowInput(j)
    const autoPrompt = latest && typeof latest === 'object'
      ? (mediaKind === 'video' ? (latest.videoPrompt ?? latest.prompt) : (latest.imagePrompt ?? latest.prompt))
      : latest
    return typeof autoPrompt === 'string' && Boolean(autoPrompt.trim())
  }
  const hasRefMedia = item => {
    const j = item?.json || {}
    return Boolean(
      (Array.isArray(j.referenceMedia) && j.referenceMedia.length)
      || j.imagePreviewUrl || j.imageUrl || j.videoPreviewUrl || j.videoUrl,
    )
  }

  const promptItems = input.filter(isPromptCarrier)
  const refOnlyItems = input.filter(item => !isPromptCarrier(item) && hasRefMedia(item))
  if (!refOnlyItems.length) return input

  const combinedRefs = []
  let firstImage = null
  let firstVideo = null
  for (const refItem of refOnlyItems) {
    const j = refItem.json || {}
    if (Array.isArray(j.referenceMedia)) {
      combinedRefs.push(...j.referenceMedia)
    } else {
      if (j.imagePreviewUrl || j.imageUrl) {
        combinedRefs.push({
          previewUrl: j.imagePreviewUrl || j.imageUrl,
          url: j.imageUrl || j.imagePreviewUrl,
          mediaType: 'image',
          fileName: j.fileName || '',
          category: j.category || 'subject',
        })
      }
      if (j.videoPreviewUrl || j.videoUrl) {
        combinedRefs.push({
          previewUrl: j.videoPreviewUrl || j.videoUrl,
          url: j.videoUrl || j.videoPreviewUrl,
          mediaType: 'video',
          fileName: j.fileName || '',
          category: j.category || 'motion',
        })
      }
    }
    if (!firstImage && (j.imagePreviewUrl || j.imageUrl)) {
      firstImage = { imagePreviewUrl: j.imagePreviewUrl || j.imageUrl, imageUrl: j.imageUrl || j.imagePreviewUrl }
    }
    if (!firstVideo && (j.videoPreviewUrl || j.videoUrl)) {
      firstVideo = { videoPreviewUrl: j.videoPreviewUrl || j.videoUrl, videoUrl: j.videoUrl || j.videoPreviewUrl }
    }
  }

  if (promptItems.length > 0) {
    return promptItems.map(item => ({
      json: {
        ...item.json,
        ...(firstImage && !item.json.imagePreviewUrl ? firstImage : {}),
        ...(firstVideo && !item.json.videoPreviewUrl ? firstVideo : {}),
        referenceMedia: [
          ...(Array.isArray(item.json.referenceMedia) ? item.json.referenceMedia : []),
          ...combinedRefs,
        ],
      },
    }))
  }

  if (hasExplicitPrompt) {
    return [{
      json: {
        ...(firstImage || {}),
        ...(firstVideo || {}),
        referenceMedia: combinedRefs,
      },
    }]
  }

  return input
}

function resolveReferenceFiles({ node, item, userId, useInputImage, resolveMediaPath }) {
  const seen = new Set()
  const files = []
  const descriptors = []
  const addFile = (filePath, meta = {}) => {
    if (!filePath || seen.has(filePath) || files.length >= 10) return
    seen.add(filePath)
    files.push(filePath)
    const mediaType = meta.mediaType === 'video' ? 'video' : 'image'
    descriptors.push({
      fileName: meta.fileName || path.basename(filePath),
      mediaType,
      category: meta.category || (mediaType === 'video' ? 'motion' : 'subject'),
    })
  }
  const addMediaRef = (rawUrl, meta = {}) => {
    if (typeof rawUrl !== 'string' || !rawUrl.trim()) return
    const localMedia = resolveMediaPath(userId, rawUrl)
    if (localMedia?.filePath && existsSync(localMedia.filePath)) {
      addFile(localMedia.filePath, {
        ...meta,
        mediaType: meta.mediaType || (String(localMedia.mimeType || '').startsWith('video/') ? 'video' : 'image'),
      })
    }
  }

  if (Array.isArray(node.data.referenceFiles)) {
    for (const entry of node.data.referenceFiles) {
      addMediaRef(entry?.previewUrl || entry?.url, entry)
    }
  }

  const rawRefPath = typeof node.data.referenceImagePath === 'string' ? node.data.referenceImagePath.trim() : ''
  if (rawRefPath) {
    const resolvedPath = String(resolveValue(rawRefPath, item.json) || '').trim()
    if (!path.isAbsolute(resolvedPath) || !existsSync(resolvedPath)) {
      throw new Error(`File referensi media tidak ditemukan: ${resolvedPath || rawRefPath}`)
    }
    addFile(resolvedPath, {
      fileName: path.basename(resolvedPath),
      mediaType: /\.(mp4|mov)$/i.test(resolvedPath) ? 'video' : 'image',
    })
  }

  if (Array.isArray(item.json.referenceMedia)) {
    for (const entry of item.json.referenceMedia) {
      addMediaRef(entry?.previewUrl || entry?.url, entry)
    }
  }

  if (useInputImage) {
    addMediaRef(item.json.imagePreviewUrl || item.json.imageUrl, { mediaType: 'image', category: 'startFrame' })
    addMediaRef(item.json.videoPreviewUrl || item.json.videoUrl, { mediaType: 'video', category: 'motion' })
  }

  return { files, descriptors }
}

function applyReferenceInstructions(prompt, descriptors) {
  if (!Array.isArray(descriptors) || !descriptors.length) return prompt
  const lines = descriptors.map((ref, idx) => {
    const guide = REFERENCE_CATEGORY_GUIDES[ref.category] || REFERENCE_CATEGORY_GUIDES.general
    return `- Lampiran #${idx + 1} (${ref.fileName}): ${guide}`
  })
  return `[Gunakan file referensi terlampir sesuai kategori berikut:\n${lines.join('\n')}]\n\n${prompt}`
}

async function runFlowGenerationJob({
  toolName,
  prompt,
  accountId,
  model,
  aspectRatio,
  outputs = 1,
  reasoningLevel = 'ui-default',
  upscale,
  referenceFiles,
  targetOutputDir,
  flowProject,
  timeoutSeconds,
  callTool,
  signal,
}) {
  let job = await callTool(
    toolName,
    {
      ...(accountId ? { accountId } : {}),
      prompt,
      model,
      aspectRatio,
      outputs,
      ...(toolName === 'flow_generate_image' && reasoningLevel && reasoningLevel !== 'ui-default'
        ? { reasoningLevel }
        : {}),
      referenceFiles,
      ...(toolName === 'flow_generate_video' ? { upscale } : {}),
      outputDirectory: targetOutputDir,
      ...(flowProject ? { flowProject } : {}),
      download: true,
      timeoutSeconds,
      confirmCreditSpend: true,
    },
    { timeoutMs: (timeoutSeconds + 60) * 1000, signal },
  )

  const deadline = Date.now() + timeoutSeconds * 1000
  while (job?.id && IN_PROGRESS_STATUSES.has(job.status) && Date.now() < deadline) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
    }
    job = await callTool(
      'flow_job_status',
      { jobId: job.id, waitSeconds: 15 },
      { timeoutMs: 45_000, signal },
    )
  }

  if (job?.status === 'failed' || job?.status === 'needs_attention') {
    throw new Error(job.error || 'Google Flow menghentikan proses (periksa jendela Chrome atau status akun Flow Anda).')
  }
  if (job?.status !== 'completed') {
    throw new Error(`Proses Google Flow melewati batas waktu${job?.id ? ` (Job ID: ${job.id})` : ''}.`)
  }

  if ((!Array.isArray(job.downloadedFiles) || !job.downloadedFiles.length) && job.id) {
    job = await callTool('flow_download_job', { jobId: job.id }, { timeoutMs: 120_000, signal })
  }

  const downloadedFiles = (Array.isArray(job?.downloadedFiles) ? job.downloadedFiles : [])
    .filter(filePath => typeof filePath === 'string' && existsSync(filePath))
  if (!downloadedFiles.length) {
    throw new Error('Google Flow selesai, tetapi file media lokal tidak ditemukan.')
  }
  return { job, downloadedFiles }
}

function resolveFlowPrompt(node, item, mediaKind) {
  const latest = workflowInput(item.json)
  const automaticPrompt = latest && typeof latest === 'object'
    ? (mediaKind === 'video' ? (latest.videoPrompt ?? latest.prompt) : (latest.imagePrompt ?? latest.prompt))
    : latest
  const selected = node.data.prompt?.trim()
    ? resolveValue(node.data.prompt, item.json)
    : automaticPrompt
  if (typeof selected !== 'string') {
    throw new Error(`Hasil langkah sebelumnya bukan prompt teks. Isi Prompt ${mediaKind === 'video' ? 'video' : 'gambar'} atau sambungkan prompt dari langkah sebelumnya.`)
  }
  const prompt = selected.trim()
  if (!prompt || prompt.length > 20_000) {
    throw new Error(`Prompt ${mediaKind === 'video' ? 'video' : 'gambar'} wajib diisi (3–20.000 karakter).`)
  }
  if (prompt.length < 3) {
    throw new Error(`Prompt ${mediaKind === 'video' ? 'video' : 'gambar'} minimal 3 karakter.`)
  }
  return prompt
}

async function normalizeToStorableImageBuffer(rawBuffer) {
  const isJpeg = rawBuffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
  const isPng = rawBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (isJpeg) return { buffer: rawBuffer, mimeHint: 'image/jpeg' }
  if (isPng) return { buffer: rawBuffer, mimeHint: 'image/png' }
  try {
    const converted = await sharp(rawBuffer, { limitInputPixels: 25_000_000 })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 92 })
      .toBuffer()
    return { buffer: converted, mimeHint: 'image/jpeg' }
  } catch {
    throw new Error('File gambar dari Google Flow tidak dapat dikonversi menjadi JPEG/PNG.')
  }
}

export async function runVideoNode(
  { node, input },
  user,
  {
    callTool = callFlowTool,
    storeVideo = storeWorkflowVideo,
    resolveMediaPath = resolveWorkflowMediaFilePath,
    outputDirectory,
    signal,
  } = {},
) {
  if (input.length > 5) {
    throw new Error('Generate Video menerima maksimal 5 item per pengujian.')
  }

  const targetOutputDir = outputDirectory || getGoogleFlowPaths().outputDir
  await mkdir(targetOutputDir, { recursive: true })

  const accountId = String(node.data.accountId || '').trim()
  if (callTool === callFlowTool) {
    await ensureChromeIfCdpAccount(accountId)
  }
  const model = String(node.data.model || 'ui-default').trim() || 'ui-default'
  const aspectRatio = String(node.data.aspectRatio || 'ui-default').trim() || 'ui-default'
  const outputs = Math.min(4, Math.max(1, Math.round(Number(node.data.outputs) || 1)))
  const upscale = String(node.data.upscale || 'none').trim() || 'none'
  const flowProject = String(node.data.flowProject || '').trim()
  const useInputImage = node.data.useInputImage !== false
  const timeoutSeconds = Math.min(900, Math.max(60, Math.round(Number(node.data.timeoutSeconds) || 480)))

  const normalizedInput = mergeParallelReferenceInputs(input, node, 'video')
  const output = []
  for (const item of normalizedInput) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
    }
    const basePrompt = resolveFlowPrompt(node, item, 'video')
    const { files: referenceFiles, descriptors } = resolveReferenceFiles({ node, item, userId: user.id, useInputImage, resolveMediaPath })
    const prompt = applyReferenceInstructions(basePrompt, descriptors)
    const { job, downloadedFiles } = await runFlowGenerationJob({
      toolName: 'flow_generate_video',
      prompt,
      accountId,
      model,
      aspectRatio,
      outputs,
      upscale,
      referenceFiles,
      targetOutputDir,
      flowProject,
      timeoutSeconds,
      callTool,
      signal,
    })

    for (let idx = 0; idx < downloadedFiles.length; idx += 1) {
      const downloadedFile = downloadedFiles[idx]
      const buffer = await readFile(downloadedFile)
      const mimeType = /\.mov$/i.test(downloadedFile) ? 'video/quicktime' : 'video/mp4'
      const stored = await storeVideo(user.id, buffer, mimeType)
      const probe = Array.isArray(job.mediaProbe) ? job.mediaProbe[idx] || job.mediaProbe[0] : null

      output.push({
        json: {
          ...item.json,
          prompt,
          videoPrompt: prompt,
          videoUrl: stored.videoUrl || stored.previewUrl,
          videoPreviewUrl: stored.previewUrl,
          videoMime: stored.mimeType,
          videoModel: job.model || model,
          videoAspectRatio: job.aspectRatio || aspectRatio,
          videoJobId: job.id || '',
          localVideoPath: downloadedFile,
          outputIndex: idx + 1,
          outputCount: downloadedFiles.length,
          ...(typeof probe?.durationSeconds === 'number' ? { videoDurationSeconds: probe.durationSeconds } : {}),
          ...(probe?.width && probe?.height ? { videoResolution: `${probe.width}x${probe.height}` } : {}),
        },
      })
    }
  }

  return output
}

export async function runFlowImageNode(
  { node, input },
  user,
  {
    callTool = callFlowTool,
    storeImage = storeWorkflowImage,
    resolveMediaPath = resolveWorkflowMediaFilePath,
    outputDirectory,
    signal,
  } = {},
) {
  if (input.length > 10) {
    throw new Error('Generate Gambar menerima maksimal 10 item per pengujian.')
  }

  const targetOutputDir = outputDirectory || getGoogleFlowPaths().outputDir
  await mkdir(targetOutputDir, { recursive: true })

  const accountId = String(node.data.accountId || '').trim()
  if (callTool === callFlowTool) {
    await ensureChromeIfCdpAccount(accountId)
  }
  const model = String(node.data.model || 'ui-default').trim() || 'ui-default'
  const aspectRatio = String(node.data.aspectRatio || 'ui-default').trim() || 'ui-default'
  const outputs = Math.min(4, Math.max(1, Math.round(Number(node.data.outputs) || 1)))
  const rawReasoning = String(node.data.reasoningLevel || 'ui-default').trim()
  const reasoningLevel = ['ui-default', 'low', 'medium', 'high'].includes(rawReasoning) ? rawReasoning : 'ui-default'
  const flowProject = String(node.data.flowProject || '').trim()
  const useInputImage = Boolean(node.data.useInputImage)
  const timeoutSeconds = Math.min(900, Math.max(60, Math.round(Number(node.data.timeoutSeconds) || 300)))

  const normalizedInput = mergeParallelReferenceInputs(input, node, 'image')
  const output = []
  for (const item of normalizedInput) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
    }
    const basePrompt = resolveFlowPrompt(node, item, 'image')
    const { files: referenceFiles, descriptors } = resolveReferenceFiles({ node, item, userId: user.id, useInputImage, resolveMediaPath })
    const prompt = applyReferenceInstructions(basePrompt, descriptors)
    const { job, downloadedFiles } = await runFlowGenerationJob({
      toolName: 'flow_generate_image',
      prompt,
      accountId,
      model,
      aspectRatio,
      outputs,
      reasoningLevel,
      upscale: 'none',
      referenceFiles,
      targetOutputDir,
      flowProject,
      timeoutSeconds,
      callTool,
      signal,
    })

    for (let idx = 0; idx < downloadedFiles.length; idx += 1) {
      const downloadedFile = downloadedFiles[idx]
      const rawBuffer = await readFile(downloadedFile)
      const { buffer, mimeHint } = await normalizeToStorableImageBuffer(rawBuffer)
      const stored = await storeImage(user.id, buffer.toString('base64'), mimeHint)

      output.push({
        json: {
          ...item.json,
          prompt,
          imagePrompt: prompt,
          imageUrl: stored.imageUrl || stored.previewUrl,
          imagePreviewUrl: stored.previewUrl,
          imageMime: stored.mimeType,
          imageModel: job.model || model,
          imageProvider: 'googleFlow',
          imageAspectRatio: job.aspectRatio || aspectRatio,
          imageReasoningLevel: reasoningLevel,
          imageJobId: job.id || '',
          localImagePath: downloadedFile,
          outputIndex: idx + 1,
          outputCount: downloadedFiles.length,
        },
      })
    }
  }

  return output
}
