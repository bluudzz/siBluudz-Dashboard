import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  Camera,
  Check,
  ChevronDown,
  Download,
  Eclipse,
  Film,
  ImagePlus,
  LampDesk,
  RefreshCw,
  Search,
  Share2,
  Square,
  Sun,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { defaultRelightSettings, relightOptions, relightPresets } from '../../../shared/relight.js'
import type { RelightResolution, RelightSettings } from '../../../shared/relight.js'
import { curateImageModels } from '../../../shared/model-catalog.js'
import {
  canShareFile,
  exportRelightImage,
  isIOSDevice,
  prepareSyncRelightExport,
} from './relight-export.ts'
import './relight-studio.css'

interface Usage {
  usageToday: number
  dailyLimit: number
  remaining: number
}

interface Props {
  active: boolean
  configured: boolean
  statusLoading: boolean
  quotaDepleted: boolean
  defaultModel?: string
  initialSource?: SourcePhoto | null
  busy: boolean
  pane?: 'input' | 'result'
  onResult?: () => void
  onBusyChange: (busy: boolean) => void
  onUsage: (usage: Usage) => void
}

interface SourcePhoto {
  data: string
  name: string
}

interface ImageOutput {
  width: number
  height: number
  bytes: number
  format: string
  requestedResolution: RelightResolution | null
  resolutionMatched: boolean | null
}

interface RelightResult {
  image: string
  source: SourcePhoto
  model: string
  output: ImageOutput | null
  warning?: string
}

const settingLabels: Record<Exclude<keyof RelightSettings, 'preset'>, string> = {
  intensity: 'Intensitas',
  temperature: 'Warna cahaya',
  shadows: 'Bayangan',
  pattern: 'Pola bayangan',
  direction: 'Arah cahaya',
}

const presetIcons = {
  strobist: LampDesk,
  direct_flash: Camera,
  film_flash: Film,
  softbox: Square,
  backlit_rim: Eclipse,
}

type ResolutionChoice = 'auto' | Exclude<RelightResolution, '1K'>

const resolutionChoices: { id: ResolutionChoice; label: string }[] = [
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
  const box = el?.querySelector<HTMLElement>('.relight-comparison, .relight-photo-viewport') ?? el
  if (!box) return null
  const rect = box.getBoundingClientRect()
  const img = box.querySelector('img')
  const rendered = getRenderedImageSize(rect.width, rect.height, img?.naturalWidth ?? 0, img?.naturalHeight ?? 0)
  return { rect, rendered }
}

