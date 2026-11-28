import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, Link2, RefreshCw } from 'lucide-react'
import { workflowRequest } from './workflow-model'

interface FlowAccount {
  id: string
  label?: string
  connectionStatus?: string
  lastValidationError?: string
}

interface FlowStatusResponse {
  installed: boolean
  extensionDir?: string
  outputDir?: string
  chromePath?: string
  accounts: FlowAccount[]
  defaultAccountId?: string
  bridgeError?: string
}

interface FlowInspectResponse {
  signedIn?: boolean
  workspaceAvailable?: boolean
  pageKind?: string
  models?: {
    video?: Array<{ id: string; label: string; selected?: boolean }>
  }
  aspectRatiosByMedia?: {
    video?: string[]
  }
  availableUpscales?: string[]
}

const DEFAULT_VIDEO_MODELS = [
  { id: 'ui-default', label: 'Bawaan UI Flow' },
  { id: 'omni-flash', label: 'Omni Flash' },
  { id: 'veo-3-1-fast', label: 'Veo 3.1 - Fast' },
  { id: 'veo-3-1-lite', label: 'Veo 3.1 - Lite' },
  { id: 'veo-3-1-quality', label: 'Veo 3.1 - Quality' },
]

const DEFAULT_RATIOS = ['9:16', '16:9', 'ui-default']
const DEFAULT_UPSCALES = ['none', '1080p', 'highest_available']

