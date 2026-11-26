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

  // Admin cookies dialog
  const [cookiesOpen, setCookiesOpen] = React.useState(false)
  const [igCookieDraft, setIgCookieDraft] = React.useState('')
  const [ttCookieDraft, setTtCookieDraft] = React.useState('')
  const [cookiesSaving, setCookiesSaving] = React.useState(false)
  const [cookiesMessage, setCookiesMessage] = React.useState('')
  const cookiesDialogRef = React.useRef<HTMLDialogElement>(null)

  // iOS save sheet fallback
  const [iosPending, setIosPending] = React.useState<IosPendingSave | null>(null)

  const activeTool = getDownloaderTool(mode)

  const loadStatus = React.useCallback(async () => {
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
    const dialog = cookiesDialogRef.current
    if (cookiesOpen && dialog && !dialog.open) {
      setCookiesMessage('')
      dialog.showModal()
    }
    if (!cookiesOpen && dialog?.open) dialog.close()
  }, [cookiesOpen])

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

  const triggerDirectDownload = (item: DownloaderItem) => {
    const a = document.createElement('a')
    a.href = item.downloadUrl
    a.download = item.filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const handleDownloadItem = async (item: DownloaderItem) => {
    if (!isIOSDevice()) {
      triggerDirectDownload(item)
      return
    }

    // iOS Safari/Chrome: fetch proxied media blob and open iOS Share Sheet / Save modal
    setDownloadingId(item.id)
    setError('')
    try {
      const res = await fetch(item.previewUrl)
      if (!res.ok) {
        throw new Error('Gagal mengunduh file untuk perangkat iOS.')
      }
      const blob = await res.blob()
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
      setError(err instanceof Error ? err.message : 'Gagal memproses unduhan iOS.')
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
          const res = await fetch(slide.previewUrl)
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
    try {
      for (let i = 0; i < mediaSlides.length; i += 1) {
        triggerDirectDownload(mediaSlides[i])
        if (i < mediaSlides.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 260))
        }
      }
    } finally {
      setDownloadingAll(false)
    }
  }

  const handleSaveCookies = async (e: React.FormEvent) => {
    e.preventDefault()
    setCookiesSaving(true)
    setCookiesMessage('')
    try {
      const payload: Record<string, string> = {}
      if (igCookieDraft.trim()) payload.instagramCookies = igCookieDraft.trim()
      if (ttCookieDraft.trim()) payload.tiktokCookies = ttCookieDraft.trim()

      const res = await fetch('/api/downloader/cookies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Gagal menyimpan cookie sesi.')
      }
      setIgCookieDraft('')
      setTtCookieDraft('')
      await loadStatus()
      setCookiesMessage('Cookie sesi berhasil disimpan dan dienkripsi.')
    } catch (err) {
      setCookiesMessage(err instanceof Error ? err.message : 'Gagal menyimpan cookie.')
    } finally {
      setCookiesSaving(false)
    }
  }

  const handleClearCookie = async (target: 'instagram' | 'tiktok') => {
    setCookiesSaving(true)
    setCookiesMessage('')
    try {
      const payload = target === 'instagram' ? { instagramCookies: '' } : { tiktokCookies: '' }
      const res = await fetch('/api/downloader/cookies', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('Gagal menghapus cookie.')
      await loadStatus()
      setCookiesMessage(`Cookie ${target === 'instagram' ? 'Instagram' : 'TikTok'} dihapus.`)
    } catch (err) {
      setCookiesMessage(err instanceof Error ? err.message : 'Gagal menghapus cookie.')
    } finally {
      setCookiesSaving(false)
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
          onOpenCookies={() => setCookiesOpen(true)}
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
                {mode === 'instagram_story' && status && !status.hasInstagramCookies && (
                  <button
                    type="button"
                    className="dl-warning-pill"
                    onClick={() => status.canManageCookies && setCookiesOpen(true)}
                    disabled={!status.canManageCookies}
                    title="IG Story memerlukan Cookie Sesi Instagram"
                  >
                    <KeyRound size={13} aria-hidden="true" />
                    <span>{status.canManageCookies ? 'Atur Sesi IG untuk Story' : 'IG Story butuh sesi admin'}</span>
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
                        <span>Reel &amp; video HD</span>
                        <span>Postingan &amp; carousel multi-slide</span>
                        <span>IG Story (dengan sesi IG)</span>
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

      {/* Admin Session Cookies Dialog */}
      <dialog
        ref={cookiesDialogRef}
        className="dl-dialog dl-cookies-dialog"
        aria-labelledby="dl-cookies-title"
        onCancel={() => setCookiesOpen(false)}
        onClose={() => setCookiesOpen(false)}
      >
        <div className="dl-dialog-head">
          <div>
            <h2 id="dl-cookies-title">Pengaturan Sesi Cookie (Admin)</h2>
            <p className="dl-muted">
              Tempel header <code>Cookie</code> (contoh: <code>sessionid=...; ds_user_id=...</code>) atau isi file <code>cookies.txt</code> format Netscape dari akun cadangan.
            </p>
          </div>
          <button
            type="button"
            className="dl-icon-btn"
            aria-label="Tutup pengaturan sesi"
            onClick={() => setCookiesOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <form className="dl-cookies-form" onSubmit={(e) => void handleSaveCookies(e)}>
          <div className="dl-cookie-field">
            <div className="dl-cookie-field-head">
              <label htmlFor="dl-ig-cookie">Cookie Sesi Instagram (Wajib untuk IG Story)</label>
              <span className={`dl-cookie-badge${status?.hasInstagramCookies ? ' is-ready' : ''}`}>
                {status?.hasInstagramCookies ? 'Tersimpan' : 'Kosong'}
              </span>
            </div>
            <textarea
              id="dl-ig-cookie"
              rows={3}
              value={igCookieDraft}
              onChange={(e) => setIgCookieDraft(e.target.value)}
              placeholder={
                status?.hasInstagramCookies
                  ? 'Sudah tersimpan (terenkripsi). Tempel cookie baru untuk mengganti...'
                  : 'Tempel cookie Instagram atau isi Netscape cookies.txt...'
              }
            />
            {status?.hasInstagramCookies && (
              <button
                type="button"
                className="dl-danger-text-btn"
                onClick={() => void handleClearCookie('instagram')}
                disabled={cookiesSaving}
              >
                Hapus cookie Instagram
              </button>
            )}
          </div>

          <div className="dl-cookie-field">
            <div className="dl-cookie-field-head">
              <label htmlFor="dl-tt-cookie">Cookie Sesi TikTok (Opsional)</label>
              <span className={`dl-cookie-badge${status?.hasTiktokCookies ? ' is-ready' : ''}`}>
                {status?.hasTiktokCookies ? 'Tersimpan' : 'Kosong'}
              </span>
            </div>
            <textarea
              id="dl-tt-cookie"
              rows={2}
              value={ttCookieDraft}
              onChange={(e) => setTtCookieDraft(e.target.value)}
              placeholder={
                status?.hasTiktokCookies
                  ? 'Sudah tersimpan (terenkripsi). Tempel cookie baru untuk mengganti...'
                  : 'Opsional: isi hanya jika mengambil konten TikTok terbatas...'
              }
            />
            {status?.hasTiktokCookies && (
              <button
                type="button"
                className="dl-danger-text-btn"
                onClick={() => void handleClearCookie('tiktok')}
                disabled={cookiesSaving}
              >
                Hapus cookie TikTok
              </button>
            )}
          </div>

          {cookiesMessage && (
            <p className="dl-cookie-feedback" role="status">
              {cookiesMessage}
            </p>
          )}

          <div className="dl-cookies-actions">
            <button
              type="button"
              className="dl-secondary-btn"
              onClick={() => setCookiesOpen(false)}
            >
              Tutup
            </button>
            <button
              type="submit"
              className="dl-primary-btn"
              disabled={cookiesSaving || (!igCookieDraft.trim() && !ttCookieDraft.trim())}
            >
              {cookiesSaving ? 'Menyimpan...' : 'Simpan Cookie'}
            </button>
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
                href={iosPending.item.downloadUrl}
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
