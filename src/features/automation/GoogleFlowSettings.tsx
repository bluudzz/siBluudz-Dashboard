import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Copy, Globe, Link2, RefreshCw } from 'lucide-react'
import { workflowRequest } from './workflow-model'

interface FlowAccount {
  id: string
  label?: string
  browserMode?: string
  connectionStatus?: string
  lastValidationError?: string
}

interface FlowStatusResponse {
  installed: boolean
  extensionDir?: string
  outputDir?: string
  profileDir?: string
  cdpUrl?: string
  chromePath?: string
  chromeRunning?: boolean
  accounts: FlowAccount[]
  defaultAccountId?: string
  bridgeError?: string
}

interface FlowInspectResponse {
  signedIn?: boolean
  workspaceAvailable?: boolean
  pageKind?: string
  models?: {
    image?: Array<{ id: string; label: string; selected?: boolean }>
    video?: Array<{ id: string; label: string; selected?: boolean }>
  }
  aspectRatiosByMedia?: {
    image?: string[]
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

const DEFAULT_IMAGE_MODELS = [
  { id: 'ui-default', label: 'Bawaan UI Flow' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro' },
  { id: 'nano-banana-2', label: 'Nano Banana 2' },
  { id: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite' },
]

const DEFAULT_VIDEO_RATIOS = ['9:16', '16:9', 'ui-default']
const DEFAULT_IMAGE_RATIOS = ['3:4', '1:1', '9:16', '16:9', '4:3', 'ui-default']
const DEFAULT_UPSCALES = ['none', '1080p', 'highest_available']

function computeFlowConnection(status: FlowStatusResponse | null, accountId: string) {
  const accounts = status?.accounts || []
  const selected = (accountId && accounts.find(a => a.id === accountId))
    || (status?.defaultAccountId && accounts.find(a => a.id === status.defaultAccountId))
    || accounts.find(a => a.connectionStatus === 'connected')
    || accounts[0]
  const isConnected = Boolean(
    status?.installed
    && selected
    && selected.connectionStatus !== 'needs_reconnect'
    && selected.connectionStatus !== 'access_unavailable',
  )
  return {
    isConnected,
    accountLabel: selected ? (selected.label || selected.id) : '',
  }
}

export function GoogleFlowSettings({
  mediaType = 'video',
  accountId,
  model,
  aspectRatio,
  upscale = 'none',
  busy,
  onChangeAccount,
  onChangeModel,
  onChangeAspectRatio,
  onChangeUpscale,
  onStatusChange,
}: {
  mediaType?: 'video' | 'image'
  accountId: string
  model: string
  aspectRatio: string
  upscale?: string
  busy: boolean
  onChangeAccount: (id: string) => void
  onChangeModel: (m: string) => void
  onChangeAspectRatio: (r: string) => void
  onChangeUpscale?: (u: string) => void
  onStatusChange?: (connected: boolean, accountLabel: string) => void
}) {
  const [status, setStatus] = useState<FlowStatusResponse | null>(null)
  const [inspectInfo, setInspectInfo] = useState<FlowInspectResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [connectBusy, setConnectBusy] = useState(false)
  const [chromeOpened, setChromeOpened] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [newLabel, setNewLabel] = useState('Google Flow Pro')
  const [copiedPath, setCopiedPath] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const notifyStatus = useCallback((data: FlowStatusResponse | null, accId: string) => {
    const conn = computeFlowConnection(data, accId)
    onStatusChange?.(conn.isConnected, conn.accountLabel)
  }, [onStatusChange])

  const loadStatus = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await workflowRequest<FlowStatusResponse>('/google-flow/status')
      setStatus(data)
      notifyStatus(data, accountId)
      if (data.bridgeError) setError(data.bridgeError)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa Google Flow MCP.')
    } finally {
      setLoading(false)
    }
  }, [accountId, notifyStatus])

  useEffect(() => {
    let cancelled = false
    workflowRequest<FlowStatusResponse>('/google-flow/status')
      .then(data => {
        if (cancelled) return
        setStatus(data)
        notifyStatus(data, accountId)
        if (data.bridgeError) setError(data.bridgeError)
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memeriksa Google Flow MCP.')
      })
    return () => { cancelled = true }
  }, [accountId, notifyStatus])

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
      if (info.workspaceAvailable) {
        const conn = computeFlowConnection(status, accountId)
        onStatusChange?.(true, conn.accountLabel || 'Aktif')
      }
      setMessage(
        info.workspaceAvailable
          ? 'Workspace Google Flow aktif dan opsi model diperbarui.'
          : 'Akun Google belum masuk ke workspace Google Flow. Buka Chrome profil permanen dan pastikan sudah masuk workspace.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memeriksa UI Google Flow.')
    } finally {
      setInspecting(false)
    }
  }

  const openPersistentChrome = async () => {
    setConnectBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await workflowRequest<{ started?: boolean; alreadyRunning?: boolean }>('/google-flow/connect/browser', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setChromeOpened(true)
      setMessage(
        res.alreadyRunning
          ? 'Chrome profil permanen sudah terbuka. Pastikan akun Google AI Pro Anda sudah masuk ke workspace Google Flow, lalu klik tombol 2.'
          : 'Chrome profil permanen terbuka. Login akun Google AI Pro Anda SEKALI SAJA sampai masuk ke workspace Google Flow, lalu klik tombol 2.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka Chrome login permanen.')
    } finally {
      setConnectBusy(false)
    }
  }

  const savePersistentAccount = async () => {
    setConnectBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await workflowRequest<{ accountId?: string; label?: string }>('/google-flow/connect/save-browser', {
        method: 'POST',
        body: JSON.stringify({ accountId: accountId || 'personal', label: newLabel }),
      })
      if (res?.accountId) onChangeAccount(res.accountId)
      setChromeOpened(false)
      setMessage(`Sesi permanen "${res?.label || res?.accountId || 'Google Flow Pro'}" tersimpan di laptop. Anda tidak perlu login ulang lagi!`)
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun permanen.')
    } finally {
      setConnectBusy(false)
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
      setMessage(`Akun Google Flow "${res?.account?.label || res?.account?.id || 'baru'}" berhasil terhubung (siap untuk Video & Gambar).`)
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

  const { isConnected, accountLabel } = computeFlowConnection(status, accountId)

  const liveModels = mediaType === 'image'
    ? (inspectInfo?.models?.image?.length
      ? [{ id: 'ui-default', label: 'Bawaan UI Flow' }, ...inspectInfo.models.image]
      : DEFAULT_IMAGE_MODELS)
    : (inspectInfo?.models?.video?.length
      ? [{ id: 'ui-default', label: 'Bawaan UI Flow' }, ...inspectInfo.models.video]
      : DEFAULT_VIDEO_MODELS)

  const liveRatios = mediaType === 'image'
    ? (inspectInfo?.aspectRatiosByMedia?.image?.length
      ? [...inspectInfo.aspectRatiosByMedia.image, 'ui-default']
      : DEFAULT_IMAGE_RATIOS)
    : (inspectInfo?.aspectRatiosByMedia?.video?.length
      ? [...inspectInfo.aspectRatiosByMedia.video, 'ui-default']
      : DEFAULT_VIDEO_RATIOS)

  const liveUpscales = inspectInfo?.availableUpscales?.length
    ? ['none', ...inspectInfo.availableUpscales, 'highest_available']
    : DEFAULT_UPSCALES

  return (
    <div className="wf-flow-box">
      <div className="wf-flow-header">
        <strong>Google Flow MCP (Video &amp; Gambar)</strong>
        <button type="button" disabled={busy || loading} onClick={() => void loadStatus()} title="Muat ulang status Google Flow">
          <RefreshCw size={13} />
          {loading ? 'Memuat…' : 'Segarkan'}
        </button>
      </div>

      {status && (
        <div className={`wf-flow-status-banner ${isConnected ? 'is-connected' : 'is-disconnected'}`} role="status">
          {isConnected ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <div>
            <strong>{isConnected ? 'Terhubung Permanen · Video & Gambar Siap' : 'Belum Terhubung ke Google Flow'}</strong>
            <span>
              {isConnected
                ? `Memakai akun "${accountLabel}" · Profil Chrome lokal tersimpan permanen`
                : 'Login Google sekali di Chrome khusus profil lokal agar tidak pernah logout lagi.'}
            </span>
          </div>
        </div>
      )}

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
        <span>{mediaType === 'image' ? 'Model Gambar' : 'Model Video'}</span>
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
        <select
          disabled={busy}
          value={aspectRatio || (mediaType === 'image' ? '3:4' : '9:16')}
          onChange={event => onChangeAspectRatio(event.target.value)}
        >
          {[...new Set(liveRatios)].map(r => (
            <option key={r} value={r}>
              {r === '9:16'
                ? '9:16 (Vertikal / Reels / Story)'
                : r === '16:9'
                  ? '16:9 (Landscape / YouTube)'
                  : r === '3:4'
                    ? '3:4 (Portrait Feed)'
                    : r === '4:3'
                      ? '4:3 (Klasik)'
                      : r === '1:1'
                        ? '1:1 (Square)'
                        : 'Bawaan UI Flow'}
            </option>
          ))}
        </select>
      </label>

      {mediaType === 'video' && onChangeUpscale && (
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
      )}

      <details className="wf-advanced" open={!isConnected}>
        <summary>Login Permanen Chrome (Anti-Logout · Disarankan)</summary>
        <p className="wf-muted">
          Data login &amp; profil Chrome disimpan permanen di komputer Anda sehingga tidak akan terlogout seperti salin cookie.
        </p>
        <label className="wf-field">
          <span>Nama akun</span>
          <input value={newLabel} disabled={busy || connectBusy} onChange={event => setNewLabel(event.target.value)} placeholder="Google Flow Pro" />
        </label>
        <div className="wf-flow-actions">
          <button type="button" disabled={busy || connectBusy || !status?.installed} onClick={() => void openPersistentChrome()}>
            <Globe size={13} />
            {connectBusy && !chromeOpened ? 'Membuka Chrome…' : '1. Buka Chrome Login Permanen'}
          </button>
          <button
            type="button"
            className="wf-primary"
            disabled={busy || connectBusy || !status?.installed}
            onClick={() => void savePersistentAccount()}
          >
            <Check size={13} />
            {connectBusy ? 'Menyimpan sesi…' : '2. Sudah Masuk Flow → Simpan Permanen'}
          </button>
        </div>
      </details>

      <details className="wf-advanced">
        <summary>Metode alternatif: Flow Login Bridge (Extension)</summary>
        <p className="wf-muted">
          Catatan: di Chrome Windows terbaru, metode salin cookie kadang ditolak Google sebagai &quot;Signed out&quot;. Gunakan Login Permanen Chrome di atas bila terlogout.
        </p>
        {status?.extensionDir && (
          <div className="wf-flow-ext-row">
            <input readOnly value={status.extensionDir} aria-label="Lokasi folder ekstensi Flow Login Bridge" />
            <button type="button" onClick={() => void copyExtensionPath()} title="Salin lokasi folder">
              {copiedPath ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
        )}
        <div className="wf-flow-actions">
          <button type="button" disabled={busy || connectBusy || !status?.installed} onClick={() => void beginConnection()}>
            <Link2 size={13} />
            {connectBusy && !connectionId ? 'Menyiapkan…' : '1. Mulai Koneksi Extension'}
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
