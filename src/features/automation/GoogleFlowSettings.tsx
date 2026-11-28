import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, Check, CheckCircle2, Globe, RefreshCw } from 'lucide-react'
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
  outputDir?: string
  profileDir?: string
  cdpUrl?: string
  chromePath?: string
  chromeRunning?: boolean
  accounts: FlowAccount[]
  defaultAccountId?: string
  bridgeError?: string
}

interface FlowModelOption {
  id: string
  label: string
  icon?: string
  note?: string
  selected?: boolean
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
  outputCountsByMedia?: {
    image?: number[]
    video?: number[]
  }
  availableUpscales?: string[]
}

const DEFAULT_VIDEO_MODELS: FlowModelOption[] = [
  { id: 'omni-1-2-flash', label: 'Omni 1.2 Flash' },
  { id: 'omni-1-1-flash', label: 'Omni 1.1 Flash', note: 'Akan dihentikan pada 5 Des' },
  { id: 'veo-3-1-lite', label: 'Veo 3.1 - Lite' },
  { id: 'veo-3-1-fast', label: 'Veo 3.1 - Fast', note: 'Akan dihentikan pada 5 Des' },
  { id: 'veo-3-1-quality', label: 'Veo 3.1 - Quality', note: 'Akan dihentikan pada 5 Des' },
]

const DEFAULT_IMAGE_MODELS: FlowModelOption[] = [
  { id: 'nano-banana-pro', label: 'Nano Banana Pro', icon: '🍌' },
  { id: 'nano-banana-2-lite', label: 'Nano Banana 2 Lite', icon: '🍌' },
  { id: 'nano-banana-2-1', label: 'Nano Banana 2.1', icon: '🍌' },
]

const IMAGE_MODEL_META = new Map(DEFAULT_IMAGE_MODELS.map(item => [item.id, item]))
const VIDEO_MODEL_META = new Map(DEFAULT_VIDEO_MODELS.map(item => [item.id, item]))

const DEFAULT_VIDEO_RATIOS = ['16:9', '9:16']
const DEFAULT_IMAGE_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16']
const DEFAULT_OUTPUT_COUNTS = ['1', '2', '3', '4']
const REASONING_OPTIONS = [
  { id: 'low', label: 'Rendah', hint: 'Cepat & ringkas' },
  { id: 'medium', label: 'Sedang', hint: 'Seimbang antara kecepatan & detail' },
  { id: 'high', label: 'Tinggi', hint: 'Sangat menyeluruh' },
] as const
const DEFAULT_UPSCALES = ['none', '1080p', 'highest_available']

