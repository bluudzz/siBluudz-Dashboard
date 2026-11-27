import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
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
  ZoomIn,
  ZoomOut,
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
  quotaLimit?: number
  usageToday: number
  usageTotal?: number
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

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 1.25

function getRenderedImageSize(
  viewportWidth: number,
  viewportHeight: number,
  naturalWidth: number,
  naturalHeight: number
) {
  if (viewportWidth <= 0 || viewportHeight <= 0) return { width: 0, height: 0 }
  if (naturalWidth <= 0 || naturalHeight <= 0) {
    return { width: viewportWidth, height: viewportHeight }
  }
  const scale = Math.min(viewportWidth / naturalWidth, viewportHeight / naturalHeight)
  return { width: naturalWidth * scale, height: naturalHeight * scale }
}

function clampPan(x: number, y: number, zoom: number, renderedWidth: number, renderedHeight: number) {
  const maxX = Math.max(0, (renderedWidth * zoom) / 2)
  const maxY = Math.max(0, (renderedHeight * zoom) / 2)
  return {
    x: Math.min(maxX, Math.max(-maxX, x)),
    y: Math.min(maxY, Math.max(-maxY, y)),
  }
}

function getViewportMetrics(el: HTMLElement | null) {
  const box = el?.querySelector<HTMLElement>('.rs-zoom-comparison, .rs-zoom-photo-viewport') ?? el
  if (!box) return null
  const rect = box.getBoundingClientRect()
  const img = box.querySelector('img')
  const rendered = getRenderedImageSize(rect.width, rect.height, img?.naturalWidth ?? 0, img?.naturalHeight ?? 0)
  return { rect, rendered }
}

