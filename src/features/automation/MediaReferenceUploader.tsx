import { useRef, useState } from 'react'
import { Film, Upload, X } from 'lucide-react'

export type ReferenceCategory =
  | 'subject'
  | 'product'
  | 'startFrame'
  | 'endFrame'
  | 'style'
  | 'background'
  | 'motion'
  | 'general'

export interface UploadedReferenceMedia {
  token?: string
  previewUrl: string
  url?: string
  mediaType: 'image' | 'video'
  mimeType: string
  fileName: string
  sizeBytes?: number
  category?: ReferenceCategory
}

const REFERENCE_CATEGORY_OPTIONS: Array<{ value: ReferenceCategory; label: string }> = [
  { value: 'subject', label: 'Karakter / Subjek' },
  { value: 'product', label: 'Produk / Objek' },
  { value: 'startFrame', label: 'Frame Awal' },
  { value: 'endFrame', label: 'Frame Akhir' },
  { value: 'style', label: 'Gaya / Pencahayaan' },
  { value: 'background', label: 'Latar / Lokasi' },
  { value: 'motion', label: 'Referensi Gerakan / Video' },
  { value: 'general', label: 'Bahan Umum' },
]

function defaultCategoryForMedia(mediaType: 'image' | 'video'): ReferenceCategory {
  return mediaType === 'video' ? 'motion' : 'subject'
}

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
const MAX_FILES = 10

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function normalizeUploadedMediaList(value: unknown): UploadedReferenceMedia[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((entry): entry is UploadedReferenceMedia =>
      Boolean(entry && typeof entry === 'object' && typeof (entry as UploadedReferenceMedia).previewUrl === 'string' && (entry as UploadedReferenceMedia).previewUrl.startsWith('/api/workflow-media/')))
    .slice(0, MAX_FILES)
}

export function MediaReferenceUploader({
  files,
  disabled,
  compact = false,
  onChange,
}: {
  files: UploadedReferenceMedia[]
  disabled: boolean
  compact?: boolean
  onChange: (next: UploadedReferenceMedia[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const handleFiles = async (selected: FileList | null) => {
    if (!selected?.length || disabled || uploading) return
    setUploadError('')

    const remaining = MAX_FILES - files.length
    if (remaining <= 0) {
      setUploadError(`Maksimal ${MAX_FILES} file referensi per node.`)
      return
    }

    const candidates = Array.from(selected).slice(0, remaining)
    const uploaded: UploadedReferenceMedia[] = []
    setUploading(true)
    try {
      for (const file of candidates) {
        const mime = file.type.toLowerCase()
        if (!ACCEPTED_TYPES.has(mime)) {
          throw new Error(`Format "${file.name}" tidak didukung. Gunakan foto JPG/PNG/WebP atau video MP4/MOV.`)
        }
        const isVideo = mime.startsWith('video/')
        const limit = isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES
        if (file.size > limit) {
          throw new Error(`Ukuran "${file.name}" melebihi batas (${isVideo ? '100 MB untuk video' : '12 MB untuk foto'}).`)
        }

        const res = await fetch('/api/workflows/media/upload', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': mime,
            'X-File-Name': encodeURIComponent(file.name),
          },
          body: file,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(typeof data?.error === 'string' ? data.error : `Gagal mengunggah ${file.name}.`)
        }
        uploaded.push({
          token: data.token,
          previewUrl: data.previewUrl,
          url: data.url,
          mediaType: data.mediaType === 'video' ? 'video' : 'image',
          mimeType: data.mimeType || mime,
          fileName: data.fileName || file.name,
          sizeBytes: data.sizeBytes ?? file.size,
          category: defaultCategoryForMedia(data.mediaType === 'video' || isVideo ? 'video' : 'image'),
        })
      }
      if (uploaded.length) {
        onChange([...files, ...uploaded].slice(0, MAX_FILES))
      }
    } catch (err) {
      if (uploaded.length) {
        onChange([...files, ...uploaded].slice(0, MAX_FILES))
      }
      setUploadError(err instanceof Error ? err.message : 'Gagal mengunggah file.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className={`wf-media-uploader${compact ? ' is-compact' : ''}`}>
      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        disabled={disabled || uploading}
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
        onChange={event => void handleFiles(event.target.files)}
      />
      <div
        className={`wf-media-dropzone${dragOver ? ' is-drag' : ''}${disabled || uploading ? ' is-disabled' : ''}`}
        onDragOver={event => {
          event.preventDefault()
          if (!disabled && !uploading) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={event => {
          event.preventDefault()
          setDragOver(false)
          void handleFiles(event.dataTransfer.files)
        }}
      >
        <button
          type="button"
          className="wf-media-pick-btn"
          disabled={disabled || uploading || files.length >= MAX_FILES}
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} />
          {uploading ? 'Mengunggah…' : 'Pilih atau seret Foto / Video Referensi'}
        </button>
        <p className="wf-muted">
          JPG, PNG, WebP (maks 12 MB) atau MP4, MOV (maks 100 MB) · {files.length}/{MAX_FILES} file
        </p>
      </div>

      {uploadError && <p role="alert" className="wf-error">{uploadError}</p>}

      {files.length > 0 && (
        <ul className="wf-media-list" aria-label="Daftar file referensi">
          {files.map((item, index) => (
            <li key={`${item.previewUrl}-${index}`} className="wf-media-item">
              <div className="wf-media-thumb">
                {item.mediaType === 'video' ? (
                  <>
                    <video src={item.previewUrl} muted playsInline preload="metadata" />
                    <span className="wf-media-kind-badge"><Film size={11} /></span>
                  </>
                ) : (
                  <img src={item.previewUrl} alt={item.fileName || `Referensi ${index + 1}`} loading="lazy" />
                )}
              </div>
              <div className="wf-media-meta">
                <strong title={item.fileName}>{item.fileName || `File ${index + 1}`}</strong>
                <span>{item.mediaType === 'video' ? 'Video' : 'Foto'}{item.sizeBytes ? ` · ${formatBytes(item.sizeBytes)}` : ''}</span>
                <select
                  aria-label="Kategori referensi"
                  className="wf-media-category"
                  disabled={disabled || uploading}
                  value={item.category || defaultCategoryForMedia(item.mediaType)}
                  onChange={event => onChange(files.map((f, i) => (i === index ? { ...f, category: event.target.value as ReferenceCategory } : f)))}
                >
                  {REFERENCE_CATEGORY_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="wf-media-remove"
                disabled={disabled || uploading}
                aria-label={`Hapus ${item.fileName || 'file'}`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
