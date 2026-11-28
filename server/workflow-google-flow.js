import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { dataDirectory } from './db.js'
import { resolveWorkflowMediaFilePath, storeWorkflowVideo } from './workflow-media.js'
import { resolveValue, workflowInput } from '../shared/workflow-engine.js'

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
  const extensionDir = path.join(rootDir, 'extension')
  const outputDir = path.join(dataDirectory, 'google-flow-output')
  const chromePath = findSystemChromePath()
  return {
    installed: existsSync(entryPath),
    rootDir,
    entryPath,
    extensionDir,
    outputDir,
    chromePath,
  }
}

export async function closeGoogleFlowClient() {
  const current = sharedClientState
  sharedClientState = null
  sharedClientPromise = null
  if (!current) return
  try { await current.client.close() } catch {}
  try { await current.transport.close() } catch {}
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
      try { await transport.close() } catch {}
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
    try { parsed = JSON.parse(text) } catch {}
  }
  if (result?.isError) {
    const message = parsed?.error || parsed?.message || text || `Tool Google Flow "${name}" gagal.`
    throw new Error(String(message))
  }
  return parsed ?? { text }
}

export async function getGoogleFlowStatus() {
  const paths = getGoogleFlowPaths()
  if (!paths.installed) {
    return {
      ...paths,
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
      accounts,
      defaultAccountId: typeof data?.defaultAccountId === 'string' ? data.defaultAccountId : '',
      bridgeError: '',
    }
  } catch (error) {
    return {
      ...paths,
      accounts: [],
      defaultAccountId: '',
      bridgeError: error instanceof Error ? error.message : 'Gagal menghubungi Google Flow MCP.',
    }
  }
}

export async function inspectGoogleFlowAccount(accountId = '') {
  const id = String(accountId || '').trim()
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
  const model = String(node.data.model || 'ui-default').trim() || 'ui-default'
  const aspectRatio = String(node.data.aspectRatio || 'ui-default').trim() || 'ui-default'
  const upscale = String(node.data.upscale || 'none').trim() || 'none'
  const flowProject = String(node.data.flowProject || '').trim()
  const useInputImage = node.data.useInputImage !== false
  const timeoutSeconds = Math.min(900, Math.max(60, Math.round(Number(node.data.timeoutSeconds) || 480)))

  const output = []
  for (const item of input) {
    if (signal?.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Pengujian dihentikan pengguna.')
    }

    const latest = workflowInput(item.json)
    const automaticPrompt = latest && typeof latest === 'object' ? (latest.videoPrompt ?? latest.prompt) : latest
    const selectedPrompt = node.data.prompt?.trim()
      ? resolveValue(node.data.prompt, item.json)
      : automaticPrompt
    if (typeof selectedPrompt !== 'string') {
      throw new Error('Hasil langkah sebelumnya bukan prompt teks. Isi Prompt video atau sambungkan prompt dari langkah sebelumnya.')
    }
    const prompt = selectedPrompt.trim()
    if (!prompt || prompt.length > 20_000) {
      throw new Error('Prompt video wajib diisi (3–20.000 karakter).')
    }
    if (prompt.length < 3) {
      throw new Error('Prompt video minimal 3 karakter.')
    }

    const referenceFiles = []
    const rawRefPath = typeof node.data.referenceImagePath === 'string' ? node.data.referenceImagePath.trim() : ''
    if (rawRefPath) {
      const resolvedPath = String(resolveValue(rawRefPath, item.json) || '').trim()
      if (!path.isAbsolute(resolvedPath) || !existsSync(resolvedPath)) {
        throw new Error(`File referensi gambar tidak ditemukan: ${resolvedPath || rawRefPath}`)
      }
      referenceFiles.push(resolvedPath)
    } else if (useInputImage) {
      const candidateImage = item.json.imagePreviewUrl || item.json.imageUrl
      if (typeof candidateImage === 'string' && candidateImage.trim()) {
        const localMedia = resolveMediaPath(user.id, candidateImage)
        if (localMedia?.filePath && existsSync(localMedia.filePath)) {
          referenceFiles.push(localMedia.filePath)
        }
      }
    }

    let job = await callTool(
      'flow_generate_video',
      {
        ...(accountId ? { accountId } : {}),
        prompt,
        model,
        aspectRatio,
        outputs: 1,
        referenceFiles,
        upscale,
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
      throw new Error(job.error || 'Google Flow menghentikan render (periksa jendela Chrome atau status akun Flow Anda).')
    }
    if (job?.status !== 'completed') {
      throw new Error(`Render video Google Flow melewati batas waktu${job?.id ? ` (Job ID: ${job.id})` : ''}.`)
    }

    if ((!Array.isArray(job.downloadedFiles) || !job.downloadedFiles.length) && job.id) {
      job = await callTool('flow_download_job', { jobId: job.id }, { timeoutMs: 120_000, signal })
    }

    const downloadedFile = Array.isArray(job?.downloadedFiles) ? job.downloadedFiles[0] : ''
    if (!downloadedFile || !existsSync(downloadedFile)) {
      throw new Error('Google Flow selesai, tetapi file video lokal tidak ditemukan.')
    }

    const buffer = await readFile(downloadedFile)
    const mimeType = /\.mov$/i.test(downloadedFile) ? 'video/quicktime' : 'video/mp4'
    const stored = await storeVideo(user.id, buffer, mimeType)
    const probe = Array.isArray(job.mediaProbe) ? job.mediaProbe[0] : null

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
        ...(typeof probe?.durationSeconds === 'number' ? { videoDurationSeconds: probe.durationSeconds } : {}),
        ...(probe?.width && probe?.height ? { videoResolution: `${probe.width}x${probe.height}` } : {}),
      },
    })
  }

  return output
}
