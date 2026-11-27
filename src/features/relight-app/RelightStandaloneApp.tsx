import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  EyeOff,
  ImagePlus,
  Loader2,
  LogOut,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  User,
  X,
} from 'lucide-react'
import { defaultRelightSettings, relightOptions, relightPresets } from '../../../shared/relight.js'
import type { RelightResolution, RelightSettings } from '../../../shared/relight.js'
import {
  canShareFile,
  exportRelightImage,
  isIOSDevice,
  prepareSyncRelightExport,
} from '@/features/ai-generator/relight-export'
import { BeforeAfterSlider } from './BeforeAfterSlider'
import { getPresetDefaultSamples, resolvePresetSamples } from './relight-sample-art'
import './relight-app.css'

interface RelightUser {
  id: string
  username: string
  email: string
  name: string
  isActive: boolean
  dailyLimit: number
  usageToday: number
  remaining: number
  isUnlimited: boolean
}

interface PresetShowcase {
  id: string
  label: string
  description: string
  hasCustomBefore: boolean
  hasCustomAfter: boolean
  beforeUrl: string
  afterUrl: string
}

interface SourcePhoto {
  data: string
  name: string
}

interface RelightOutput {
  image: string
  source: SourcePhoto
  model: string
  format?: string
  warning?: string
}

type Stage = 'picker' | 'editor'
type ResolutionChoice = 'auto' | Exclude<RelightResolution, '1K'>

const RESOLUTIONS: { id: ResolutionChoice; label: string }[] = [
  { id: 'auto', label: 'Otomatis' },
  { id: '2K', label: '2K' },
  { id: '4K', label: '4K' },
]

