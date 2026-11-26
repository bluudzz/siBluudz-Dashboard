import * as React from 'react'
import {
  AlertTriangle,
  ClipboardPaste,
  Download,
  ExternalLink,
  History,
  Info,
  KeyRound,
  Loader2,
  Music,
  Share2,
  Trash2,
  X,
} from 'lucide-react'
import { canShareFile, isIOSDevice } from '@/features/ai-generator/relight-export'
import { DownloaderModeIcon, DownloaderNav } from './DownloaderNav'
import { getDownloaderTool } from './downloader-catalog'
import type {
  DownloaderHistoryItem,
  DownloaderItem,
  DownloaderMode,
  DownloaderResult,
  DownloaderStatus,
} from './downloader-catalog'
import './downloader.css'

interface IosPendingSave {
  item: DownloaderItem
  file: File
  objectUrl: string
}

export function DownloaderPage() {
  const [mode, setMode] = React.useState<DownloaderMode>('tiktok_video')
  const [urlInput, setUrlInput] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [result, setResult] = React.useState<DownloaderResult | null>(null)
  const [status, setStatus] = React.useState<DownloaderStatus | null>(null)
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null)
  const [downloadingAll, setDownloadingAll] = React.useState(false)

  // History drawer
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyItems, setHistoryItems] = React.useState<DownloaderHistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const historyDialogRef = React.useRef<HTMLDialogElement>(null)

  // Admin Instagram Session ID dialog
  const [sessionOpen, setSessionOpen] = React.useState(false)
  const [sessionDraft, setSessionDraft] = React.useState('')
  const [sessionSaving, setSessionSaving] = React.useState(false)
  const [sessionMessage, setSessionMessage] = React.useState('')
  const sessionDialogRef = React.useRef<HTMLDialogElement>(null)

  // iOS save sheet fallback
  const [iosPending, setIosPending] = React.useState<IosPendingSave | null>(null)

  const activeTool = getDownloaderTool(mode)

  const refreshStatus = React.useCallback(async () => {
    try {
      const res = await fetch('/api/downloader/status')
      if (!res.ok) return
      const json = (await res.json()) as DownloaderStatus
      setStatus(json)
    } catch {
      // ignore transient network errors
    }
  }, [])

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch('/api/downloader/history')
      if (!res.ok) return
      const json = (await res.json()) as { items?: DownloaderHistoryItem[] }
      setHistoryItems(Array.isArray(json.items) ? json.items : [])
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    fetch('/api/downloader/status')
      .then((res) => (res.ok ? res.json() : null))
      .then((json: DownloaderStatus | null) => {
        if (active && json) setStatus(json)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  React.useEffect(() => {
    const dialog = historyDialogRef.current
    if (historyOpen && dialog && !dialog.open) {
      dialog.showModal()
      void loadHistory()
    }
    if (!historyOpen && dialog?.open) dialog.close()
  }, [historyOpen, loadHistory])

  React.useEffect(() => {
    const dialog = sessionDialogRef.current
    if (sessionOpen && dialog && !dialog.open) {
      dialog.showModal()
    }
    if (!sessionOpen && dialog?.open) dialog.close()
  }, [sessionOpen])

  React.useEffect(() => {
    return () => {
      if (iosPending?.objectUrl) {
        URL.revokeObjectURL(iosPending.objectUrl)
      }
    }
  }, [iosPending])

  const runExtract = async (targetUrl: string, targetMode: DownloaderMode) => {
    const trimmed = targetUrl.trim()
    if (!trimmed) {
      setError('Tempel tautan TikTok atau Instagram terlebih dahulu.')
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const res = await fetch('/api/downloader/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed, mode: targetMode }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || `Gagal mengambil media (HTTP ${res.status}).`)
      }
      const data = json as DownloaderResult
      setResult(data)
      if (data.resolvedMode && data.resolvedMode !== targetMode) {
        const matchedTool = getDownloaderTool(data.resolvedMode)
        setMode(data.resolvedMode)
        setNotice(`Tautan terdeteksi sebagai ${matchedTool.title}.`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekstrak media.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    void runExtract(urlInput, mode)
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setUrlInput(text.trim())
        setError('')
      }
    } catch {
      setError('Akses clipboard ditolak browser. Tempel manual ke kotak URL.')
    }
  }

  const fetchMediaBlob = async (item: DownloaderItem): Promise<Blob> => {
    const res = await fetch(item.previewUrl, { credentials: 'same-origin' })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(
        json?.error ||
          (res.status === 404
            ? 'Tautan unduhan kedaluwarsa. Klik Ambil Media lagi lalu unduh ulang.'
            : `Gagal mengunduh media (HTTP ${res.status}).`)
      )
    }
    const blob = await res.blob()
    if (blob.size === 0) {
      throw new Error('File media kosong. Coba klik Ambil Media lagi.')
    }
    return blob
  }

  const saveBlobAsFile = (blob: Blob, filename: string) => {
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    window.setTimeout(() => {
      a.remove()
      URL.revokeObjectURL(blobUrl)
    }, 60_000)
  }

  const handleDownloadItem = async (item: DownloaderItem) => {
    setDownloadingId(item.id)
    setError('')
    try {
      const blob = await fetchMediaBlob(item)

      if (!isIOSDevice()) {
        saveBlobAsFile(blob, item.filename)
        return
      }

      // iOS Safari/Chrome: open iOS Share Sheet / Save modal from the downloaded blob
      const file = new File([blob], item.filename, { type: blob.type || item.mimeType })

      if (canShareFile(file)) {
        try {
          await navigator.share({ files: [file], title: item.filename })
          return
        } catch (shareErr) {
          if (shareErr instanceof Error && shareErr.name === 'AbortError') {
            return
          }
          // iOS may reject navigator.share after an async fetch if user gesture expired; fall back to modal
        }
      }

      const objectUrl = URL.createObjectURL(blob)
      setIosPending((prev) => {
        if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl)
        return { item, file, objectUrl }
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh file media.')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleDownloadAllSlides = async () => {
    if (!result) return
    const mediaSlides = result.items.filter((i) => i.kind === 'image' || i.kind === 'video')
    if (mediaSlides.length <= 1) return

    if (isIOSDevice()) {
      setDownloadingAll(true)
      try {
        const files: File[] = []
        for (const slide of mediaSlides.slice(0, 12)) {
          const res = await fetch(slide.previewUrl, { credentials: 'same-origin' })
          if (!res.ok) continue
          const blob = await res.blob()
          files.push(new File([blob], slide.filename, { type: blob.type || slide.mimeType }))
        }
        if (files.length > 0 && typeof navigator.share === 'function' && navigator.canShare?.({ files })) {
          try {
            await navigator.share({ files, title: result.title || 'Media Download' })
            return
          } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return
          }
        }
        if (mediaSlides[0]) {
          await handleDownloadItem(mediaSlides[0])
        }
      } finally {
        setDownloadingAll(false)
      }
      return
    }

    setDownloadingAll(true)
    setError('')
    try {
      for (let i = 0; i < mediaSlides.length; i += 1) {
        const slide = mediaSlides[i]
        const blob = await fetchMediaBlob(slide)
        saveBlobAsFile(blob, slide.filename)
        if (i < mediaSlides.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 260))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh semua slide.')
    } finally {
      setDownloadingAll(false)
    }
  }

  const handleDeleteHistoryItem = async (id: string) => {
    await fetch(`/api/downloader/history/${encodeURIComponent(id)}`, { method: 'DELETE' })
    setHistoryItems((prev) => prev.filter((item) => item.id !== id))
  }

  const handleClearHistory = async () => {
    await fetch('/api/downloader/history', { method: 'DELETE' })
    setHistoryItems([])
  }

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sessionDraft.trim()) return
    setSessionSaving(true)
    setSessionMessage('')
    try {
      const res = await fetch('/api/downloader/session', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionDraft.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Gagal menyimpan Session ID Instagram.')
      }
      setSessionDraft('')
      await refreshStatus()
      setSessionMessage('Session ID berhasil disimpan dan siap dipakai untuk IG Story.')
    } catch (err) {
      setSessionMessage(err instanceof Error ? err.message : 'Gagal menyimpan Session ID.')
    } finally {
      setSessionSaving(false)
    }
  }

  const handleDeleteSession = async () => {
    setSessionSaving(true)
    setSessionMessage('')
    try {
      const res = await fetch('/api/downloader/session', { method: 'DELETE' })
      if (!res.ok) throw new Error('Gagal menghapus Session ID.')
      setSessionDraft('')
      await refreshStatus()
      setSessionMessage('Session ID Instagram dihapus.')
    } catch (err) {
      setSessionMessage(err instanceof Error ? err.message : 'Gagal menghapus Session ID.')
    } finally {
      setSessionSaving(false)
    }
  }

  const handlePasteSession = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        setSessionDraft(text.trim())
        setSessionMessage('')
      }
    } catch {
      setSessionMessage('Akses clipboard ditolak browser. Tempel manual ke kolom di bawah.')
    }
  }

  const downloadableVisualCount = result
    ? result.items.filter((i) => i.kind === 'image' || i.kind === 'video').length
    : 0

  return (
    <div className="dl-workspace">
      <div className="dl-shell">
        <DownloaderNav
          mode={mode}
          disabled={loading}
          status={status}
          onSelect={(nextMode) => {
            setMode(nextMode)
            setError('')
            setNotice('')
          }}
          onOpenHistory={() => setHistoryOpen(true)}
          onOpenSession={() => {
            setSessionMessage('')
            setSessionOpen(true)
          }}
        />

        <main className="dl-stage">
          <section className="dl-sheet" aria-label={activeTool.title}>
            <header className="dl-sheet-header">
              <div className="dl-sheet-title">
                <span className="dl-tool-badge" aria-hidden="true">
                  <DownloaderModeIcon mode={mode} size={17} />
                </span>
                <div className="dl-title-copy">
                  <h1>{activeTool.title}</h1>
                  <p>{activeTool.description}</p>
                </div>
              </div>
              <div className="dl-header-controls">
                {mode === 'instagram_story' && status && !status.hasInstagramSession && (
                  <button
                    type="button"
                    className="dl-warning-pill"
                    onClick={() => {
                      if (status.canManageSession) {
                        setSessionMessage('')
                        setSessionOpen(true)
                      }
                    }}
                    disabled={!status.canManageSession}
                    title="IG Story memerlukan Session ID Instagram"
                  >
                    <KeyRound size={13} aria-hidden="true" />
                    <span>{status.canManageSession ? 'Atur Sesi IG' : 'IG Story butuh Sesi Admin'}</span>
                  </button>
                )}
                <span className="dl-kind-pill">{activeTool.kindLabel}</span>
              </div>
            </header>

            <div className="dl-body">
              <form className="dl-url-form" onSubmit={handleSubmit}>
                <div className="dl-url-input-wrap">
                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={activeTool.placeholder}
                    aria-label="Tautan media"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="dl-url-input"
                  />
                  {urlInput && (
                    <button
                      type="button"
                      className="dl-inline-icon-btn"
                      onClick={() => {
                        setUrlInput('')
                        setError('')
                      }}
                      aria-label="Hapus tautan"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="dl-paste-btn"
                    onClick={() => void handlePaste()}
                    disabled={loading}
                  >
                    <ClipboardPaste size={14} aria-hidden="true" />
                    <span>Tempel</span>
                  </button>
                </div>
                <button
                  type="submit"
                  className="dl-primary-btn"
                  disabled={loading || !urlInput.trim()}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      <span>Mengambil...</span>
                    </>
                  ) : (
                    <>
                      <Download size={16} aria-hidden="true" />
                      <span>Ambil Media</span>
                    </>
                  )}
                </button>
              </form>

              {notice && (
                <div className="dl-alert is-info" role="status">
                  <Info size={16} aria-hidden="true" />
                  <span>{notice}</span>
                </div>
              )}

              {error && (
                <div className="dl-alert is-error" role="alert">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              {!result && !loading && (
                <div className="dl-empty-state">
                  <div className="dl-empty-icon" aria-hidden="true">
                    <DownloaderModeIcon mode={mode} size={26} />
                  </div>
                  <h2>Siap mengunduh {activeTool.title}</h2>
                  <p>{activeTool.description}</p>
                  <div className="dl-empty-hints">
                    {mode.startsWith('tiktok') ? (
                      <>
                        <span>Video tanpa watermark HD</span>
                        <span>Slideshow foto multi-slide</span>
                        <span>Audio MP3 terpisah</span>
                      </>
                    ) : (
                      <>
                        <span>Reel &amp; video HD (tanpa sesi)</span>
                        <span>Postingan &amp; carousel (tanpa sesi)</span>
                        <span>IG Story (via Sesi IG)</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {loading && !result && (
                <div className="dl-empty-state">
                  <Loader2 size={28} className="animate-spin dl-accent-icon" aria-hidden="true" />
                  <h2>Menganalisis tautan...</h2>
                  <p>Mengambil tautan media resolusi terbaik dari server.</p>
                </div>
              )}

              {result && (
                <div className="dl-result-section">
                  <div className="dl-result-header">
                    <div className="dl-result-meta">
                      <div className="dl-result-badges">
                        <span className="dl-platform-badge">
                          {result.platform === 'tiktok' ? 'TikTok' : 'Instagram'}
                        </span>
                        {result.author && (
                          <span className="dl-author-badge">@{result.author}</span>
                        )}
                        <span className="dl-count-badge">{result.items.length} file</span>
                      </div>
                      <h2 className="dl-result-title">{result.title}</h2>
                    </div>
                    <div className="dl-result-actions">
                      {downloadableVisualCount > 1 && (
                        <button
                          type="button"
                          className="dl-secondary-btn"
                          onClick={() => void handleDownloadAllSlides()}
                          disabled={downloadingAll}
                        >
                          {downloadingAll ? (
                            <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <Download size={15} aria-hidden="true" />
                          )}
                          <span>Unduh Semua ({downloadableVisualCount})</span>
                        </button>
                      )}
                      <a
                        href={result.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="dl-ghost-link"
                        title="Buka tautan asli"
                      >
                        <ExternalLink size={15} aria-hidden="true" />
                      </a>
                    </div>
                  </div>

                  <div className="dl-media-grid">
                    {result.items.map((item) => {
                      const isBusy = downloadingId === item.id
                      return (
                        <article
                          key={item.id}
                          className={`dl-media-card${item.kind === 'audio' ? ' is-audio' : ''}`}
                        >
                          {item.kind === 'video' && (
                            <div className="dl-media-preview is-video">
                              <video
                                controls
                                playsInline
                                preload="metadata"
                                poster={item.thumbUrl || undefined}
                                src={item.previewUrl}
                              />
                            </div>
                          )}

                          {item.kind === 'image' && (
                            <div className="dl-media-preview is-image">
                              <img
                                src={item.previewUrl}
                                alt={item.label}
                                loading="lazy"
                              />
                            </div>
                          )}

                          {item.kind === 'audio' && (
                            <div className="dl-audio-preview">
                              <div className="dl-audio-icon" aria-hidden="true">
                                <Music size={20} />
                              </div>
                              <audio controls preload="none" src={item.previewUrl} />
                            </div>
                          )}

                          <div className="dl-media-footer">
                            <div className="dl-media-info">
                              <strong>{item.label}</strong>
                              <span>
                                {item.ext.toUpperCase()}
                                {item.width && item.height ? ` · ${item.width}x${item.height}` : ''}
                              </span>
                            </div>
                            <button
                              type="button"
                              className="dl-download-btn"
                              onClick={() => void handleDownloadItem(item)}
                              disabled={isBusy}
                            >
                              {isBusy ? (
                                <Loader2 size={15} className="animate-spin" aria-hidden="true" />
                              ) : (
                                <Download size={15} aria-hidden="true" />
                              )}
                              <span>Unduh</span>
                            </button>
                          </div>
                        </article>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>

      {/* History Drawer Dialog */}
      <dialog
        ref={historyDialogRef}
        className="dl-dialog dl-history-dialog"
        aria-labelledby="dl-history-title"
        onCancel={() => setHistoryOpen(false)}
        onClose={() => setHistoryOpen(false)}
      >
        <div className="dl-dialog-head">
          <div>
            <h2 id="dl-history-title" className="dl-dialog-title-row">
              <History size={18} aria-hidden="true" />
              <span>Riwayat Downloader</span>
            </h2>
            <p className="dl-muted">30 tautan terakhir yang diambil.</p>
          </div>
          <div className="dl-dialog-head-actions">
            {historyItems.length > 0 && (
              <button
                type="button"
                className="dl-danger-text-btn"
                onClick={() => void handleClearHistory()}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Hapus semua</span>
              </button>
            )}
            <button
              type="button"
              className="dl-icon-btn"
              aria-label="Tutup riwayat"
              onClick={() => setHistoryOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="dl-history-list">
          {historyLoading && <p className="dl-empty-note">Memuat riwayat...</p>}
          {!historyLoading && historyItems.length === 0 && (
            <p className="dl-empty-note">Belum ada riwayat unduhan.</p>
          )}
          {historyItems.map((entry) => {
            const toolInfo = getDownloaderTool(entry.mode)
            return (
              <div key={entry.id} className="dl-history-card">
                <div className="dl-history-meta">
                  <span className="dl-history-type">{toolInfo.title}</span>
                  <span>{entry.itemCount} file</span>
                </div>
                <h3>{entry.title || entry.sourceUrl}</h3>
                <p className="dl-history-url">{entry.sourceUrl}</p>
                <div className="dl-history-actions">
                  <button
                    type="button"
                    className="dl-secondary-btn is-sm"
                    onClick={() => {
                      setMode(entry.mode)
                      setUrlInput(entry.sourceUrl)
                      setHistoryOpen(false)
                      void runExtract(entry.sourceUrl, entry.mode)
                    }}
                  >
                    Ambil Ulang
                  </button>
                  <button
                    type="button"
                    className="dl-danger-text-btn"
                    onClick={() => void handleDeleteHistoryItem(entry.id)}
                    aria-label="Hapus item riwayat"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </dialog>

      {/* Admin Instagram Session ID Dialog */}
      <dialog
        ref={sessionDialogRef}
        className="dl-dialog dl-session-dialog"
        aria-labelledby="dl-session-title"
        onCancel={() => setSessionOpen(false)}
        onClose={() => setSessionOpen(false)}
      >
        <div className="dl-dialog-head">
          <div>
            <h2 id="dl-session-title" className="dl-dialog-title-row">
              <KeyRound size={18} aria-hidden="true" />
              <span>Pengaturan Sesi IG (Admin)</span>
            </h2>
            <p className="dl-muted">
              Tempel langsung nilai <strong>Session ID</strong> dari browser (tanpa perlu menulis <code>sessionid=</code>). Khusus dipakai untuk mengambil <strong>IG Story</strong>; Reel &amp; Foto publik tetap berjalan tanpa sesi.
            </p>
          </div>
          <button
            type="button"
            className="dl-icon-btn"
            aria-label="Tutup pengaturan Sesi IG"
            onClick={() => setSessionOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="dl-session-status-card">
          <div className="dl-session-status-info">
            <span className="dl-session-status-label">Status Sesi IG Story</span>
            {status?.hasInstagramSession ? (
              <p className="dl-session-preview">
                <code>{status.instagramSessionPreview || '••••'}</code>
                {status.instagramUserId && <span> · UID {status.instagramUserId}</span>}
              </p>
            ) : (
              <p className="dl-session-preview">Belum ada Session ID tersimpan</p>
            )}
          </div>
          <span className={`dl-session-badge${status?.hasInstagramSession ? ' is-ready' : ''}`}>
            {status?.hasInstagramSession ? 'Aktif' : 'Kosong'}
          </span>
        </div>

        <form className="dl-session-form" onSubmit={(e) => void handleSaveSession(e)}>
          <div className="dl-session-field">
            <div className="dl-session-field-head">
              <label htmlFor="dl-ig-session-input">
                {status?.hasInstagramSession ? 'Ganti / Perbarui Session ID' : 'Session ID Instagram'}
              </label>
              <button
                type="button"
                className="dl-paste-btn"
                onClick={() => void handlePasteSession()}
                disabled={sessionSaving}
              >
                <ClipboardPaste size={13} aria-hidden="true" />
                <span>Tempel</span>
              </button>
            </div>
            <textarea
              id="dl-ig-session-input"
              rows={3}
              value={sessionDraft}
              onChange={(e) => setSessionDraft(e.target.value)}
              placeholder="Langsung tempel nilai sessionid di sini (contoh: 55123456%3Aabcd...%3A27)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>

          {sessionMessage && (
            <p className="dl-session-feedback" role="status">
              {sessionMessage}
            </p>
          )}

          <div className="dl-session-actions">
            {status?.hasInstagramSession && (
              <button
                type="button"
                className="dl-danger-text-btn"
                onClick={() => void handleDeleteSession()}
                disabled={sessionSaving}
              >
                <Trash2 size={14} aria-hidden="true" />
                <span>Hapus Sesi</span>
              </button>
            )}
            <div className="dl-session-actions-right">
              <button
                type="button"
                className="dl-secondary-btn"
                onClick={() => setSessionOpen(false)}
              >
                Tutup
              </button>
              <button
                type="submit"
                className="dl-primary-btn"
                disabled={sessionSaving || !sessionDraft.trim()}
              >
                {sessionSaving
                  ? 'Menyimpan...'
                  : status?.hasInstagramSession
                    ? 'Perbarui Sesi'
                    : 'Simpan Sesi'}
              </button>
            </div>
          </div>
        </form>
      </dialog>

      {/* iOS Save Modal Fallback */}
      {iosPending && (
        <div className="dl-ios-backdrop" role="dialog" aria-modal="true" aria-label="Simpan media ke perangkat iOS">
          <div className="dl-ios-sheet">
            <div className="dl-dialog-head">
              <div>
                <h2>Simpan ke iPhone / iPad</h2>
                <p className="dl-muted">
                  {iosPending.item.kind === 'image'
                    ? 'Ketuk tombol di bawah untuk Share/Save, atau tahan gambar lalu pilih Simpan Foto.'
                    : 'Ketuk Bagikan / Simpan File ke Galeri atau Files.'}
                </p>
              </div>
              <button
                type="button"
                className="dl-icon-btn"
                aria-label="Tutup"
                onClick={() => setIosPending(null)}
              >
                <X size={18} />
              </button>
            </div>

            {iosPending.item.kind === 'image' && (
              <img
                src={iosPending.objectUrl}
                alt={iosPending.item.label}
                className="dl-ios-preview-img"
              />
            )}
            {iosPending.item.kind === 'video' && (
              <video
                controls
                playsInline
                src={iosPending.objectUrl}
                className="dl-ios-preview-img"
              />
            )}

            <div className="dl-ios-actions">
              {canShareFile(iosPending.file) && (
                <button
                  type="button"
                  className="dl-primary-btn"
                  onClick={() => {
                    void navigator
                      .share({ files: [iosPending.file], title: iosPending.item.filename })
                      .then(() => setIosPending(null))
                      .catch(() => {})
                  }}
                >
                  <Share2 size={16} aria-hidden="true" />
                  <span>Simpan / Bagikan</span>
                </button>
              )}
              <a
                href={iosPending.objectUrl}
                download={iosPending.item.filename}
                className="dl-secondary-btn"
              >
                <Download size={16} aria-hidden="true" />
                <span>Unduh Langsung</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
