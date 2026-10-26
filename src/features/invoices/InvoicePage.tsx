import * as React from 'react'
import {
  ArrowUpRight,
  ExternalLink,
  FileEdit,
  ListFilter,
  Maximize2,
  Minimize2,
  PlusCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react'
import { useUser } from '@/context/UserContext'
import { Button } from '@/components/ui/Button'
import { InvoicesListPage, type InvoiceFilter } from './InvoicesListPage'
import { calculateInvoiceTotal, formatMoney, isQuotation } from './invoice-utils'
import './invoice-workspace.css'

interface InvoicePageProps {
  initialInvoiceId?: string | null
}

export function InvoicePage({ initialInvoiceId }: InvoicePageProps = {}) {
  const [view, setView] = React.useState<'list' | 'builder'>(initialInvoiceId ? 'builder' : 'list')
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [currentInvoiceId, setCurrentInvoiceId] = React.useState<string | null>(initialInvoiceId || null)
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterType, setFilterType] = React.useState<InvoiceFilter>('all')
  const [editorKey, setEditorKey] = React.useState(0)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const { profile, invoices } = useUser()

  const toggleFullscreen = () => setIsFullscreen((prev) => !prev)

  const openInNewTab = () => window.open('/invoice-app/index.html', '_blank')

  const handleOpenEditor = (invoiceId?: string) => {
    setView('builder')
    if (invoiceId) {
      setCurrentInvoiceId(invoiceId)
      const sendLoad = () => {
        try {
          iframeRef.current?.contentWindow?.postMessage({ type: 'LOAD_INVOICE', invoiceId }, window.location.origin)
        } catch (e) {
          console.error('Error posting message to iframe:', e)
        }
      }
      sendLoad()
      setTimeout(sendLoad, 250)
    }
  }

  // React's "adjust state when a prop changes" pattern: no effect needed.
  const [prevInitialId, setPrevInitialId] = React.useState(initialInvoiceId)
  if (initialInvoiceId !== prevInitialId) {
    setPrevInitialId(initialInvoiceId)
    if (initialInvoiceId) {
      setView('builder')
      setCurrentInvoiceId(initialInvoiceId)
    }
  }

  const lastLoadedInvoiceIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const syncProfile = () => {
      try {
        iframe.contentWindow?.postMessage({ type: 'SYNC_USER_PROFILE', profile }, window.location.origin)
        const targetId = currentInvoiceId || initialInvoiceId
        if (targetId && lastLoadedInvoiceIdRef.current !== targetId) {
          lastLoadedInvoiceIdRef.current = targetId
          iframe.contentWindow?.postMessage({ type: 'LOAD_INVOICE', invoiceId: targetId }, window.location.origin)
        }
      } catch (e) {
        console.error('Error posting message to iframe:', e)
      }
    }

    iframe.addEventListener('load', syncProfile)
    syncProfile()
    return () => iframe.removeEventListener('load', syncProfile)
  }, [profile, currentInvoiceId, initialInvoiceId])

  const lastSyncedInvoicesJsonRef = React.useRef<string>('')
  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const syncInvoices = () => {
      const stripped = invoices.map(({ updatedAt: _updatedAt, ...rest }) => rest)
      const invoicesJson = JSON.stringify(stripped)
      if (lastSyncedInvoicesJsonRef.current === invoicesJson) return
      lastSyncedInvoicesJsonRef.current = invoicesJson
      iframe.contentWindow?.postMessage({ type: 'SYNC_INVOICES', invoices }, window.location.origin)
    }

    iframe.addEventListener('load', syncInvoices)
    syncInvoices()
    return () => iframe.removeEventListener('load', syncInvoices)
  }, [invoices])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PRINT_INVOICE_REQUEST') {
        const iframe = iframeRef.current
        if (iframe?.contentWindow) {
          iframe.contentWindow.focus()
          iframe.contentWindow.print()
        }
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const totals = React.useMemo(() => {
    let value = 0
    let quotations = 0
    invoices.forEach((inv) => {
      // Mixed currencies can't be summed meaningfully; the headline total counts rupiah documents only.
      if (!inv.currency || inv.currency === 'IDR') value += calculateInvoiceTotal(inv)
      if (isQuotation(inv)) quotations += 1
    })
    return { value, quotations, invoices: invoices.length - quotations, all: invoices.length }
  }, [invoices])

  const filterButtons: { key: InvoiceFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Semua dokumen', count: totals.all },
    { key: 'invoice', label: 'Invoice', count: totals.invoices },
    { key: 'quotation', label: 'Quotation', count: totals.quotations },
  ]

  const openBuilder = () => {
    setCurrentInvoiceId(null)
    setView('builder')
  }

  const resetEditor = () => {
    if (!window.confirm('Muat ulang editor? Perubahan yang belum disimpan akan hilang.')) return
    setCurrentInvoiceId(null)
    setEditorKey((key) => key + 1)
  }

  return (
    <div className="iv-workspace">
      <header className="iv-page-header">
        <div>
          <h1>Invoice</h1>
          <p>Kelola riwayat tagihan, periksa detail, dan susun dokumen PDF dalam satu tempat.</p>
        </div>
        <div className="iv-header-actions">
          <Button data-testid="new-invoice" onClick={openBuilder}>
            <PlusCircle size={16} />
            Dokumen baru
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={resetEditor}
            disabled={view !== 'builder'}
            title="Muat ulang editor kosong"
          >
            <RefreshCw size={16} />
            Reset editor
          </Button>
        </div>
      </header>

      <div className="iv-summary" role="status">
        <span className="iv-stat"><strong>{totals.all}</strong> dokumen</span>
        <span className="iv-stat"><strong>{totals.invoices}</strong> invoice</span>
        <span className="iv-stat"><strong>{totals.quotations}</strong> quotation</span>
        <span className="iv-stat iv-stat-value">Nilai tagihan IDR <strong>{formatMoney(totals.value)}</strong></span>
      </div>

      <div className={`iv-studio${isFullscreen ? ' is-fullscreen' : ''}`}>
        <aside className="iv-rail" aria-label="Navigasi invoice">
          <div className="iv-rail-heading">
            <h2>Ruang kerja</h2>
          </div>

          <div className="iv-rail-group">
            <h3>Halaman</h3>
            <button
              type="button"
              className={view === 'list' ? 'is-selected' : ''}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <span><ListFilter size={15} />Daftar dokumen</span>
              <span className="iv-rail-count">{totals.all}</span>
            </button>
            <button
              type="button"
              className={view === 'builder' ? 'is-selected' : ''}
              aria-pressed={view === 'builder'}
              onClick={() => setView('builder')}
            >
              <span><FileEdit size={15} />Invoice Builder</span>
              {view === 'builder' && <ArrowUpRight size={14} />}
            </button>
          </div>

          <div className="iv-rail-group">
            <h3>Filter</h3>
            {filterButtons.map((item) => (
              <button
                key={item.key}
                type="button"
                data-filter={item.key}
                className={filterType === item.key ? 'is-selected' : ''}
                aria-pressed={filterType === item.key}
                onClick={() => {
                  setFilterType(item.key)
                  setView('list')
                }}
              >
                <span>{item.label}</span>
                <span className="iv-rail-count">{item.count}</span>
              </button>
            ))}
          </div>

          <p className="iv-rail-note">Pratinjau dokumen tidak mengubah data. Perubahan hanya tersimpan lewat Invoice Builder.</p>
        </aside>

        <div className={`iv-sheet${view === 'builder' ? ' is-builder' : ''}`}>
          <div className="iv-sheet-tools">
            {view === 'list' ? (
              <label className="iv-search">
                <Search size={15} />
                <input
                  aria-label="Cari dokumen invoice"
                  placeholder="Cari nomor, klien, atau perihal…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button type="button" aria-label="Hapus pencarian" onClick={() => setSearchQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </label>
            ) : (
              <span className="iv-muted iv-builder-label">
                InvoiceFlow — Invoice &amp; Quotation Builder
              </span>
            )}

            {view === 'list' ? (
              <Button size="sm" variant="outline" onClick={openBuilder}>
                <PlusCircle size={15} />
                Buat dokumen
              </Button>
            ) : (
              <div className="iv-sheet-actions">
                <button type="button" className="iv-icon-button" onClick={openInNewTab} title="Buka di tab baru">
                  <ExternalLink size={16} />
                </button>
                <button
                  type="button"
                  className="iv-icon-button"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            )}
          </div>

          {view === 'list' ? (
            <div className="iv-sheet-body">
              <InvoicesListPage
                invoices={invoices}
                searchQuery={searchQuery}
                filterType={filterType}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onOpenInvoiceEditor={handleOpenEditor}
              />
            </div>
          ) : (
            <div className="iv-builder">
              <iframe
                key={editorKey}
                id="invoice-editor"
                ref={iframeRef}
                src="/invoice-app/index.html"
                title="Invoice Builder"
                className="iv-frame"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
