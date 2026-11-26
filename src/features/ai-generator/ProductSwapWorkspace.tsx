import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Download,
  ImagePlus,
  RefreshCw,
  Replace,
  Send,
  Sun,
  X,
} from 'lucide-react'
import {
  PRODUCT_SWAP_FIDELITY,
  PRODUCT_SWAP_QUICK_CHIPS,
  PRODUCT_SWAP_RESOLUTIONS,
  PRODUCT_SWAP_SCALE,
  PRODUCT_SWAP_SCENARIOS,
} from '../../../shared/product-swap.js'
import type {
  ProductSwapResolution,
  ProductSwapSettings,
} from '../../../shared/product-swap.js'
import './product-swap.css'

export interface UploadedPhoto {
  data: string
  name: string
  width: number
  height: number
  bytes: number
}

export interface ProductSwapOutputMeta {
  width: number
  height: number
  bytes: number
  format: string
  requestedResolution: string | null
  resolutionMatched: boolean | null
}

export interface ProductSwapResult {
  image: string
  model: string
  output: ProductSwapOutputMeta | null
  warning?: string
  referenceImage: string
  productImage: string
}

interface ProductSwapWorkspaceProps {
  scenePhoto: UploadedPhoto | null
  productPhoto: UploadedPhoto | null
  onScenePhotoChange: (photo: UploadedPhoto | null) => void
  onProductPhotoChange: (photo: UploadedPhoto | null) => void
  onSwapSlots: () => void
  instructions: string
  onInstructionsChange: (value: string) => void
  settings: ProductSwapSettings
  onSettingsChange: (next: ProductSwapSettings) => void
  resolution: ProductSwapResolution
  onResolutionChange: (next: ProductSwapResolution) => void
  result: ProductSwapResult | null
  currentImageModel: string
  generating: boolean
  ready: boolean
  disabledReason: string
  generationError: string
  pane: 'input' | 'result'
  onGenerate: () => void
  onClear: () => void
  onSendToRelight: (imageData: string) => void
  onUseAsReference: (imageData: string) => void
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

async function readUploadedPhoto(file: File): Promise<UploadedPhoto> {
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Format gambar harus PNG, JPG, atau WEBP.')
  }
  if (file.size > 6 * 1024 * 1024) {
    throw new Error('Ukuran gambar maksimal 6 MB.')
  }

  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Gagal membaca gambar. Pilih ulang file Anda.'))
    reader.readAsDataURL(file)
  })

  const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > 40_000_000) {
        reject(new Error('Resolusi gambar maksimal 40 megapiksel.'))
        return
      }
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => reject(new Error('File tidak dapat dibaca sebagai gambar yang valid.'))
    img.src = data
  })

  return {
    data,
    name: file.name || 'gambar.png',
    width: dimensions.width,
    height: dimensions.height,
    bytes: file.size,
  }
}