function LightingChoices({
  setting,
  value,
  disabled,
  onChange,
}: {
  setting: keyof typeof relightOptions
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <fieldset
      className={`relight-choice-field${setting === 'pattern' ? ' relight-choice-wide' : ''}`}
      disabled={disabled}
    >
      <legend>{settingLabels[setting]}</legend>
      <div className="relight-segments">
        {relightOptions[setting].map((option) => (
          <label key={option.id}>
            <input
              type="radio"
              name={`relight-${setting}`}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function RelightStudio({
  active,
  configured,
  statusLoading,
  quotaDepleted,
  defaultModel,
  initialSource = null,
  busy,
  pane = 'input',
  onResult,
  onBusyChange,
  onUsage,
}: Props) {
  const [source, setSource] = React.useState<SourcePhoto | null>(initialSource)
  const [settings, setSettings] = React.useState<RelightSettings>({ ...defaultRelightSettings })
  const [resolution, setResolution] = React.useState<ResolutionChoice>('auto')
  const [instructions, setInstructions] = React.useState('')
  const [model, setModel] = React.useState(() => {
    try {
      return localStorage.getItem('sibluudz_relight_model') || defaultModel || ''
    } catch {
      return defaultModel || ''
    }
  })
  const [catalog, setCatalog] = React.useState({ key: '', models: [] as string[], error: '' })
  const [syncVersion, setSyncVersion] = React.useState(0)
  const [modelOpen, setModelOpen] = React.useState(false)
  const [modelSearch, setModelSearch] = React.useState('')
  const [showLegacyModels, setShowLegacyModels] = React.useState(false)
  const lastSyncRef = React.useRef(0)
  const modelPickerRef = React.useRef<HTMLDivElement>(null)
  const modelTriggerRef = React.useRef<HTMLButtonElement>(null)
  const catalogKey = `${defaultModel || ''}:${syncVersion}`
  const modelsLoading = active && catalog.key !== catalogKey
  const [error, setError] = React.useState('')
  const [reading, setReading] = React.useState(false)
  const [dragging, setDragging] = React.useState(false)
  const [result, setResult] = React.useState<RelightResult | null>(null)
  const [comparePosition, setComparePosition] = React.useState(50)
  const [strength, setStrength] = React.useState(100)
  const [exporting, setExporting] = React.useState(false)
  const [lastExport, setLastExport] = React.useState<{ bytes: number; ext: string } | null>(null)
  const [iosSaveSheet, setIosSaveSheet] = React.useState<{
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
  const fileRef = React.useRef<HTMLInputElement>(null)
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
      const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, direction > 0 ? prev.zoom * ZOOM_STEP : prev.zoom / ZOOM_STEP))
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
    setComparePosition(pct)
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

  React.useEffect(() => {
    const root = viewportRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>('.relight-comparison, .relight-photo-viewport') ?? root
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
  }, [source, result])

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
  }, [source])

  React.useEffect(() => {
    if (!iosSaveSheet) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIosSaveSheet(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      URL.revokeObjectURL(iosSaveSheet.url)
    }
  }, [iosSaveSheet])

  const openIosSaveSheet = React.useCallback((blob: Blob, filename: string, ext: string) => {
    const file = new File([blob], filename, { type: blob.type || 'image/png' })
    const url = URL.createObjectURL(blob)
    setIosSaveSheet({ url, filename, file, bytes: blob.size, ext })
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
    [],
  )

  const handleDownloadResult = React.useCallback(async () => {
    if (!result) return

    const triggerDownload = (href: string, filename: string, openExternal = false) => {
      const link = document.createElement('a')
      link.href = href
      if (openExternal) {
        link.target = '_blank'
        link.rel = 'noreferrer'
      } else {
        link.download = filename
      }
      document.body.appendChild(link)
      link.click()
      link.remove()
    }

    const ios = isIOSDevice()
    const syncExported = prepareSyncRelightExport({
      sourceDataUrl: result.source.data,
      resultImageUrl: result.image,
      strength,
      resultFormat: result.output?.format,
    })

    if (syncExported) {
      const filename =
        strength >= 100
          ? `sibluudz-relight.${syncExported.ext}`
          : `sibluudz-relight-${strength}pct.${syncExported.ext}`
      setLastExport({ bytes: syncExported.blob.size, ext: syncExported.ext })
      setError('')

      if (ios) {
        const file = new File([syncExported.blob], filename, {
          type: syncExported.blob.type || 'image/png',
        })
        if (canShareFile(file)) {
          sharePreparedFile(file, filename, () =>
            openIosSaveSheet(syncExported.blob, filename, syncExported.ext),
          )
        } else {
          openIosSaveSheet(syncExported.blob, filename, syncExported.ext)
        }
        return
      }

      const url = URL.createObjectURL(syncExported.blob)
      triggerDownload(url, filename)
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
      return
    }

    setExporting(true)
    setError('')
    try {
      const exported = await exportRelightImage({
        sourceDataUrl: result.source.data,
        resultImageUrl: result.image,
        strength,
        resultFormat: result.output?.format,
      })

      if (!exported) {
        triggerDownload(result.image, 'sibluudz-relight.png', result.image.startsWith('http'))
        return
      }

      const filename =
        strength >= 100
          ? `sibluudz-relight.${exported.ext}`
          : `sibluudz-relight-${strength}pct.${exported.ext}`
      setLastExport({ bytes: exported.blob.size, ext: exported.ext })

      if (ios) {
        openIosSaveSheet(exported.blob, filename, exported.ext)
        return
      }

      const url = URL.createObjectURL(exported.blob)
      triggerDownload(url, filename)
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Gagal mengekspor gambar. Coba lagi atau gunakan kekuatan 100%.',
      )
    } finally {
      setExporting(false)
    }
  }, [result, strength, openIosSaveSheet, sharePreparedFile])

  const activePreset = relightPresets.find((preset) => preset.id === settings.preset)!
  const curatedCatalog = React.useMemo(() => curateImageModels(catalog.models), [catalog.models])
  const selectedModel = curatedCatalog.all.includes(model) ? model : ''
  const visibleModels = React.useMemo(
    () => (showLegacyModels ? curatedCatalog.all : curatedCatalog.latest),
    [showLegacyModels, curatedCatalog]
  )
  const filteredModels = visibleModels.filter((id) =>
    id.toLowerCase().includes(modelSearch.toLowerCase())
  )

  React.useEffect(() => {
    if (!active) return
    const controller = new AbortController()
    fetch('/api/ai/image-models', { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => {
          throw new Error(`Katalog model gambar gagal dimuat (${response.status}).`)
        })
        if (!response.ok || data.error) throw new Error(data.error || 'Katalog model gambar gagal dimuat.')
        const available: string[] = Array.isArray(data.models)
          ? [...new Set<string>(data.models.filter((value: unknown) => typeof value === 'string' && value.trim()))]
          : []
        const curated = curateImageModels(available)
        lastSyncRef.current = Date.now()
        setCatalog({ key: catalogKey, models: curated.all, error: '' })
        setModel(
          (previous) =>
            [previous, defaultModel, data.defaultModel].find((id) =>
              Boolean(id && curated.latest.includes(id))
            ) ||
            curated.latest[0] ||
            available[0] ||
            ''
        )
      })
      .catch((reason) => {
        if (controller.signal.aborted) return
        setCatalog((previous) => ({
          ...previous,
          key: catalogKey,
          error: reason instanceof Error ? reason.message : 'Katalog gagal dimuat.',
        }))
      })
    return () => controller.abort()
  }, [active, defaultModel, catalogKey])

  React.useEffect(() => {
    if (!modelOpen) return
    const closeOutside = (event: PointerEvent) => {
      if (!modelPickerRef.current?.contains(event.target as Node)) setModelOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [modelOpen])

  const choosePhoto = async (file?: File) => {
    if (!file) return
    setError('')
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setError('Gunakan foto PNG, JPG, atau WEBP.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setError('Ukuran foto maksimal 6 MB.')
      return
    }
    setReading(true)
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('Foto gagal dibaca. Pilih ulang file.'))
        reader.readAsDataURL(file)
      })
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () =>
          image.naturalWidth * image.naturalHeight <= 40000000
            ? resolve()
            : reject(new Error('Resolusi foto maksimal 40 megapiksel.'))
        image.onerror = () => reject(new Error('File tidak dapat dibaca sebagai foto.'))
        image.src = data
      })
      setSource({ data, name: file.name })
      setResult(null)
      setNaturalSize({ width: 0, height: 0 })
      setComparePosition(50)
      setStrength(100)
      setLastExport(null)
      setIosSaveSheet(null)
      resetView()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gagal membaca foto.')
    } finally {
      setReading(false)
    }
  }

  const blockedReason = statusLoading
    ? 'Menunggu status koneksi.'
    : !configured
    ? 'Koneksi AI belum siap.'
    : quotaDepleted
    ? 'Kuota harian sudah habis.'
    : reading
    ? 'Membaca foto sumber...'
    : !source
    ? 'Unggah satu foto sumber untuk melanjutkan.'
    : modelsLoading
    ? 'Memuat katalog model AI.'
    : !selectedModel
    ? 'Sinkronkan katalog dan pilih model AI generator gambar.'
    : ''

  const generate = async () => {
    if (busy || blockedReason || !source) return
    onBusyChange(true)
    onResult?.()
    setError('')
    try {
      const response = await fetch('/api/ai/image-relight', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceImage: source.data,
          settings,
          instructions,
          model: selectedModel,
          ...(resolution !== 'auto' ? { resolution } : {}),
        }),
      })
      const data = await response.json().catch(() => {
        throw new Error(`Server tidak mengembalikan hasil pengeditan (${response.status}). Coba lagi.`)
      })
      if (!response.ok) throw new Error(data.error || `Pengeditan lighting gagal (${response.status}).`)
      if (typeof data.image !== 'string' || !/^(data:image\/|https?:\/\/)/.test(data.image)) {
        throw new Error('Model tidak mengembalikan gambar yang valid.')
      }
      setResult({
        image: data.image,
        source,
        model: data.model,
        output: data.output || null,
        warning: data.warning,
      })
      setComparePosition(50)
      setStrength(100)
      setLastExport(null)
      setIosSaveSheet(null)
      resetView()
      onResult?.()
      if (data.usage) onUsage(data.usage)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Pengeditan lighting gagal. Coba lagi.')
    } finally {
      onBusyChange(false)
    }
  }

  const baseRendered = getRenderedImageSize(
    viewportSize.width,
    viewportSize.height,
    naturalSize.width,
    naturalSize.height
  )
  const photoAspectRatio =
    naturalSize.width > 0 && naturalSize.height > 0
      ? Math.min(16 / 9, Math.max(9 / 19.5, naturalSize.width / naturalSize.height))
      : null
  const sourceContainerStyle = photoAspectRatio
    ? ({ '--relight-photo-ratio': String(photoAspectRatio) } as React.CSSProperties)
    : undefined
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

  const submitAction = (
    <>
      {!busy && blockedReason && <p className="ag-disabled-reason">{blockedReason}</p>}
      <button
        type="button"
        className="ag-primary-btn relight-submit"
        disabled={busy || !!blockedReason}
        onClick={() => void generate()}
      >
        {busy ? (
          <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
        ) : (
          <Sun size={16} aria-hidden="true" />
        )}
        <span>{busy ? 'Mengatur pencahayaan...' : 'Terapkan lighting'}</span>
      </button>
    </>
  )

  return (
    <div className="relight-workspace" data-pane={pane} hidden={!active}>
      <input
        ref={fileRef}
        id="relight-photo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        hidden
        disabled={busy || reading}
        onChange={(event) => {
          void choosePhoto(event.target.files?.[0])
          event.target.value = ''
        }}
      />

      <section className="relight-controls" aria-label="Pengaturan Relight Studio">
        <div className="relight-controls-body">
          <div
            className="relight-model-field"
            ref={modelPickerRef}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                setModelOpen(false)
                modelTriggerRef.current?.focus()
              }
            }}
          >
            <label id="relight-model-label">Model gambar</label>
            <div className="relight-model-row">
              <button
                type="button"
                ref={modelTriggerRef}
                id="relight-model"
                className="relight-model-trigger"
                aria-labelledby="relight-model-label relight-model-value"
                aria-haspopup="dialog"
                aria-expanded={active && modelOpen}
                aria-controls="relight-model-menu"
                disabled={busy || modelsLoading || !catalog.models.length}
                onClick={() => {
                  const willOpen = !modelOpen
                  setModelSearch('')
                  setModelOpen(willOpen)
                  if (willOpen && !modelsLoading && Date.now() - lastSyncRef.current > 15_000) {
                    setSyncVersion((version) => version + 1)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault()
                    setModelSearch('')
                    setModelOpen(true)
                  }
                }}
              >
                <span id="relight-model-value">
                  {modelsLoading ? 'Memuat model...' : selectedModel || 'Model gambar belum tersedia'}
                </span>
                <ChevronDown size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="ag-icon-btn"
                disabled={busy || modelsLoading}
                aria-label="Sinkronkan model AI"
                onClick={() => {
                  setModelOpen(false)
                  setSyncVersion((version) => version + 1)
                }}
              >
                <RefreshCw size={14} className={modelsLoading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>

            {active && modelOpen && (
              <div
                className="relight-model-menu"
                id="relight-model-menu"
                role="dialog"
                aria-label="Pilih model AI"
              >
                <label className="ag-search-box">
                  <Search size={14} aria-hidden="true" />
                  <input
                    autoFocus
                    aria-label="Cari model AI gambar"
                    placeholder="Cari model gambar..."
                    value={modelSearch}
                    onChange={(event) => setModelSearch(event.target.value)}
                  />
                </label>
                <div className="relight-model-options">
                  {filteredModels.map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={selectedModel === id}
                      onClick={() => {
                        setModel(id)
                        try {
                          localStorage.setItem('sibluudz_relight_model', id)
                        } catch {
                          /* Selection remains usable without local storage. */
                        }
                        setModelOpen(false)
                        modelTriggerRef.current?.focus()
                      }}
                    >
                      <span>{id}</span>
                      {selectedModel === id && <Check size={14} aria-hidden="true" />}
                    </button>
                  ))}
                  {!filteredModels.length && <p className="ag-empty-note">Model tidak ditemukan.</p>}
                </div>
                {curatedCatalog.legacy.length > 0 && (
                  <button
                    type="button"
                    className="ag-model-legacy-toggle"
                    onClick={() => setShowLegacyModels((previous) => !previous)}
                  >
                    {showLegacyModels
                      ? 'Hanya tampilkan model terbaru'
                      : `Tampilkan ${curatedCatalog.legacy.length} model versi lama`}
                  </button>
                )}
              </div>
            )}

            {catalog.error ? (
              <p className="relight-model-error" role="alert">
                {catalog.error} Coba sinkronkan ulang.
              </p>
            ) : (
              <p className="relight-helper-note">
                {curatedCatalog.latest.length} model gambar terbaru dari 9router.
              </p>
            )}
          </div>

          <fieldset className="relight-presets" disabled={busy}>
            <legend>Gaya pencahayaan</legend>
            <div className="relight-preset-grid">
              {relightPresets.map((preset) => {
                const Icon = presetIcons[preset.id as keyof typeof presetIcons]
                const isSelected = settings.preset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={isSelected}
                    title={preset.description}
                    onClick={() => setSettings((previous) => ({ ...previous, preset: preset.id }))}
                  >
                    <Icon className="relight-preset-icon" size={16} aria-hidden="true" />
                    <span>{preset.label}</span>
                    {isSelected && <Check className="relight-preset-check" size={11} aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
            <p className="relight-preset-desc">{activePreset.description}</p>
          </fieldset>

          <div className="relight-settings-grid">
            {(['intensity', 'temperature', 'shadows'] as const).map((key) => (
              <LightingChoices
                key={key}
                setting={key}
                value={settings[key]}
                disabled={busy}
                onChange={(value) => setSettings((previous) => ({ ...previous, [key]: value }))}
              />
            ))}

            <div className="relight-setting">
              <label htmlFor="relight-direction">Arah cahaya</label>
              <div className="relight-select">
                <select
                  id="relight-direction"
                  disabled={busy}
                  value={settings.direction}
                  onChange={(event) =>
                    setSettings((previous) => ({ ...previous, direction: event.target.value }))
                  }
                >
                  {relightOptions.direction.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} aria-hidden="true" />
              </div>
            </div>

            <fieldset className="relight-choice-field relight-choice-wide" disabled={busy}>
              <legend>Resolusi output</legend>
              <div className="relight-segments">
                {resolutionChoices.map((choice) => (
                  <label key={choice.id}>
                    <input
                      type="radio"
                      name="relight-resolution"
                      value={choice.id}
                      checked={resolution === choice.id}
                      onChange={() => setResolution(choice.id)}
                    />
                    <span>{choice.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <label className="relight-instructions" htmlFor="relight-instructions">
            Arahan tambahan <span>(opsional)</span>
            <textarea
              id="relight-instructions"
              rows={2}
              maxLength={4000}
              disabled={busy}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Contoh: pertahankan ambient hangat ruangan."
            />
          </label>
        </div>

        <div className="relight-controls-footer">{submitAction}</div>
      </section>

      <section className="relight-result" aria-labelledby="relight-result-heading" aria-busy={busy}>
        <div className="relight-canvas-header">
          <div className="relight-canvas-title">
            <h2 id="relight-result-heading">Kanvas foto</h2>
            {source && <span title={source.name}>{source.name}</span>}
          </div>
          {source && (
            <div className="relight-source-actions">
              <div className="relight-zoom-controls" role="group" aria-label="Kontrol zoom foto">
                <button
                  type="button"
                  className="relight-zoom-btn"
                  aria-label="Perkecil foto"
                  title="Perkecil"
                  disabled={view.zoom <= MIN_ZOOM}
                  onClick={() => stepZoom(-1)}
                >
                  <ZoomOut size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="relight-zoom-pct"
                  aria-label={`Zoom ${Math.round(view.zoom * 100)} persen, klik untuk reset`}
                  title="Reset posisi & zoom ke 100%"
                  disabled={!isTransformed}
                  onClick={resetView}
                >
                  {Math.round(view.zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="relight-zoom-btn"
                  aria-label="Perbesar foto"
                  title="Perbesar"
                  disabled={view.zoom >= MAX_ZOOM}
                  onClick={() => stepZoom(1)}
                >
                  <ZoomIn size={14} aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                className="ag-text-btn"
                disabled={busy || reading}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus size={15} aria-hidden="true" />
                <span>Ganti foto</span>
              </button>
              <button
                type="button"
                className="ag-icon-btn"
                disabled={busy || reading}
                aria-label="Hapus foto sumber"
                onClick={() => {
                  setSource(null)
                  setResult(null)
                  setNaturalSize({ width: 0, height: 0 })
                  setLastExport(null)
      setIosSaveSheet(null)
                  setError('')
                  resetView()
                }}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <div
          className="relight-source"
          data-has-source={Boolean(source)}
          data-dragging={dragging}
          style={sourceContainerStyle}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) {
              event.preventDefault()
              if (!busy && !reading) {
                event.dataTransfer.dropEffect = 'copy'
                setDragging(true)
              }
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
          }}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            if (!busy && !reading) void choosePhoto(event.dataTransfer.files[0])
          }}
        >
          {source ? (
            <figure
              ref={viewportRef}
              className="relight-result-photo"
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
                if (targetEl?.closest('.relight-comparison-divider')) return
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
                <div ref={comparisonRef} className="relight-comparison">
                  <div className="relight-zoom-stage" style={zoomStyle}>
                    <img
                      src={result.source.data}
                      alt="Foto dasar pembanding lighting"
                      decoding="sync"
                      draggable={false}
                      onLoad={handleCanvasImageLoad}
                    />
                    <img
                      className="relight-comparison-blended"
                      src={result.image}
                      alt="Foto hasil perubahan lighting"
                      style={{ opacity: strength / 100 }}
                      decoding="sync"
                      draggable={false}
                    />
                  </div>
                  <div
                    className="relight-comparison-original"
                    style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
                  >
                    <div className="relight-zoom-stage" style={zoomStyle}>
                      <img
                        src={result.source.data}
                        alt="Foto asli dari hasil terakhir"
                        decoding="sync"
                        draggable={false}
                      />
                    </div>
                  </div>
                  <div className="relight-comparison-labels" aria-hidden="true">
                    <span>Asli</span>
                    <span>{strength < 100 ? `Hasil (${strength}%)` : 'Hasil'}</span>
                  </div>
                  <div
                    className="relight-comparison-divider"
                    role="slider"
                    tabIndex={0}
                    aria-label="Posisi pembanding foto asli dan hasil"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={comparePosition}
                    aria-valuetext={`${comparePosition}% foto asli, ${100 - comparePosition}% hasil lighting (${strength}%)`}
                    style={{ left: `${comparePosition}%` }}
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
                        setComparePosition((prev) => Math.max(0, prev - step))
                      } else if (event.key === 'ArrowRight') {
                        event.preventDefault()
                        setComparePosition((prev) => Math.min(100, prev + step))
                      } else if (event.key === 'Home') {
                        event.preventDefault()
                        setComparePosition(0)
                      } else if (event.key === 'End') {
                        event.preventDefault()
                        setComparePosition(100)
                      }
                    }}
                  >
                    <span aria-hidden="true">
                      <ArrowLeftRight size={15} />
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relight-photo-viewport">
                  <div className="relight-zoom-stage" style={zoomStyle}>
                    <img
                      src={source.data}
                      alt="Foto sumber"
                      decoding="sync"
                      draggable={false}
                      onLoad={handleCanvasImageLoad}
                    />
                  </div>
                </div>
              )}
            </figure>
          ) : (
            <button
              type="button"
              className="relight-photo-picker"
              aria-label="Unggah foto sumber"
              disabled={busy || reading}
              onClick={() => fileRef.current?.click()}
            >
              <span className="relight-picker-badge">
                <ImagePlus size={26} aria-hidden="true" />
              </span>
              <strong>{reading ? 'Membaca foto...' : 'Pilih atau seret foto ke sini'}</strong>
              <span>PNG, JPG, WEBP · maks. 6 MB / 40 MP</span>
            </button>
          )}

          {busy && (
            <div className="relight-progress" role="status">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
              <p>Mengubah pencahayaan foto sumber...</p>
              <span>Hasil akan tampil sebagai perbandingan sebelum dan sesudah.</span>
            </div>
          )}
        </div>

        <div className="relight-mobile-submit">{submitAction}</div>

        {result && (
          <div className="relight-strength-bar" role="group" aria-label="Pengaturan kekuatan pencahayaan">
            <div className="relight-strength-head">
              <label htmlFor="relight-strength-slider">Kekuatan lighting</label>
              <span className="relight-strength-value">{strength}%</span>
            </div>
            <div className="relight-strength-controls">
              <input
                id="relight-strength-slider"
                className="relight-strength-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={strength}
                aria-valuetext={`${strength}% kekuatan efek lighting`}
                onChange={(event) => {
                  setStrength(Number(event.target.value))
                  setLastExport(null)
      setIosSaveSheet(null)
                }}
              />
              <div className="relight-strength-presets" role="group" aria-label="Preset kekuatan lighting">
                {[25, 50, 75, 100].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={strength === preset}
                    onClick={() => {
                      setStrength(preset)
                      setLastExport(null)
      setIosSaveSheet(null)
                    }}
                  >
                    {preset}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="relight-canvas-footer">
          {result ? (
            <>
              <div className="relight-result-info">
                <p className="relight-caption">
                  {isTransformed
                    ? 'Tarik foto untuk geser · tarik garis tengah untuk bandingkan · klik 2x untuk reset'
                    : 'Tarik foto untuk geser · scroll untuk zoom · tarik garis tengah untuk bandingkan'}
                </p>
                {result.output && (
                  <p className="relight-output-meta">
                    {result.output.width} x {result.output.height} px ·{' '}
                    {result.output.format.toUpperCase()} ·{' '}
                    {result.output.bytes >= 1024 * 1024
                      ? `${(result.output.bytes / (1024 * 1024)).toFixed(2)} MB`
                      : `${Math.ceil(result.output.bytes / 1024)} KB`}
                    {strength < 100 &&
                    naturalSize.width * naturalSize.height > result.output.width * result.output.height
                      ? ` · Ekspor ${naturalSize.width} x ${naturalSize.height} px`
                      : ''}
                    {lastExport
                      ? ` · Diunduh ${lastExport.ext.toUpperCase()} ${
                          lastExport.bytes >= 1024 * 1024
                            ? `${(lastExport.bytes / (1024 * 1024)).toFixed(2)} MB`
                            : `${Math.ceil(lastExport.bytes / 1024)} KB`
                        }`
                      : ''}
                  </p>
                )}
              </div>
              {result.warning && (
                <p className="ag-alert is-warning relight-footer-alert" role="status">
                  <AlertTriangle size={14} aria-hidden="true" />
                  <span>{result.warning}</span>
                </p>
              )}
              <div className="relight-result-actions">
                <button
                  type="button"
                  className="ag-primary-btn"
                  disabled={busy || exporting}
                  onClick={() => void handleDownloadResult()}
                >
                  <Download size={15} aria-hidden="true" />
                  <span>
                    {exporting
                      ? 'Menyiapkan...'
                      : result.image.startsWith('http') && strength === 100
                        ? 'Buka / unduh hasil'
                        : strength < 100
                          ? `Unduh (${strength}%)`
                          : 'Unduh hasil'}
                  </span>
                </button>
              </div>
            </>
          ) : (
            <p className="relight-caption">
              {source
                ? 'Tarik foto untuk geser · scroll untuk zoom. Atur pencahayaan di panel kiri, lalu pilih Terapkan lighting.'
                : 'Foto sumber dan perbandingan hasil pencahayaan akan tampil di kanvas ini.'}
            </p>
          )}

          {error && (
            <div className="ag-alert is-negative relight-footer-alert" role="alert" title={error}>
              <AlertTriangle size={14} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}
        </div>
      </section>

      {iosSaveSheet && (
        <div
          className="relight-save-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setIosSaveSheet(null)
          }}
        >
          <div
            className="relight-save-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="relight-ios-save-title"
          >
            <div className="relight-save-head">
              <div>
                <h3 id="relight-ios-save-title">Simpan Foto</h3>
                <p>
                  {iosSaveSheet.ext.toUpperCase()} ·{' '}
                  {iosSaveSheet.bytes >= 1024 * 1024
                    ? `${(iosSaveSheet.bytes / (1024 * 1024)).toFixed(2)} MB`
                    : `${Math.ceil(iosSaveSheet.bytes / 1024)} KB`}
                </p>
              </div>
              <button
                type="button"
                className="ag-icon-btn"
                aria-label="Tutup dialog simpan foto"
                onClick={() => setIosSaveSheet(null)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <img src={iosSaveSheet.url} alt="Pratinjau foto siap simpan" />

            <p className="relight-save-hint">
              Tekan &amp; tahan gambar di atas lalu pilih <strong>Simpan ke Foto</strong>, atau ketuk tombol di bawah.
            </p>

            <div className="relight-save-actions">
              {canShareFile(iosSaveSheet.file) && (
                <button
                  type="button"
                  className="ag-primary-btn"
                  onClick={() => sharePreparedFile(iosSaveSheet.file, iosSaveSheet.filename)}
                >
                  <Share2 size={15} aria-hidden="true" />
                  <span>Simpan ke Galeri / Bagikan</span>
                </button>
              )}
              <a
                className="ag-primary-link"
                href={iosSaveSheet.url}
                download={iosSaveSheet.filename}
                target="_blank"
                rel="noreferrer"
              >
                <Download size={15} aria-hidden="true" />
                <span>Unduh / Buka file</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