export function RelightStandaloneApp() {
  const [authChecking, setAuthChecking] = React.useState(true)
  const [user, setUser] = React.useState<RelightUser | null>(null)
  const [configured, setConfigured] = React.useState(true)
  const [presets, setPresets] = React.useState<PresetShowcase[]>([])
  const [heroSample, setHeroSample] = React.useState<{
    label: string
    beforeUrl: string
    afterUrl: string
  } | null>(null)

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
  const [iosSheet, setIosSheet] = React.useState<{
    url: string
    filename: string
    file: File
    bytes: number
    ext: string
  } | null>(null)
  const [view, setView] = React.useState({ zoom: 1, x: 0, y: 0 })
  const [panning, setPanning] = React.useState(false)
  const [viewportSize, setViewportSize] = React.useState({ width: 0, height: 0 })
  const [naturalSize, setNaturalSize] = React.useState({ width: 0, height: 0 })

  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const viewportRef = React.useRef<HTMLElement>(null)
  const comparisonRef = React.useRef<HTMLDivElement>(null)
  const dividerDragRef = React.useRef<number | null>(null)
  const panStartRef = React.useRef<{
    pointerId: number
    clientX: number
    clientY: number
    startX: number
    startY: number
  } | null>(null)

  const resetView = React.useCallback(() => {
    panStartRef.current = null
    setPanning(false)
    setView({ zoom: 1, x: 0, y: 0 })
  }, [])

  const stepZoom = React.useCallback((direction: 1 | -1) => {
    const metrics = getViewportMetrics(viewportRef.current)
    const width = metrics?.rendered.width ?? 0
    const height = metrics?.rendered.height ?? 0
    setView((prev) => {
      const nextZoom = Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, direction > 0 ? prev.zoom * ZOOM_STEP : prev.zoom / ZOOM_STEP)
      )
      if (nextZoom < 1.02 && direction < 0) return { zoom: 1, x: 0, y: 0 }
      const ratio = nextZoom / prev.zoom
      const clamped = clampPan(prev.x * ratio, prev.y * ratio, nextZoom, width, height)
      return { zoom: nextZoom, ...clamped }
    })
  }, [])

  const updateCompareFromClientX = React.useCallback((clientX: number) => {
    const rect = comparisonRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0) return
    const pct = Math.round(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)))
    setComparePos(pct)
  }, [])

  const handleCanvasImageLoad = React.useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = event.currentTarget
    if (naturalWidth > 0 && naturalHeight > 0) {
      setNaturalSize((prev) =>
        prev.width === naturalWidth && prev.height === naturalHeight
          ? prev
          : { width: naturalWidth, height: naturalHeight }
      )
    }
  }, [])

  const loadWorkspace = React.useCallback(async () => {
    const res = await fetch('/api/relight/presets', { credentials: 'same-origin', cache: 'no-store' })
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

  const syncUserSession = React.useCallback(async () => {
    try {
      const res = await fetch('/api/relight/auth/me', {
        credentials: 'same-origin',
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = (await res.json()) as {
        authenticated?: boolean
        user?: RelightUser
        heroSample?: { label: string; beforeUrl: string; afterUrl: string } | null
      }
      if (data?.heroSample !== undefined) {
        setHeroSample(data.heroSample ?? null)
      }
      if (data?.authenticated && data.user) {
        setUser(data.user)
      } else if (data?.authenticated === false) {
        setUser(null)
      }
    } catch {
      // ignore transient network errors during background quota sync
    }
  }, [])

  React.useEffect(() => {
    let active = true
    fetch('/api/relight/auth/me', { credentials: 'same-origin', cache: 'no-store' })
      .then((res) => res.json())
      .then(
        async (data: {
          authenticated?: boolean
          user?: RelightUser
          heroSample?: { label: string; beforeUrl: string; afterUrl: string } | null
        }) => {
          if (!active) return
          setHeroSample(data?.heroSample ?? null)
          if (data?.authenticated && data.user) {
            setUser(data.user)
            await loadWorkspace()
          } else {
            setUser(null)
          }
        }
      )
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

  const isLoggedIn = Boolean(user)

  React.useEffect(() => {
    if (!isLoggedIn) return
    const handleFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncUserSession()
      }
    }
    window.addEventListener('focus', handleFocusOrVisible)
    document.addEventListener('visibilitychange', handleFocusOrVisible)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncUserSession()
      }
    }, 20_000)
    return () => {
      window.removeEventListener('focus', handleFocusOrVisible)
      document.removeEventListener('visibilitychange', handleFocusOrVisible)
      window.clearInterval(timer)
    }
  }, [isLoggedIn, syncUserSession])

  React.useEffect(() => {
    if (!isLoggedIn) return
    const timer = window.setTimeout(() => {
      void syncUserSession()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [stage, isLoggedIn, syncUserSession])

  React.useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>('.rs-zoom-comparison, .rs-zoom-photo-viewport') ?? root
    const measure = () => {
      const rect = target.getBoundingClientRect()
      setViewportSize((prev) =>
        prev.width === rect.width && prev.height === rect.height
          ? prev
          : { width: rect.width, height: rect.height }
      )
    }
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(measure)
      observer.observe(target)
      return () => observer.disconnect()
    }
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [source, result, stage])

  React.useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const metrics = getViewportMetrics(el)
      if (!metrics) return
      const clampedDelta = Math.max(-240, Math.min(240, event.deltaY))
      const factor = Math.pow(1.0018, -clampedDelta)
      const mx = event.clientX - (metrics.rect.left + metrics.rect.width / 2)
      const my = event.clientY - (metrics.rect.top + metrics.rect.height / 2)
      setView((prev) => {
        const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor))
        if (nextZoom < 1.02 && event.deltaY > 0) return { zoom: 1, x: 0, y: 0 }
        const ratio = nextZoom / prev.zoom
        const nextX = prev.x * ratio + mx * (1 - ratio)
        const nextY = prev.y * ratio + my * (1 - ratio)
        const clamped = clampPan(nextX, nextY, nextZoom, metrics.rendered.width, metrics.rendered.height)
        return { zoom: nextZoom, ...clamped }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [source, result, stage])

  React.useEffect(() => {
    if (!iosSheet) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIosSheet(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      URL.revokeObjectURL(iosSheet.url)
    }
  }, [iosSheet])

  const openIosSaveSheet = React.useCallback((blob: Blob, filename: string, ext: string) => {
    const file = new File([blob], filename, { type: blob.type || 'image/png' })
    const url = URL.createObjectURL(blob)
    setIosSheet({ url, filename, file, bytes: blob.size, ext })
  }, [])

  const sharePreparedFile = React.useCallback(
    (file: File, filename: string, onFallback?: () => void) => {
      try {
        const sharePromise = navigator.share({ files: [file], title: filename })
        void sharePromise.catch((err) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          onFallback?.()
        })
      } catch {
        onFallback?.()
      }
    },
    []
  )

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
        setNaturalSize({ width: 0, height: 0 })
        setIosSheet(null)
        setEditorError('')
        resetView()
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
      setIosSheet(null)
      resetView()
      if (data.usage) {
        setUser((prev) =>
          prev
            ? {
                ...prev,
                usageToday: data.usage.usageToday,
                usageTotal: data.usage.usageTotal ?? prev.usageTotal,
                dailyLimit: data.usage.dailyLimit,
                quotaLimit: data.usage.quotaLimit ?? data.usage.dailyLimit,
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
    const filenameBase = `${safeName}-${settings.preset}`
    const ios = isIOSDevice()

    const syncExport = prepareSyncRelightExport({
      sourceDataUrl: result.source.data,
      resultImageUrl: result.image,
      strength,
      resultFormat: result.format,
    })

    if (syncExport) {
      const fullName =
        strength >= 100
          ? `${filenameBase}.${syncExport.ext}`
          : `${filenameBase}-${strength}pct.${syncExport.ext}`
      setEditorError('')

      if (ios) {
        const file = new File([syncExport.blob], fullName, {
          type: syncExport.blob.type || 'image/png',
        })
        if (canShareFile(file)) {
          sharePreparedFile(file, fullName, () =>
            openIosSaveSheet(syncExport.blob, fullName, syncExport.ext)
          )
        } else {
          openIosSaveSheet(syncExport.blob, fullName, syncExport.ext)
        }
        return
      }

      const url = URL.createObjectURL(syncExport.blob)
      const a = document.createElement('a')
      a.href = url
      a.download = fullName
      document.body.appendChild(a)
      a.click()
      window.setTimeout(() => {
        a.remove()
        URL.revokeObjectURL(url)
      }, 60_000)
      return
    }

    setExporting(true)
    setEditorError('')
    try {
      const exported = await exportRelightImage({
        sourceDataUrl: result.source.data,
        resultImageUrl: result.image,
        strength,
        resultFormat: result.format,
      })
      if (!exported) throw new Error('Gagal menyiapkan file foto untuk diunduh.')

      const fullName =
        strength >= 100
          ? `${filenameBase}.${exported.ext}`
          : `${filenameBase}-${strength}pct.${exported.ext}`
      if (ios) {
        openIosSaveSheet(exported.blob, fullName, exported.ext)
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
          <span>Memuat Relight Studio by siBluudz...</span>
        </div>
      </div>
    )
  }

  // Stage 1: Standalone Login Page
  if (!user) {
    const fallbackHero = getPresetDefaultSamples('strobist')
    const heroPreview = heroSample
      ? { beforeUrl: heroSample.beforeUrl, afterUrl: heroSample.afterUrl, label: heroSample.label }
      : { beforeUrl: fallbackHero.beforeUrl, afterUrl: fallbackHero.afterUrl, label: 'Strobist' }
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
                  afterLabel={heroPreview.label}
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
                    <strong>Relight Studio by siBluudz</strong>
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

  const baseRendered = getRenderedImageSize(
    viewportSize.width,
    viewportSize.height,
    naturalSize.width,
    naturalSize.height
  )
  const isTransformed = view.zoom > 1 || view.x !== 0 || view.y !== 0
  let zoomStyle: React.CSSProperties | undefined
  if (isTransformed) {
    if (baseRendered.width > 0 && baseRendered.height > 0) {
      const stageWidth = Math.max(1, Math.round(baseRendered.width * view.zoom))
      const stageHeight = Math.max(1, Math.round(baseRendered.height * view.zoom))
      zoomStyle = {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${stageWidth}px`,
        height: `${stageHeight}px`,
        marginLeft: `${Math.round(-stageWidth / 2 + view.x)}px`,
        marginTop: `${Math.round(-stageHeight / 2 + view.y)}px`,
      }
    } else {
      const pct = Math.round(view.zoom * 100)
      zoomStyle = {
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: `${pct}%`,
        height: `${pct}%`,
        marginLeft: `${Math.round(view.x)}px`,
        marginTop: `${Math.round(view.y)}px`,
        transform: 'translate(-50%, -50%)',
      }
    }
  }

  return (
    <div className="rs-shell">
      <header className="rs-header">
        <div className="rs-header-inner">
          <div className="rs-brand">
            <span className="rs-brand-mark" aria-hidden="true">
              <Sun size={18} />
            </span>
            <div className="rs-brand-text">
              <strong>Relight Studio by siBluudz</strong>
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
                    Sisa Kuota {user.remaining}/{user.dailyLimit}
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
                    <div className="rs-zoom-toolbar">
                      <span className="rs-zoom-hint">
                        {isTransformed
                          ? 'Geser foto · klik ganda untuk reset'
                          : 'Scroll untuk zoom · tarik pemisah di tengah'}
                      </span>
                      <div className="rs-zoom-controls" role="group" aria-label="Kontrol zoom foto">
                        <button
                          type="button"
                          className="rs-zoom-btn"
                          aria-label="Perkecil zoom"
                          disabled={view.zoom <= MIN_ZOOM}
                          onClick={() => stepZoom(-1)}
                        >
                          <ZoomOut size={14} />
                        </button>
                        <button
                          type="button"
                          className="rs-zoom-reset"
                          title="Reset zoom ke 100%"
                          onClick={() => resetView()}
                        >
                          {Math.round(view.zoom * 100)}%
                        </button>
                        <button
                          type="button"
                          className="rs-zoom-btn"
                          aria-label="Perbesar zoom"
                          disabled={view.zoom >= MAX_ZOOM}
                          onClick={() => stepZoom(1)}
                        >
                          <ZoomIn size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="rs-viewer-box">
                      <figure
                        ref={viewportRef}
                        className="rs-zoom-viewport"
                        data-zoomed={view.zoom > 1}
                        data-transformed={isTransformed}
                        data-panning={panning}
                        onDoubleClick={() => {
                          if (isTransformed) resetView()
                        }}
                        onPointerDown={(event) => {
                          if (event.pointerType === 'touch' && view.zoom <= 1) return
                          if (event.button !== 0 && event.button !== 1) return
                          const targetEl = event.target as HTMLElement | null
                          if (targetEl?.closest('.rs-zoom-divider')) return
                          event.preventDefault()
                          panStartRef.current = {
                            pointerId: event.pointerId,
                            clientX: event.clientX,
                            clientY: event.clientY,
                            startX: view.x,
                            startY: view.y,
                          }
                          event.currentTarget.setPointerCapture(event.pointerId)
                          setPanning(true)
                        }}
                        onPointerMove={(event) => {
                          const start = panStartRef.current
                          if (!start || start.pointerId !== event.pointerId) return
                          const metrics = getViewportMetrics(event.currentTarget)
                          const width = metrics?.rendered.width ?? 0
                          const height = metrics?.rendered.height ?? 0
                          const dx = event.clientX - start.clientX
                          const dy = event.clientY - start.clientY
                          const clamped = clampPan(start.startX + dx, start.startY + dy, view.zoom, width, height)
                          setView((prev) => ({ ...prev, ...clamped }))
                        }}
                        onPointerUp={(event) => {
                          if (panStartRef.current?.pointerId !== event.pointerId) return
                          panStartRef.current = null
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId)
                          }
                          setPanning(false)
                        }}
                        onPointerCancel={(event) => {
                          if (panStartRef.current?.pointerId !== event.pointerId) return
                          panStartRef.current = null
                          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                            event.currentTarget.releasePointerCapture(event.pointerId)
                          }
                          setPanning(false)
                        }}
                      >
                        {result ? (
                          <div ref={comparisonRef} className="rs-zoom-comparison">
                            {/* Kanan: Hasil Relight (terlihat di kanan garis pembatas) */}
                            <div className="rs-zoom-stage" style={zoomStyle}>
                              <img
                                src={result.source.data}
                                alt="Foto dasar pembanding"
                                decoding="sync"
                                draggable={false}
                                onLoad={handleCanvasImageLoad}
                              />
                              <img
                                className="rs-zoom-blended"
                                src={result.image}
                                alt={`Hasil ${activePreset.label}`}
                                style={{ opacity: strength / 100 }}
                                decoding="sync"
                                draggable={false}
                              />
                            </div>

                            {/* Kiri: Foto Asli (dibatasi sampai garis tengah) */}
                            <div
                              className="rs-zoom-original"
                              style={{ clipPath: `inset(0 ${100 - comparePos}% 0 0)` }}
                            >
                              <div className="rs-zoom-stage" style={zoomStyle}>
                                <img
                                  src={result.source.data}
                                  alt="Foto asli"
                                  decoding="sync"
                                  draggable={false}
                                />
                              </div>
                            </div>

                            <span className="rs-compare-tag is-before">Asli</span>
                            <span className="rs-compare-tag is-after">
                              {strength < 100 ? `${activePreset.label} (${strength}%)` : activePreset.label}
                            </span>

                            <div
                              className="rs-zoom-divider"
                              role="slider"
                              tabIndex={0}
                              aria-label="Geser pembatas foto asli dan hasil"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={comparePos}
                              style={{ left: `${comparePos}%` }}
                              onDoubleClick={(event) => event.stopPropagation()}
                              onPointerDown={(event) => {
                                if (event.button !== 0) return
                                event.stopPropagation()
                                event.preventDefault()
                                dividerDragRef.current = event.pointerId
                                event.currentTarget.setPointerCapture(event.pointerId)
                                updateCompareFromClientX(event.clientX)
                              }}
                              onPointerMove={(event) => {
                                if (dividerDragRef.current !== event.pointerId) return
                                event.stopPropagation()
                                updateCompareFromClientX(event.clientX)
                              }}
                              onPointerUp={(event) => {
                                if (dividerDragRef.current !== event.pointerId) return
                                event.stopPropagation()
                                dividerDragRef.current = null
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                  event.currentTarget.releasePointerCapture(event.pointerId)
                                }
                              }}
                              onPointerCancel={(event) => {
                                if (dividerDragRef.current !== event.pointerId) return
                                dividerDragRef.current = null
                                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                                  event.currentTarget.releasePointerCapture(event.pointerId)
                                }
                              }}
                              onKeyDown={(event) => {
                                const step = event.shiftKey ? 10 : 2
                                if (event.key === 'ArrowLeft') {
                                  event.preventDefault()
                                  setComparePos((prev) => Math.max(0, prev - step))
                                } else if (event.key === 'ArrowRight') {
                                  event.preventDefault()
                                  setComparePos((prev) => Math.min(100, prev + step))
                                } else if (event.key === 'Home') {
                                  event.preventDefault()
                                  setComparePos(0)
                                } else if (event.key === 'End') {
                                  event.preventDefault()
                                  setComparePos(100)
                                }
                              }}
                            >
                              <span aria-hidden="true">
                                <ArrowLeftRight size={15} />
                              </span>
                            </div>
                          </div>
                        ) : (
                          <div className="rs-zoom-photo-viewport">
                            <div className="rs-zoom-stage" style={zoomStyle}>
                              <img
                                src={source.data}
                                alt={source.name}
                                decoding="sync"
                                draggable={false}
                                onLoad={handleCanvasImageLoad}
                              />
                            </div>
                          </div>
                        )}
                      </figure>

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
                          onChange={(e) => {
                            setStrength(Number(e.target.value))
                            setIosSheet(null)
                          }}
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
                        ? 'Saldo Kuota Habis'
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
        <div
          className="rs-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Simpan foto iOS"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIosSheet(null)
          }}
        >
          <div className="rs-modal">
            <div className="rs-modal-head">
              <div>
                <strong>Simpan Foto</strong>
                <div className="rs-modal-meta">
                  {iosSheet.ext.toUpperCase()} ·{' '}
                  {iosSheet.bytes >= 1024 * 1024
                    ? `${(iosSheet.bytes / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.ceil(iosSheet.bytes / 1024)} KB`}
                </div>
              </div>
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
            <p className="rs-modal-hint">
              Tekan &amp; tahan gambar di atas lalu pilih <strong>Simpan ke Foto</strong>, atau ketuk tombol di bawah.
            </p>
            <div className="rs-result-actions">
              {canShareFile(iosSheet.file) && (
                <button
                  type="button"
                  className="rs-primary-btn"
                  style={{ flex: 1 }}
                  onClick={() => sharePreparedFile(iosSheet.file, iosSheet.filename)}
                >
                  <Share2 size={15} />
                  <span>Simpan ke Galeri / Bagikan</span>
                </button>
              )}
              <a
                href={iosSheet.url}
                download={iosSheet.filename}
                target="_blank"
                rel="noreferrer"
                className="rs-secondary-btn"
                style={{ flex: 1, textDecoration: 'none' }}
              >
                <Download size={15} />
                <span>Unduh / Buka File</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