export function RelightStandaloneApp() {
  const [authChecking, setAuthChecking] = React.useState(true)
  const [user, setUser] = React.useState<RelightUser | null>(null)
  const [configured, setConfigured] = React.useState(true)
  const [presets, setPresets] = React.useState<PresetShowcase[]>([])

  // Login form state
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loginBusy, setLoginBusy] = React.useState(false)
  const [loginError, setLoginError] = React.useState('')

  // Workflow stages
  const [stage, setStage] = React.useState<Stage>('picker')
  const [settings, setSettings] = React.useState<RelightSettings>({ ...defaultRelightSettings })
  const [resolution, setResolution] = React.useState<ResolutionChoice>('auto')
  const [instructions, setInstructions] = React.useState('')
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  // Editor & photo state
  const [source, setSource] = React.useState<SourcePhoto | null>(null)
  const [result, setResult] = React.useState<RelightOutput | null>(null)
  const [strength, setStrength] = React.useState(100)
  const [comparePos, setComparePos] = React.useState(52)
  const [draggingFile, setDraggingFile] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [editorError, setEditorError] = React.useState('')
  const [iosSheet, setIosSheet] = React.useState<{ url: string; filename: string; file: File } | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const loadWorkspace = React.useCallback(async () => {
    const res = await fetch('/api/relight/presets', { credentials: 'same-origin' })
    if (!res.ok) return
    const data = (await res.json()) as {
      configured?: boolean
      presets?: PresetShowcase[]
      user?: RelightUser
    }
    setConfigured(data.configured !== false)
    if (Array.isArray(data.presets)) setPresets(data.presets)
    if (data.user) setUser(data.user)
  }, [])

  React.useEffect(() => {
    let active = true
    fetch('/api/relight/auth/me', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then(async (data: { authenticated?: boolean; user?: RelightUser }) => {
        if (!active) return
        if (data?.authenticated && data.user) {
          setUser(data.user)
          await loadWorkspace()
        } else {
          setUser(null)
        }
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setAuthChecking(false)
      })
    return () => {
      active = false
    }
  }, [loadWorkspace])

  React.useEffect(() => {
    if (!iosSheet) return
    return () => {
      URL.revokeObjectURL(iosSheet.url)
    }
  }, [iosSheet])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginError('')
    setLoginBusy(true)
    try {
      const res = await fetch('/api/relight/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.error || 'Gagal masuk ke Relight Studio.')
      }
      setUser(data.user)
      setPassword('')
      setStage('picker')
      await loadWorkspace()
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Gagal masuk ke Relight Studio.')
    } finally {
      setLoginBusy(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/relight/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {})
    setUser(null)
    setPresets([])
    setSource(null)
    setResult(null)
    setStage('picker')
  }

  const handleChoosePreset = (presetId: string) => {
    setSettings((prev) => ({ ...prev, preset: presetId }))
    setEditorError('')
    setStage('editor')
  }

  const handlePhotoFile = (file: File | undefined) => {
    if (!file) return
    if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
      setEditorError('Format foto harus PNG, JPG, atau WEBP.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setEditorError('Ukuran foto maksimal 6 MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSource({ data: reader.result, name: file.name })
        setResult(null)
        setEditorError('')
      }
    }
    reader.onerror = () => setEditorError('Gagal membaca berkas foto.')
    reader.readAsDataURL(file)
  }

  const handleProcess = async () => {
    if (!source || processing) return
    setProcessing(true)
    setEditorError('')
    try {
      const res = await fetch('/api/relight/process', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImage: source.data,
          settings,
          instructions,
          ...(resolution !== 'auto' ? { resolution } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) {
          setUser(null)
        }
        throw new Error(data?.error || 'Gagal memproses pencahayaan foto.')
      }
      setResult({
        image: data.image,
        source,
        model: data.model || '',
        format: data.output?.format,
        warning: data.warning,
      })
      setStrength(100)
      setComparePos(52)
      if (data.usage) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                usageToday: data.usage.usageToday,
                dailyLimit: data.usage.dailyLimit,
                remaining: data.usage.remaining,
              }
            : prev
        )
      }
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Gagal memproses relight foto.')
    } finally {
      setProcessing(false)
    }
  }

  const handleDownloadResult = async () => {
    if (!result || exporting) return
    const safeName = (result.source.name || 'relight-photo').replace(/\.[^.]+$/, '')
    const filename = `${safeName}-${settings.preset}`

    if (isIOSDevice()) {
      const syncExport = prepareSyncRelightExport({
        sourceDataUrl: result.source.data,
        resultImageUrl: result.image,
        strength,
        resultFormat: result.format,
      })
      if (syncExport) {
        const fullName = `${filename}.${syncExport.ext}`
        const file = new File([syncExport.blob], fullName, { type: syncExport.blob.type || 'image/png' })
        if (canShareFile(file)) {
          try {
            await navigator.share({ files: [file], title: fullName })
            return
          } catch (err) {
            if (err instanceof DOMException && err.name === 'AbortError') return
          }
        }
        setIosSheet({ url: URL.createObjectURL(syncExport.blob), filename: fullName, file })
        return
      }
    }

    setExporting(true)
    try {
      const exported = await exportRelightImage({
        sourceDataUrl: result.source.data,
        resultImageUrl: result.image,
        strength,
        resultFormat: result.format,
      })
      if (!exported) throw new Error('Gagal menyiapkan file foto untuk diunduh.')

      const fullName = `${filename}.${exported.ext}`
      if (isIOSDevice()) {
        const file = new File([exported.blob], fullName, { type: exported.blob.type || 'image/png' })
        setIosSheet({ url: URL.createObjectURL(exported.blob), filename: fullName, file })
        return
      }

      const url = URL.createObjectURL(exported.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fullName
      document.body.appendChild(a)
      a.click()
      window.setTimeout(() => {
        a.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Gagal mengunduh hasil.')
    } finally {
      setExporting(false)
    }
  }

  if (authChecking) {
    return (
      <div className="rs-shell">
        <div className="rs-loading-screen">
          <Loader2 size={24} className="rs-spin" />
          <span>Memuat Relight Studio...</span>
        </div>
      </div>
    )
  }

  // Stage 1: Standalone Login Page
  if (!user) {
    const heroPreview = getPresetDefaultSamples('strobist')
    return (
      <div className="rs-shell">
        <div className="rs-login-stage">
          <div className="rs-login-frame">
            <div className="rs-login-showcase">
              <div className="rs-login-showcase-preview">
                <BeforeAfterSlider
                  beforeSrc={heroPreview.beforeUrl}
                  afterSrc={heroPreview.afterUrl}
                  beforeLabel="Asli"
                  afterLabel="Strobist"
                />
              </div>
              <div className="rs-login-showcase-caption">
                <strong>Geser untuk melihat hasil pencahayaan</strong>
                <p>
                  Ubah pencahayaan foto seketika dengan preset Strobist Flash, Direct Flash, Softbox, Backlit Rim, hingga Smart HDR.
                </p>
              </div>
            </div>

            <form className="rs-login-form-pane" onSubmit={(e) => void handleLogin(e)}>
              <div className="rs-login-head">
                <div className="rs-brand">
                  <span className="rs-brand-mark" aria-hidden="true">
                    <Sun size={18} />
                  </span>
                  <div className="rs-brand-text">
                    <strong>Relight Studio</strong>
                    <span>relight.sibluudz.my.id</span>
                  </div>
                </div>
                <h1>Masuk ke Studio</h1>
                <p>Gunakan akun Relight Studio yang diberikan oleh administrator.</p>
              </div>

              {loginError && (
                <div className="rs-alert" role="alert">
                  <AlertTriangle size={16} />
                  <span>{loginError}</span>
                </div>
              )}

              <div className="rs-field">
                <label htmlFor="rs-login-identifier">Username atau Email</label>
                <input
                  id="rs-login-identifier"
                  type="text"
                  className="rs-input"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="contoh: klien01"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="rs-field">
                <label htmlFor="rs-login-password">Kata Sandi</label>
                <div className="rs-password-wrap">
                  <input
                    id="rs-login-password"
                    type={showPassword ? 'text' : 'password'}
                    className="rs-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Masukkan kata sandi"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="rs-password-toggle"
                    aria-label={showPassword ? 'Sembunyikan sandi' : 'Lihat sandi'}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button type="submit" className="rs-primary-btn" disabled={loginBusy}>
                {loginBusy ? <Loader2 size={16} className="rs-spin" /> : <Sparkles size={16} />}
                <span>{loginBusy ? 'Memeriksa akun...' : 'Masuk ke Studio'}</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  const presetList =
    presets.length > 0
      ? presets
      : relightPresets.map((p) => ({
          id: p.id,
          label: p.label,
          description: p.description,
          hasCustomBefore: false,
          hasCustomAfter: false,
          beforeUrl: '',
          afterUrl: '',
        }))

  const activePreset = presetList.find((p) => p.id === settings.preset) || presetList[0]
  const quotaDepleted = !user.isUnlimited && user.remaining <= 0

  return (
    <div className="rs-shell">
      <header className="rs-header">
        <div className="rs-header-inner">
          <div className="rs-brand">
            <span className="rs-brand-mark" aria-hidden="true">
              <Sun size={18} />
            </span>
            <div className="rs-brand-text">
              <strong>Relight Studio</strong>
              <span>AI Photo Lighting</span>
            </div>
          </div>

          <div className="rs-header-actions">
            <span className={`rs-quota-pill${quotaDepleted ? ' is-empty' : ''}`}>
              <Sparkles size={13} />
              {user.isUnlimited ? (
                <>
                  <span className="rs-quota-long">Kuota Unlimited</span>
                  <span className="rs-quota-short">Unlimited</span>
                </>
              ) : (
                <>
                  <span className="rs-quota-long">
                    Sisa {user.remaining}/{user.dailyLimit} hari ini
                  </span>
                  <span className="rs-quota-short">
                    {user.remaining}/{user.dailyLimit}
                  </span>
                </>
              )}
            </span>

            <span className="rs-user-chip">
              <User size={13} />
              <span>{user.name || user.username}</span>
            </span>

            <button
              type="button"
              className="rs-ghost-btn"
              aria-label="Keluar"
              onClick={() => void handleLogout()}
            >
              <LogOut size={14} />
              <span className="rs-logout-label">Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="rs-main">
        {!configured && (
          <div className="rs-alert is-warn" role="alert" style={{ marginBottom: 18 }}>
            <AlertTriangle size={16} />
            <span>Mesin AI 9router belum dikonfigurasi oleh admin. Hubungi administrator untuk mengaktifkan proses edit.</span>
          </div>
        )}

        {/* Stage 2: Feature Selection Gallery with Before/After Slider */}
        {stage === 'picker' && (
          <>
            <div className="rs-stage-intro">
              <span className="rs-eyebrow">Langkah 1 dari 2 · Pilih Gaya Pencahayaan</span>
              <h1>Pilih Efek Relight Foto</h1>
              <p>
                Geser foto Before / After di tiap kartu untuk melihat karakter cahaya, lalu klik fitur yang ingin digunakan.
              </p>
            </div>

            <section className="rs-preset-grid" aria-label="Pilihan efek Relight">
              {presetList.map((preset) => {
                const samples = resolvePresetSamples(preset)
                return (
                  <article key={preset.id} className="rs-preset-card">
                    <div className="rs-preset-media">
                      <BeforeAfterSlider
                        beforeSrc={samples.beforeUrl}
                        afterSrc={samples.afterUrl}
                        beforeLabel="Before"
                        afterLabel="After"
                        interactiveCard
                        ariaLabel={`Contoh Before After ${preset.label}`}
                      />
                      {(preset.hasCustomBefore || preset.hasCustomAfter) && (
                        <span className="rs-preset-badge">Sample Studio</span>
                      )}
                    </div>
                    <div className="rs-preset-body">
                      <div className="rs-preset-copy">
                        <h2>{preset.label}</h2>
                        <p>{preset.description}</p>
                      </div>
                      <button
                        type="button"
                        className="rs-preset-cta"
                        onClick={() => handleChoosePreset(preset.id)}
                      >
                        <Sparkles size={14} />
                        <span>Gunakan {preset.label}</span>
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          </>
        )}

        {/* Stage 3: Photo Editor & Processing */}
        {stage === 'editor' && (
          <>
            <div className="rs-editor-topbar">
              <button
                type="button"
                className="rs-ghost-btn"
                onClick={() => setStage('picker')}
                disabled={processing}
              >
                <ArrowLeft size={15} />
                <span>Pilih Fitur Lain</span>
              </button>

              <span className="rs-active-badge">
                <Sun size={14} />
                <span>Fitur aktif: {activePreset.label}</span>
              </span>
            </div>

            <div className="rs-preset-strip" role="tablist" aria-label="Ganti cepat fitur relight">
              {presetList.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={settings.preset === preset.id}
                  className={`rs-preset-pill${settings.preset === preset.id ? ' is-active' : ''}`}
                  disabled={processing}
                  onClick={() => setSettings((prev) => ({ ...prev, preset: preset.id }))}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {editorError && (
              <div className="rs-alert" role="alert" style={{ marginBottom: 16 }}>
                <AlertTriangle size={16} />
                <span>{editorError}</span>
              </div>
            )}

            <div className="rs-editor-grid">
              {/* Left: Photo Canvas / Before-After Result */}
              <div className="rs-canvas-card">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    handlePhotoFile(e.target.files?.[0])
                    e.currentTarget.value = ''
                  }}
                />

                {!source ? (
                  <div
                    className={`rs-dropzone${draggingFile ? ' is-dragging' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        fileInputRef.current?.click()
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault()
                      setDraggingFile(true)
                    }}
                    onDragLeave={() => setDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault()
                      setDraggingFile(false)
                      handlePhotoFile(e.dataTransfer.files?.[0])
                    }}
                  >
                    <div className="rs-dropzone-icon">
                      <ImagePlus size={24} />
                    </div>
                    <strong>Pilih atau seret foto ke sini</strong>
                    <span>Mendukung JPG, PNG, atau WEBP maksimal 6 MB.</span>
                  </div>
                ) : (
                  <>
                    <div className="rs-viewer-box">
                      {result ? (
                        <BeforeAfterSlider
                          beforeSrc={result.source.data}
                          afterSrc={result.image}
                          beforeLabel="Asli"
                          afterLabel={activePreset.label}
                          position={comparePos}
                          onPositionChange={setComparePos}
                          blendOpacity={strength / 100}
                          objectFit="contain"
                          ariaLabel="Bandingkan hasil relight dengan foto asli"
                        />
                      ) : (
                        <img src={source.data} alt={source.name} className="rs-viewer-single" />
                      )}

                      {processing && (
                        <div className="rs-viewer-busy">
                          <Loader2 size={28} className="rs-spin" />
                          <span>Memproses pencahayaan {activePreset.label}...</span>
                        </div>
                      )}
                    </div>

                    {result && (
                      <div className="rs-strength-bar">
                        <label htmlFor="rs-strength">Kekuatan Efek</label>
                        <input
                          id="rs-strength"
                          type="range"
                          min={0}
                          max={100}
                          value={strength}
                          onChange={(e) => setStrength(Number(e.target.value))}
                        />
                        <span>{strength}%</span>
                      </div>
                    )}

                    <div className="rs-canvas-footer">
                      <button
                        type="button"
                        className="rs-secondary-btn"
                        disabled={processing}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <ImagePlus size={15} />
                        <span>Ganti Foto</span>
                      </button>

                      {result && (
                        <button
                          type="button"
                          className="rs-primary-btn"
                          disabled={exporting || processing}
                          onClick={() => void handleDownloadResult()}
                        >
                          {exporting ? <Loader2 size={15} className="rs-spin" /> : <Download size={15} />}
                          <span>{exporting ? 'Menyiapkan...' : 'Unduh Foto'}</span>
                        </button>
                      )}
                    </div>

                    {result?.warning && (
                      <div className="rs-alert is-warn" role="status">
                        <AlertTriangle size={15} />
                        <span>{result.warning}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Right: Clean Lighting Controls */}
              <div className="rs-controls-card">
                <div className="rs-control-group">
                  <span className="rs-control-label">Intensitas Cahaya</span>
                  <div className="rs-seg-grid">
                    {relightOptions.intensity.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`rs-seg-btn${settings.intensity === opt.id ? ' is-active' : ''}`}
                        disabled={processing}
                        onClick={() => setSettings((prev) => ({ ...prev, intensity: opt.id }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rs-control-group">
                  <span className="rs-control-label">Warna Cahaya</span>
                  <div className="rs-seg-grid">
                    {relightOptions.temperature.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`rs-seg-btn${settings.temperature === opt.id ? ' is-active' : ''}`}
                        disabled={processing}
                        onClick={() => setSettings((prev) => ({ ...prev, temperature: opt.id }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rs-control-group">
                  <span className="rs-control-label">Resolusi Output</span>
                  <div className="rs-seg-grid">
                    {RESOLUTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={`rs-seg-btn${resolution === opt.id ? ' is-active' : ''}`}
                        disabled={processing}
                        onClick={() => setResolution(opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    className="rs-advanced-toggle"
                    onClick={() => setAdvancedOpen((prev) => !prev)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <SlidersHorizontal size={14} />
                      Pengaturan Lanjutan
                    </span>
                    {advancedOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>

                  {advancedOpen && (
                    <div className="rs-advanced-box">
                      <div className="rs-control-group">
                        <span className="rs-control-label">Arah Cahaya</span>
                        <div className="rs-seg-grid">
                          {relightOptions.direction.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`rs-seg-btn${settings.direction === opt.id ? ' is-active' : ''}`}
                              disabled={processing}
                              onClick={() => setSettings((prev) => ({ ...prev, direction: opt.id }))}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rs-control-group">
                        <span className="rs-control-label">Karakter Bayangan</span>
                        <div className="rs-seg-grid">
                          {relightOptions.shadows.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              className={`rs-seg-btn${settings.shadows === opt.id ? ' is-active' : ''}`}
                              disabled={processing}
                              onClick={() => setSettings((prev) => ({ ...prev, shadows: opt.id }))}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="rs-control-group">
                        <label htmlFor="rs-instructions" className="rs-control-label">
                          Arahan Tambahan (Opsional)
                        </label>
                        <textarea
                          id="rs-instructions"
                          className="rs-textarea"
                          maxLength={4000}
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder="Contoh: fokuskan sorotan lembut pada wajah dan jaga background tetap redup."
                          disabled={processing}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="rs-primary-btn"
                  disabled={!source || processing || !configured || quotaDepleted}
                  onClick={() => void handleProcess()}
                >
                  {processing ? <Loader2 size={16} className="rs-spin" /> : <Sparkles size={16} />}
                  <span>
                    {processing
                      ? 'Sedang Memproses...'
                      : quotaDepleted
                        ? 'Kuota Harian Habis'
                        : result
                          ? 'Proses Ulang'
                          : 'Proses Relight'}
                  </span>
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {iosSheet && (
        <div className="rs-modal-backdrop" role="dialog" aria-modal="true" aria-label="Simpan foto iOS">
          <div className="rs-modal">
            <div className="rs-modal-head">
              <strong>Simpan Foto ke iPhone / iPad</strong>
              <button
                type="button"
                className="rs-ghost-btn"
                aria-label="Tutup"
                onClick={() => setIosSheet(null)}
              >
                <X size={15} />
              </button>
            </div>
            <img src={iosSheet.url} alt={iosSheet.filename} className="rs-modal-preview" />
            <div className="rs-result-actions">
              {canShareFile(iosSheet.file) && (
                <button
                  type="button"
                  className="rs-primary-btn"
                  style={{ flex: 1 }}
                  onClick={() => {
                    void navigator.share({ files: [iosSheet.file], title: iosSheet.filename }).catch(() => {})
                  }}
                >
                  <Share2 size={15} />
                  <span>Simpan / Bagikan</span>
                </button>
              )}
              <a
                href={iosSheet.url}
                download={iosSheet.filename}
                className="rs-secondary-btn"
                style={{ flex: 1, textDecoration: 'none' }}
              >
                <Download size={15} />
                <span>Unduh File</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