function ratioClassName(ratio: string): string {
  if (ratio === '16:9') return 'r-16-9'
  if (ratio === '4:3') return 'r-4-3'
  if (ratio === '1:1') return 'r-1-1'
  if (ratio === '3:4') return 'r-3-4'
  return 'r-9-16'
}

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
  outputs = '1',
  reasoningLevel = 'ui-default',
  upscale = 'none',
  busy,
  onChangeAccount,
  onChangeModel,
  onChangeAspectRatio,
  onChangeOutputs,
  onChangeReasoningLevel,
  onChangeUpscale,
  onStatusChange,
}: {
  mediaType?: 'video' | 'image'
  accountId: string
  model: string
  aspectRatio: string
  outputs?: string
  reasoningLevel?: string
  upscale?: string
  busy: boolean
  onChangeAccount: (id: string) => void
  onChangeModel: (m: string) => void
  onChangeAspectRatio: (r: string) => void
  onChangeOutputs?: (o: string) => void
  onChangeReasoningLevel?: (r: string) => void
  onChangeUpscale?: (u: string) => void
  onStatusChange?: (connected: boolean, accountLabel: string) => void
}) {
  const [status, setStatus] = useState<FlowStatusResponse | null>(null)
  const [inspectInfo, setInspectInfo] = useState<FlowInspectResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [inspecting, setInspecting] = useState(false)
  const [connectBusy, setConnectBusy] = useState(false)
  const [chromeOpened, setChromeOpened] = useState(false)
  const [newLabel, setNewLabel] = useState('Google Flow Pro')
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
          : 'Akun Google belum masuk ke workspace Google Flow. Buka jendela login untuk memastikan sesi masuk ke Flow.',
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
          ? 'Jendela login sudah terbuka. Login akun Google AI Pro Anda sampai masuk workspace Flow, lalu klik tombol 2.'
          : 'Jendela Chrome login terbuka. Login akun Google AI Pro Anda 1× saja sampai masuk workspace Flow, lalu klik tombol 2.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka jendela login Chrome.')
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
      setMessage(
        `Sesi "${res?.label || res?.accountId || 'Google Flow Pro'}" tersimpan permanen dan jendela login ditutup. Proses Video & Gambar berjalan tersembunyi di background.`,
      )
      await loadStatus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan akun Google Flow.')
    } finally {
      setConnectBusy(false)
    }
  }

  const { isConnected, accountLabel } = computeFlowConnection(status, accountId)

  const metaMap = mediaType === 'image' ? IMAGE_MODEL_META : VIDEO_MODEL_META
  const fallbackModels = mediaType === 'image' ? DEFAULT_IMAGE_MODELS : DEFAULT_VIDEO_MODELS
  const discoveredModels: FlowModelOption[] = inspectInfo?.models?.[mediaType]?.length
    ? inspectInfo.models[mediaType]!.map(item => ({
      ...metaMap.get(item.id),
      id: item.id,
      label: item.label || metaMap.get(item.id)?.label || item.id,
      selected: item.selected,
    }))
    : fallbackModels

  const currentModel = model || 'ui-default'
  const liveModels: FlowModelOption[] = [
    ...discoveredModels,
    ...(currentModel !== 'ui-default' && !discoveredModels.some(item => item.id === currentModel)
      ? [{ id: currentModel, label: currentModel }]
      : []),
    { id: 'ui-default', label: 'Bawaan UI Flow (otomatis)' },
  ]

  const discoveredRatios = inspectInfo?.aspectRatiosByMedia?.[mediaType]?.length
    ? inspectInfo.aspectRatiosByMedia[mediaType]!
    : (mediaType === 'image' ? DEFAULT_IMAGE_RATIOS : DEFAULT_VIDEO_RATIOS)
  const liveRatios = [...new Set(discoveredRatios)]
  const currentRatio = aspectRatio || (mediaType === 'image' ? '3:4' : '9:16')

  const liveOutputs = inspectInfo?.outputCountsByMedia?.[mediaType]?.length
    ? inspectInfo.outputCountsByMedia[mediaType]!.map(String)
    : DEFAULT_OUTPUT_COUNTS
  const currentOutputs = String(outputs || '1')

  const currentReasoning = reasoningLevel || 'ui-default'
  const reasoningHint = REASONING_OPTIONS.find(opt => opt.id === currentReasoning)?.hint
    || 'Mengikuti bawaan UI Google Flow'

  const liveUpscales = inspectInfo?.availableUpscales?.length
    ? ['none', ...inspectInfo.availableUpscales, 'highest_available']
    : DEFAULT_UPSCALES

  return (
    <div className="wf-flow-box">
      <div className="wf-flow-header">
        <strong>Google Flow (Background · Video &amp; Gambar)</strong>
        <button type="button" disabled={busy || loading} onClick={() => void loadStatus()} title="Muat ulang status Google Flow">
          <RefreshCw size={13} />
          {loading ? 'Memuat…' : 'Segarkan'}
        </button>
      </div>

      {status && (
        <div className={`wf-flow-status-banner ${isConnected ? 'is-connected' : 'is-disconnected'}`} role="status">
          {isConnected ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          <div>
            <strong>
              {isConnected
                ? 'Terhubung · Jalan Tersembunyi di Background (Video & Gambar Siap)'
                : 'Belum Terhubung ke Google Flow'}
            </strong>
            <span>
              {isConnected
                ? `Memakai akun "${accountLabel}" · Render berjalan di background tanpa jendela browser muncul`
                : 'Login Google 1× saja agar generate Video & Gambar otomatis berjalan di background.'}
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

      <div className="wf-flow-section">
        <div className="wf-flow-section-head">
          <span>Model</span>
        </div>
        <div className="wf-flow-radio-list" role="radiogroup" aria-label={mediaType === 'image' ? 'Model Gambar' : 'Model Video'}>
          {liveModels.map(item => {
            const selected = currentModel === item.id
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                className={`wf-flow-radio-item${selected ? ' is-selected' : ''}`}
                onClick={() => onChangeModel(item.id)}
              >
                <span className="wf-flow-radio-dot" aria-hidden="true" />
                <span className="wf-flow-radio-text">
                  <span className="wf-flow-radio-label">
                    {item.icon ? <span aria-hidden="true">{item.icon}</span> : null}
                    {item.label}
                  </span>
                  {item.note && <span className="wf-flow-model-note">{item.note}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="wf-flow-section">
        <div className="wf-flow-section-head">
          <span>Rasio aspek</span>
          <button
            type="button"
            disabled={busy}
            className={`wf-flow-section-reset${currentRatio === 'ui-default' ? ' is-active' : ''}`}
            onClick={() => onChangeAspectRatio('ui-default')}
          >
            Bawaan UI
          </button>
        </div>
        <div className="wf-flow-seg" role="radiogroup" aria-label="Rasio aspek">
          {liveRatios.map(r => {
            const selected = currentRatio === r
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                className={`wf-flow-seg-btn${mediaType === 'video' ? ' is-row' : ''}${selected ? ' is-selected' : ''}`}
                onClick={() => onChangeAspectRatio(r)}
              >
                <span className={`wf-flow-ratio-box ${ratioClassName(r)}`} aria-hidden="true" />
                <span>{r}</span>
              </button>
            )
          })}
        </div>
      </div>

      {onChangeOutputs && (
        <div className="wf-flow-section">
          <div className="wf-flow-section-head">
            <span>Jumlah output</span>
          </div>
          <div className="wf-flow-seg" role="radiogroup" aria-label="Jumlah output">
            {liveOutputs.map(count => {
              const selected = currentOutputs === count
              return (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  className={`wf-flow-seg-btn${selected ? ' is-selected' : ''}`}
                  onClick={() => onChangeOutputs(count)}
                >
                  {`x${count}`}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {mediaType === 'image' && onChangeReasoningLevel && (
        <div className="wf-flow-section">
          <div className="wf-flow-section-head">
            <span>Tingkat penalaran</span>
            <button
              type="button"
              disabled={busy}
              className={`wf-flow-section-reset${currentReasoning === 'ui-default' ? ' is-active' : ''}`}
              onClick={() => onChangeReasoningLevel('ui-default')}
            >
              Bawaan UI
            </button>
          </div>
          <div className="wf-flow-seg" role="radiogroup" aria-label="Tingkat penalaran">
            {REASONING_OPTIONS.map(option => {
              const selected = currentReasoning === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={busy}
                  className={`wf-flow-seg-btn${selected ? ' is-selected' : ''}`}
                  onClick={() => onChangeReasoningLevel(option.id)}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
          <p className="wf-flow-hint">{reasoningHint}</p>
        </div>
      )}

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
        <summary>Login Permanen (1× Saja · Tanpa Extension)</summary>
        <p className="wf-muted">
          Login Google 1 kali di jendela Chrome → klik Simpan → jendela langsung tertutup otomatis. Selanjutnya semua proses Generate Video &amp; Gambar berjalan tersembunyi di background; Anda cukup menunggu hasilnya di Auto Workflow.
        </p>
        <label className="wf-field">
          <span>Nama akun</span>
          <input value={newLabel} disabled={busy || connectBusy} onChange={event => setNewLabel(event.target.value)} placeholder="Google Flow Pro" />
        </label>
        <div className="wf-flow-actions">
          <button type="button" disabled={busy || connectBusy || !status?.installed} onClick={() => void openPersistentChrome()}>
            <Globe size={13} />
            {connectBusy && !chromeOpened ? 'Membuka Jendela…' : '1. Buka Jendela Login (1× Saja)'}
          </button>
          <button
            type="button"
            className="wf-primary"
            disabled={busy || connectBusy || !status?.installed}
            onClick={() => void savePersistentAccount()}
          >
            <Check size={13} />
            {connectBusy ? 'Menyimpan sesi…' : '2. Sudah Masuk Flow → Simpan & Tutup Jendela'}
          </button>
        </div>
      </details>

      {message && <p className="wf-inline-note">{message}</p>}
      {error && <p role="alert" className="wf-error">{error}</p>}
    </div>
  )
}
