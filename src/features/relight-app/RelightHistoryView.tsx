import * as React from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Download,
  Loader2,
  Maximize2,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type { RelightSettings } from '../../../shared/relight.js'
import { BeforeAfterSlider } from './BeforeAfterSlider'

export interface RelightHistoryItem {
  id: string
  preset: string
  presetLabel: string
  settings: Partial<RelightSettings>
  instructions: string
  resolution: string
  model: string
  sourceName: string
  width: number | null
  height: number | null
  beforeUrl: string
  afterUrl: string
  afterFormat: 'png' | 'jpeg' | 'webp'
  createdAt: string
  expiresAt: string
  daysRemaining: number
}

interface RelightHistoryViewProps {
  items: RelightHistoryItem[]
  loading: boolean
  error: string
  retentionDays: number
  deletingId: string | null
  openingId: string | null
  downloadingId: string | null
  onRefresh: () => void
  onBackToStudio: () => void
  onOpenInEditor: (item: RelightHistoryItem) => void
  onDownload: (item: RelightHistoryItem) => void
  onDelete: (id: string) => void
}

function formatTimestamp(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function RelightHistoryView({
  items,
  loading,
  error,
  retentionDays,
  deletingId,
  openingId,
  downloadingId,
  onRefresh,
  onBackToStudio,
  onOpenInEditor,
  onDownload,
  onDelete,
}: RelightHistoryViewProps) {
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null)
  const [previewId, setPreviewId] = React.useState<string | null>(null)
  const previewItem = React.useMemo(
    () => (previewId ? items.find((item) => item.id === previewId) ?? null : null),
    [items, previewId]
  )

  React.useEffect(() => {
    if (!confirmDeleteId) return
    const timer = window.setTimeout(() => setConfirmDeleteId(null), 4000)
    return () => window.clearTimeout(timer)
  }, [confirmDeleteId])

  React.useEffect(() => {
    if (!previewItem) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewId(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [previewItem])

  return (
    <section className="rs-history-stage" aria-label="Riwayat Relight Studio">
      <div className="rs-history-header">
        <div className="rs-history-title-wrap">
          <button type="button" className="rs-ghost-btn" onClick={onBackToStudio}>
            <ArrowLeft size={15} />
            <span>Kembali ke Studio</span>
          </button>

          <div>
            <h1>Riwayat Relight</h1>
            <p>Lihat, bandingkan Before / After, unduh, atau muat ulang hasil pencahayaan sebelumnya.</p>
          </div>
        </div>

        <div className="rs-history-header-right">
          <span className="rs-retention-pill">
            <Clock size={13} />
            <span>Otomatis terhapus setelah {retentionDays} hari</span>
          </span>

          <button
            type="button"
            className="rs-ghost-btn"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Muat ulang riwayat"
          >
            {loading ? <Loader2 size={14} className="rs-spin" /> : <RefreshCw size={14} />}
            <span>Muat Ulang</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="rs-alert" role="alert" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {loading && items.length === 0 ? (
        <div className="rs-history-empty">
          <Loader2 size={24} className="rs-spin" />
          <strong>Memuat riwayat foto...</strong>
        </div>
      ) : items.length === 0 ? (
        <div className="rs-history-empty">
          <span className="rs-history-empty-icon" aria-hidden="true">
            <Clock size={22} />
          </span>
          <strong>Belum ada riwayat Relight</strong>
          <p>
            Setiap foto yang Anda proses akan tersimpan di sini selama {retentionDays} hari agar mudah dibandingkan dan diunduh ulang.
          </p>
          <button type="button" className="rs-primary-btn" onClick={onBackToStudio}>
            <Sparkles size={15} />
            <span>Mulai Edit Foto</span>
          </button>
        </div>
      ) : (
        <div className="rs-history-grid">
          {items.map((item) => {
            const isDeleting = deletingId === item.id
            const isOpening = openingId === item.id
            const isDownloading = downloadingId === item.id
            const confirming = confirmDeleteId === item.id

            return (
              <article key={item.id} className="rs-history-card">
                <div className="rs-history-media">
                  {item.beforeUrl ? (
                    <BeforeAfterSlider
                      beforeSrc={item.beforeUrl}
                      afterSrc={item.afterUrl}
                      beforeLabel="Before"
                      afterLabel="After"
                      interactiveCard
                      ariaLabel={`Perbandingan Before After ${item.presetLabel}`}
                    />
                  ) : (
                    <img
                      src={item.afterUrl}
                      alt={item.sourceName || item.presetLabel}
                      loading="lazy"
                      className="rs-history-single-img"
                    />
                  )}

                  <div className="rs-history-badges">
                    <span className="rs-history-preset-badge">{item.presetLabel}</span>
                    <span className="rs-history-expiry-badge">
                      Sisa {item.daysRemaining} hari
                    </span>
                  </div>
                </div>

                <div className="rs-history-body">
                  <div className="rs-history-meta">
                    <strong title={item.sourceName || 'Foto Relight'}>
                      {item.sourceName || 'Foto Relight'}
                    </strong>
                    <span>{formatTimestamp(item.createdAt)}</span>
                  </div>

                  <div className="rs-history-tags">
                    {item.resolution && <span className="rs-history-tag">{item.resolution}</span>}
                    {item.width && item.height && (
                      <span className="rs-history-tag">
                        {item.width}×{item.height}
                      </span>
                    )}
                  </div>

                  {item.instructions && (
                    <p className="rs-history-note" title={item.instructions}>
                      {item.instructions}
                    </p>
                  )}

                  <div className="rs-history-actions">
                    <button
                      type="button"
                      className="rs-secondary-btn"
                      onClick={() => setPreviewId(item.id)}
                      disabled={isDeleting}
                    >
                      <Maximize2 size={14} />
                      <span>Preview</span>
                    </button>

                    <button
                      type="button"
                      className="rs-secondary-btn"
                      onClick={() => onDownload(item)}
                      disabled={isDeleting || isDownloading}
                    >
                      {isDownloading ? <Loader2 size={14} className="rs-spin" /> : <Download size={14} />}
                      <span>Unduh</span>
                    </button>

                    <button
                      type="button"
                      className="rs-primary-btn rs-history-open-btn"
                      onClick={() => onOpenInEditor(item)}
                      disabled={isDeleting || isOpening}
                    >
                      {isOpening ? <Loader2 size={14} className="rs-spin" /> : <SlidersHorizontal size={14} />}
                      <span>Buka di Editor</span>
                    </button>

                    <button
                      type="button"
                      className={`rs-history-delete-btn${confirming ? ' is-confirm' : ''}`}
                      disabled={isDeleting}
                      onClick={() => {
                        if (confirming) {
                          setConfirmDeleteId(null)
                          onDelete(item.id)
                        } else {
                          setConfirmDeleteId(item.id)
                        }
                      }}
                      aria-label={confirming ? 'Konfirmasi hapus riwayat' : 'Hapus riwayat'}
                    >
                      {isDeleting ? (
                        <Loader2 size={14} className="rs-spin" />
                      ) : (
                        <>
                          <Trash2 size={14} />
                          {confirming && <span>Yakin?</span>}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {previewItem && (
        <div
          className="rs-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewItem.presetLabel}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewId(null)
          }}
        >
          <div className="rs-modal rs-history-modal">
            <div className="rs-modal-head">
              <div>
                <strong>
                  {previewItem.presetLabel} · {previewItem.sourceName || 'Foto Relight'}
                </strong>
                <div className="rs-modal-meta">
                  {formatTimestamp(previewItem.createdAt)} · Sisa {previewItem.daysRemaining} hari
                  {previewItem.resolution ? ` · ${previewItem.resolution}` : ''}
                </div>
              </div>
              <button
                type="button"
                className="rs-ghost-btn"
                aria-label="Tutup preview"
                onClick={() => setPreviewId(null)}
              >
                <X size={15} />
              </button>
            </div>

            <div className="rs-history-modal-viewer">
              {previewItem.beforeUrl ? (
                <BeforeAfterSlider
                  beforeSrc={previewItem.beforeUrl}
                  afterSrc={previewItem.afterUrl}
                  beforeLabel="Before"
                  afterLabel="After"
                  objectFit="contain"
                  ariaLabel={`Preview Before After ${previewItem.presetLabel}`}
                />
              ) : (
                <img
                  src={previewItem.afterUrl}
                  alt={previewItem.sourceName || previewItem.presetLabel}
                  className="rs-history-modal-single"
                />
              )}
            </div>

            {previewItem.instructions && (
              <p className="rs-history-modal-note">
                <strong>Catatan pencahayaan:</strong> {previewItem.instructions}
              </p>
            )}

            <div className="rs-result-actions">
              <button
                type="button"
                className="rs-secondary-btn"
                style={{ flex: 1 }}
                disabled={downloadingId === previewItem.id}
                onClick={() => onDownload(previewItem)}
              >
                {downloadingId === previewItem.id ? <Loader2 size={15} className="rs-spin" /> : <Download size={15} />}
                <span>Unduh Hasil</span>
              </button>
              <button
                type="button"
                className="rs-primary-btn"
                style={{ flex: 1 }}
                disabled={openingId === previewItem.id}
                onClick={() => {
                  const target = previewItem
                  setPreviewId(null)
                  onOpenInEditor(target)
                }}
              >
                {openingId === previewItem.id ? (
                  <Loader2 size={15} className="rs-spin" />
                ) : (
                  <SlidersHorizontal size={15} />
                )}
                <span>Buka di Editor</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