export function GoogleFlowSettings({
  accountId,
  model,
  aspectRatio,
  upscale,
  busy,
  onChangeAccount,
  onChangeModel,
  onChangeAspectRatio,
  onChangeUpscale,
}: {
  accountId: string
  model: string
  aspectRatio: string
  upscale: string
  busy: boolean
  onChangeAccount: (id: string) => void
  onChangeModel: (m: string) => void
  onChangeAspectRatio: (r: string) => void
  onChangeUpscale: (u: string) => void
}) {
  const [status, setStatus] = useState<FlowStatusResponse | null>(null)
  const [inspectInfo, setInspectInfo] = useState<FlowInspectResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [newLabel, setNewLabel] = useState('Google Flow Pro')
  const [copiedPath, setCopiedPath] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await workflowRequest<FlowStatusResponse>('/google-flow/status')
      setStatus(data)
      if (data.bridgeError) setError(data.bridgeError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa Google Flow MCP.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    workflowRequest<FlowStatusResponse>('/google-flow/status')
      .then(data => {
        if (cancelled) return
        setStatus(data)
        if (data.bridgeError) setError(data.bridgeError)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memeriksa Google Flow MCP.')
      })
    return () => { cancelled = true }
  }, [])

  const inspectAccount = async () => {
    setInspecting(true)
    setError('')
    setMessage('')
    try {
      const info = await workflowRequest<FlowInspectResponse>('/google-flow/inspect', {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      })
      setInspectInfo(info)
      setMessage(
        info.workspaceAvailable
          ? 'Workspace Google Flow aktif dan opsi model diperbarui.'
          : 'Akun Google belum masuk ke workspace Google Flow. Periksa login akun Flow Anda.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa UI Google Flow.')
    } finally {
      setInspecting(false)
    }
  }

  const beginConnection = async () => {
    setConnectBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await workflowRequest<{ connectionId?: string }>('/google-flow/connect/begin', {
        method: 'POST',
        body: JSON.stringify({ label: newLabel }),
      })
      if (!res.connectionId) throw new Error('Bridge tidak mengembalikan token koneksi.')
      setConnectionId(res.connectionId)
      setMessage('Buka ekstensi "Flow Login Bridge" di Chrome lalu klik "Connect Flow". Setelah muncul "Session sent", klik tombol Selesaikan di bawah.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memulai koneksi Google Flow.')
    } finally {
      setConnectBusy(false)
    }
  }

  const completeConnection = async () => {
    if (!connectionId) return
    setConnectBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await workflowRequest<{ account?: FlowAccount }>('/google-flow/connect/complete', {
        method: 'POST',
        body: JSON.stringify({ connectionId, label: newLabel }),
      })
      setConnectionId('')
      if (res?.account?.id) onChangeAccount(res.account.id)
      setMessage(`Akun Google Flow "${res?.account?.label || res?.account?.id || 'baru'}" berhasil terhubung.`)
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyelesaikan koneksi akun.')
    } finally {
      setConnectBusy(false)
    }
  }

  const copyExtensionPath = async () => {
    if (!status?.extensionDir) return
    try {
      await navigator.clipboard.writeText(status.extensionDir)
      setCopiedPath(true)
      setTimeout(() => setCopiedPath(false), 2500)
    } catch {
      setCopiedPath(false)
    }
  }

  const liveModels = inspectInfo?.models?.video?.length
    ? [{ id: 'ui-default', label: 'Bawaan UI Flow' }, ...inspectInfo.models.video]
    : DEFAULT_VIDEO_MODELS
  const liveRatios = inspectInfo?.aspectRatiosByMedia?.video?.length
    ? [...inspectInfo.aspectRatiosByMedia.video, 'ui-default']
    : DEFAULT_RATIOS
  const liveUpscales = inspectInfo?.availableUpscales?.length
    ? ['none', ...inspectInfo.availableUpscales, 'highest_available']
    : DEFAULT_UPSCALES

  return (
    <div className="wf-flow-box">
      <div className="wf-flow-header">
        <strong>Google Flow MCP (Lokal)</strong>
        <button type="button" disabled={busy || loading} onClick={() => void loadStatus()} title="Muat ulang status Google Flow">
          <RefreshCw size={13} />
          {loading ? 'Memuat…' : 'Segarkan'}
        </button>
      </div>

      <p className="wf-muted">
        {status?.installed
          ? `Terpasang · ${status.accounts.length} akun terhubung${status.chromePath ? '' : ' (Chrome tidak terdeteksi)'}`
          : 'Google Flow MCP belum ditemukan di folder data/google-flow-mcp.'}
      </p>

      <label className="wf-field">
        <span>Akun Google Flow</span>
        <select disabled={busy} value={accountId} onChange={event => onChangeAccount(event.target.value)}>
          <option value="">Akun default (otomatis)</option>
          {(status?.accounts || []).map(acc => (
            <option key={acc.id} value={acc.id}>
              {acc.label || acc.id} {acc.connectionStatus ? `(${acc.connectionStatus})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="wf-flow-actions">
        <button type="button" disabled={busy || inspecting || !status?.installed} onClick={() => void inspectAccount()}>
          <RefreshCw size={13} />
          {inspecting ? 'Memeriksa UI…' : 'Periksa Akun & Model Flow'}
        </button>
      </div>

      <label className="wf-field">
        <span>Model Video</span>
        <select disabled={busy} value={model || 'ui-default'} onChange={event => onChangeModel(event.target.value)}>
          {!liveModels.some(item => item.id === (model || 'ui-default')) && model && (
            <option value={model}>{model}</option>
          )}
          {liveModels.map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
      </label>

      <label className="wf-field">
        <span>Rasio Aspek</span>
        <select disabled={busy} value={aspectRatio || '9:16'} onChange={event => onChangeAspectRatio(event.target.value)}>
          {liveRatios.map(r => (
            <option key={r} value={r}>
              {r === '9:16' ? '9:16 (Vertikal / Reels)' : r === '16:9' ? '16:9 (Landscape / YouTube)' : 'Bawaan UI Flow'}
            </option>
          ))}
        </select>
      </label>

      <label className="wf-field">
        <span>Upscale Video</span>
        <select disabled={busy} value={upscale || 'none'} onChange={event => onChangeUpscale(event.target.value)}>
          {[...new Set(liveUpscales)].map(u => (
            <option key={u} value={u}>
              {u === 'none' ? 'Tanpa upscale (cepat)' : u === 'highest_available' ? 'Tertinggi yang tersedia' : u}
            </option>
          ))}
        </select>
      </label>

      <details className="wf-advanced" open={status?.installed && status.accounts.length === 0}>
        <summary>Hubungkan Akun Google Flow (Flow Login Bridge)</summary>
        <p className="wf-muted">
          1. Buka <code>chrome://extensions/</code> di Chrome yang sudah login Google Pro, aktifkan Developer mode → Load unpacked folder ekstensi:
        </p>
        {status?.extensionDir && (
          <div className="wf-flow-ext-row">
            <input readOnly value={status.extensionDir} aria-label="Lokasi folder ekstensi Flow Login Bridge" />
            <button type="button" onClick={() => void copyExtensionPath()} title="Salin lokasi folder">
              {copiedPath ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        )}
        <label className="wf-field">
          <span>Label akun</span>
          <input value={newLabel} disabled={busy || connectBusy} onChange={event => setNewLabel(event.target.value)} placeholder="Google Flow Pro" />
        </label>
        <div className="wf-flow-actions">
          <button type="button" disabled={busy || connectBusy || !status?.installed} onClick={() => void beginConnection()}>
            <Link2 size={13} />
            {connectBusy && !connectionId ? 'Menyiapkan…' : '1. Mulai Koneksi'}
          </button>
          {connectionId && (
            <button type="button" className="wf-primary" disabled={busy || connectBusy} onClick={() => void completeConnection()}>
              <Check size={13} />
              {connectBusy ? 'Menunggu pemilihan akun…' : '2. Sudah klik Connect Flow → Selesaikan'}
            </button>
          )}
        </div>
      </details>

      {message && <p className="wf-inline-note">{message}</p>}
      {error && <p role="alert" className="wf-error">{error}</p>}
    </div>
  )
}