export function ProductSwapWorkspace({
  scenePhoto,
  productPhoto,
  onScenePhotoChange,
  onProductPhotoChange,
  onSwapSlots,
  instructions,
  onInstructionsChange,
  settings,
  onSettingsChange,
  resolution,
  onResolutionChange,
  result,
  currentImageModel,
  generating,
  ready,
  disabledReason,
  generationError,
  pane,
  onGenerate,
  onClear,
  onSendToRelight,
  onUseAsReference,
}: ProductSwapWorkspaceProps) {
  const [draggingSlot, setDraggingSlot] = React.useState<'scene' | 'product' | null>(null)
  const [localError, setLocalError] = React.useState('')
  const [readingSlot, setReadingSlot] = React.useState<'scene' | 'product' | null>(null)
  const [view, setView] = React.useState<'result' | 'compare' | 'product'>('result')
  const [comparePosition, setComparePosition] = React.useState(50)

  const sceneInputRef = React.useRef<HTMLInputElement>(null)
  const productInputRef = React.useRef<HTMLInputElement>(null)

  const handleFile = React.useCallback(
    async (slot: 'scene' | 'product', file: File | undefined) => {
      if (!file) return
      setLocalError('')
      setReadingSlot(slot)
      try {
        const photo = await readUploadedPhoto(file)
        if (slot === 'scene') onScenePhotoChange(photo)
        else onProductPhotoChange(photo)
      } catch (err) {
        setLocalError(err instanceof Error ? err.message : 'Gagal membaca file gambar.')
      } finally {
        setReadingSlot(null)
      }
    },
    [onScenePhotoChange, onProductPhotoChange]
  )

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (generating) return
      const imageItem = Array.from(event.clipboardData?.items || []).find((item) =>
        item.type.startsWith('image/')
      )
      const file = imageItem?.getAsFile()
      if (!file) return
      event.preventDefault()
      if (!scenePhoto) {
        void handleFile('scene', file)
      } else if (!productPhoto) {
        void handleFile('product', file)
      } else {
        void handleFile('product', file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [generating, scenePhoto, productPhoto, handleFile])

  const appendChip = (text: string) => {
    const clean = instructions.trim()
    if (clean.includes(text)) return
    onInstructionsChange(clean ? `${clean} ${text}` : text)
  }

  const uploadedCount = Number(Boolean(scenePhoto)) + Number(Boolean(productPhoto))
  const combinedError = localError || generationError

  return (
    <div className="ps-workbench" data-pane={pane}>
      <section className="ps-compose" aria-labelledby="ps-input-title">
        <div className="ps-compose-body">
          <div className="ag-section-heading">
            <h2 id="ps-input-title">Foto sumber &amp; pengaturan</h2>
            <div className="ps-heading-actions">
              <button
                type="button"
                className="ag-text-btn"
                disabled={generating || (!scenePhoto && !productPhoto)}
                onClick={onSwapSlots}
                title="Tukar foto referensi dan foto produk"
              >
                <ArrowLeftRight size={13} aria-hidden="true" />
                <span>Tukar slot</span>
              </button>
              <button
                type="button"
                className="ag-text-btn"
                disabled={generating || (!scenePhoto && !productPhoto && !instructions)}
                onClick={() => {
                  setLocalError('')
                  onClear()
                }}
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div className="ps-upload-grid">
            {(
              [
                {
                  key: 'scene',
                  badge: '1 · Latar & pose',
                  label: 'Foto referensi',
                  hint: 'Tarik, pilih, atau Ctrl+V',
                  photo: scenePhoto,
                  inputRef: sceneInputRef,
                  onClearSlot: () => onScenePhotoChange(null),
                },
                {
                  key: 'product',
                  badge: '2 · Objek baru',
                  label: 'Foto produk',
                  hint: 'Usahakan jelas & utuh',
                  photo: productPhoto,
                  inputRef: productInputRef,
                  onClearSlot: () => onProductPhotoChange(null),
                },
              ] as const
            ).map(({ key, badge, label, hint, photo, inputRef, onClearSlot }) => (
              <div
                key={key}
                className="ps-upload-card"
                data-dragging={draggingSlot === key}
                data-filled={Boolean(photo)}
                onDragOver={(event) => {
                  if (event.dataTransfer.types.includes('Files')) {
                    event.preventDefault()
                    if (!generating) {
                      event.dataTransfer.dropEffect = 'copy'
                      setDraggingSlot(key)
                    }
                  }
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setDraggingSlot(null)
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault()
                  setDraggingSlot(null)
                  if (!generating) void handleFile(key, event.dataTransfer.files?.[0])
                }}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  disabled={generating || readingSlot === key}
                  onChange={(event) => {
                    void handleFile(key, event.target.files?.[0])
                    event.target.value = ''
                  }}
                />
                <div className="ps-upload-head">
                  <span className="ps-upload-badge">{badge}</span>
                  {photo && (
                    <div className="ps-upload-head-btns">
                      <button
                        type="button"
                        className="ps-mini-btn"
                        disabled={generating}
                        onClick={() => inputRef.current?.click()}
                      >
                        Ganti
                      </button>
                      <button
                        type="button"
                        className="ps-mini-remove"
                        aria-label={`Hapus ${label.toLowerCase()}`}
                        disabled={generating}
                        onClick={onClearSlot}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>

                {photo ? (
                  <div className="ps-upload-preview">
                    <img src={photo.data} alt={label} />
                    <div className="ps-upload-meta">
                      <strong title={photo.name}>{label}</strong>
                      <span>
                        {photo.width}×{photo.height} · {formatBytes(photo.bytes)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="ps-upload-empty"
                    disabled={generating || readingSlot === key}
                    onClick={() => inputRef.current?.click()}
                  >
                    <span className="ps-upload-icon">
                      <ImagePlus size={20} aria-hidden="true" />
                    </span>
                    <strong>{readingSlot === key ? 'Membaca gambar...' : label}</strong>
                    <span>{hint}</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="ps-control-block">
            <span className="ps-control-label" id="ps-scenario-label">
              Skenario penempatan
            </span>
            <div className="ps-scenario-grid" role="group" aria-labelledby="ps-scenario-label">
              {PRODUCT_SWAP_SCENARIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={settings.scenario === item.id}
                  disabled={generating}
                  title={item.guidance}
                  onClick={() => onSettingsChange({ ...settings, scenario: item.id })}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ps-select-row">
            <div className="ps-select-field">
              <label className="ps-control-label" htmlFor="ps-fidelity">
                Kesetiaan produk
              </label>
              <select
                id="ps-fidelity"
                value={settings.fidelity}
                disabled={generating}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    fidelity: event.target.value as ProductSwapSettings['fidelity'],
                  })
                }
              >
                {PRODUCT_SWAP_FIDELITY.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ps-select-field">
              <label className="ps-control-label" htmlFor="ps-scale">
                Skala objek
              </label>
              <select
                id="ps-scale"
                value={settings.scale}
                disabled={generating}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    scale: event.target.value as ProductSwapSettings['scale'],
                  })
                }
              >
                {PRODUCT_SWAP_SCALE.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ps-control-block">
            <span className="ps-control-label" id="ps-res-label">
              Resolusi target
            </span>
            <div className="ps-res-group" role="group" aria-labelledby="ps-res-label">
              {PRODUCT_SWAP_RESOLUTIONS.map((item) => (
                <button
                  key={item.id || 'auto'}
                  type="button"
                  aria-pressed={resolution === item.id}
                  disabled={generating}
                  onClick={() => onResolutionChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ps-control-block">
            <label className="ps-control-label" htmlFor="ps-instructions">
              Arahan penggantian <span>(opsional)</span>
            </label>
            <textarea
              id="ps-instructions"
              rows={3}
              maxLength={4000}
              disabled={generating}
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value)}
              placeholder="Contoh: Pastikan label botol menghadap depan dan bayangan lembut jatuh ke kanan."
            />
            <div className="ps-chip-list">
              {PRODUCT_SWAP_QUICK_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  disabled={generating}
                  onClick={() => appendChip(chip.text)}
                >
                  + {chip.label}
                </button>
              ))}
            </div>
          </div>

          {combinedError && (
            <div className="ag-alert is-negative" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{combinedError}</span>
            </div>
          )}
        </div>

        <div className="ag-compose-dock">
          <div className="ag-compose-meta">
            <span className="ag-char-count">{uploadedCount}/2 foto siap · PNG/JPG/WEBP max 6 MB</span>
            {!generating && !ready ? (
              <span className="ag-disabled-reason">{disabledReason}</span>
            ) : (
              <span className="ag-shortcut-hint">
                Siap diolah dengan {currentImageModel || 'model gambar 9router'}
              </span>
            )}
          </div>

          <button
            type="button"
            className="ag-primary-btn"
            data-testid="generate"
            disabled={!ready}
            onClick={onGenerate}
          >
            {generating ? (
              <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={15} aria-hidden="true" />
            )}
            <span>{generating ? 'Menggabungkan...' : 'Ganti produk'}</span>
          </button>
        </div>
      </section>

      <section className="ps-output" aria-labelledby="ps-results-title" aria-busy={generating}>
        <div className="ag-section-heading">
          <h2 id="ps-results-title">Hasil penggantian</h2>
          {result && (
            <div className="ag-output-actions">
              <div className="ag-segmented" role="group" aria-label="Mode inspeksi hasil">
                <button
                  type="button"
                  aria-pressed={view === 'result'}
                  onClick={() => setView('result')}
                >
                  Hasil
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'compare'}
                  onClick={() => setView('compare')}
                >
                  Bandingkan
                </button>
                <button
                  type="button"
                  aria-pressed={view === 'product'}
                  onClick={() => setView('product')}
                >
                  Cek Produk
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="ag-output-canvas">
          {generating ? (
            <div className="ag-result-loading" role="status">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
              <h3>Menggabungkan produk ke adegan referensi</h3>
              <p>
                Memakai {currentImageModel || 'model gambar 9router'} · proses biasanya 10-40 detik
                tergantung resolusi.
              </p>
            </div>
          ) : result ? (
            <div className="ps-result-stage">
              <figure className="ps-result-frame">
                {view === 'compare' ? (
                  <div className="ps-comparison">
                    <img src={result.image} alt="Foto hasil penggantian produk" draggable={false} />
                    <div
                      className="ps-comparison-original"
                      style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
                    >
                      <img src={result.referenceImage} alt="Foto referensi awal" draggable={false} />
                    </div>
                    <div className="ps-comparison-labels" aria-hidden="true">
                      <span>Referensi</span>
                      <span>Hasil</span>
                    </div>
                    <div
                      className="ps-comparison-divider"
                      style={{ left: `${comparePosition}%` }}
                      aria-hidden="true"
                    >
                      <span>
                        <ArrowLeftRight size={15} />
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={comparePosition}
                      aria-label="Posisi pembanding foto referensi dan hasil"
                      onChange={(event) => setComparePosition(Number(event.target.value))}
                    />
                  </div>
                ) : view === 'product' ? (
                  <div className="ps-product-check">
                    <div className="ps-check-pane">
                      <span className="ps-check-label">Produk asli</span>
                      <img src={result.productImage} alt="Foto produk asli" />
                    </div>
                    <div className="ps-check-pane">
                      <span className="ps-check-label">Hasil tempelan</span>
                      <img src={result.image} alt="Hasil penggantian produk" />
                    </div>
                  </div>
                ) : (
                  <img src={result.image} alt="Hasil penggantian produk" />
                )}
              </figure>

              {result.warning && (
                <p className="ag-alert is-warning" role="status">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{result.warning}</span>
                </p>
              )}

              <div className="ps-result-footer">
                <div className="ps-result-meta">
                  {result.output?.width && result.output?.height && (
                    <span>
                      {result.output.width} × {result.output.height} px ·{' '}
                      {result.output.format.toUpperCase()}
                    </span>
                  )}
                  <span>{result.model}</span>
                </div>

                <div className="ps-result-actions">
                  <button
                    type="button"
                    className="ps-action-btn"
                    onClick={() => onSendToRelight(result.image)}
                  >
                    <Sun size={14} aria-hidden="true" />
                    <span>Lanjut ke Relight</span>
                  </button>
                  <button
                    type="button"
                    className="ps-action-btn"
                    onClick={() => onUseAsReference(result.image)}
                  >
                    <Replace size={14} aria-hidden="true" />
                    <span>Jadikan Referensi</span>
                  </button>
                  <a className="ag-primary-link" href={result.image} download="produk-ai.png">
                    <Download size={14} aria-hidden="true" />
                    <span>Unduh PNG</span>
                  </a>
                  <a
                    className="ag-secondary-link"
                    href={result.image}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>Buka penuh</span>
                    <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </div>
              </div>
            </div>
          ) : (
            <div className="ps-empty-blueprint">
              <div className="ps-blueprint-card">
                <div className="ag-empty-icon">
                  <Replace size={22} aria-hidden="true" />
                </div>
                <div className="ag-empty-heading">
                  <h3>Pasang produk nyata ke foto adegan baru</h3>
                  <p>
                    Unggah <strong>Foto referensi</strong> sebagai latar/pose dan{' '}
                    <strong>Foto produk</strong> sebagai objek pengganti, lalu pilih skenario
                    penempatan di panel kiri.
                  </p>
                </div>
              </div>

              <div className="ps-readiness-grid">
                <div className="ps-readiness-card" data-ready={Boolean(scenePhoto)}>
                  <span className="ps-readiness-mark" aria-hidden="true">
                    {scenePhoto ? <Check size={14} /> : '1'}
                  </span>
                  <div>
                    <strong>Foto referensi</strong>
                    <span>
                      {scenePhoto
                        ? `${scenePhoto.width}×${scenePhoto.height} siap`
                        : 'Menentukan latar, cahaya, & pose'}
                    </span>
                  </div>
                </div>
                <div className="ps-readiness-card" data-ready={Boolean(productPhoto)}>
                  <span className="ps-readiness-mark" aria-hidden="true">
                    {productPhoto ? <Check size={14} /> : '2'}
                  </span>
                  <div>
                    <strong>Foto produk</strong>
                    <span>
                      {productPhoto
                        ? `${productPhoto.width}×${productPhoto.height} siap`
                        : 'Logo, bentuk, & warna dipertahankan'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="ag-result-note">
          Periksa kembali kejelasan logo, teks kemasan, dan kontak bayangan sebelum dipakai.
        </p>
      </section>
    </div>
  )
}
