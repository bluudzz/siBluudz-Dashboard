import * as React from 'react'
import {
  Maximize2,
  Minimize2,
  ExternalLink,
  ListFilter,
  FileEdit,
  ArrowLeft,
  Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUser } from '@/context/UserContext'
import { InvoicesListPage } from './InvoicesListPage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

interface InvoicePageProps {
  initialInvoiceId?: string | null
}

export function InvoicePage({ initialInvoiceId }: InvoicePageProps = {}) {
  const [view, setView] = React.useState<'list' | 'builder'>(initialInvoiceId ? 'builder' : 'list')
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [currentInvoiceId, setCurrentInvoiceId] = React.useState<string | null>(initialInvoiceId || null)
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const { profile, invoices } = useUser()

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev)
  }

  const openInNewTab = () => {
    window.open('/invoice-app/index.html', '_blank')
  }

  const handleOpenEditor = (invoiceId?: string) => {
    setView('builder')
    if (invoiceId) {
      setCurrentInvoiceId(invoiceId)
      const sendLoad = () => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: 'LOAD_INVOICE',
              invoiceId,
            },
            window.location.origin
          )
        } catch (e) {
          console.error('Error posting message to iframe:', e)
        }
      }
      sendLoad()
      setTimeout(sendLoad, 250)
    }
  }

  // Update view if initialInvoiceId changes
  React.useEffect(() => {
    if (initialInvoiceId) {
      handleOpenEditor(initialInvoiceId)
    }
  }, [initialInvoiceId])

  // Sync profile and initial invoice to the editor iframe
  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const syncProfile = () => {
      try {
        iframe.contentWindow?.postMessage(
          {
            type: 'SYNC_USER_PROFILE',
            profile,
          },
          window.location.origin
        )
        const targetId = currentInvoiceId || initialInvoiceId
        if (targetId) {
          iframe.contentWindow?.postMessage(
            {
              type: 'LOAD_INVOICE',
              invoiceId: targetId,
            },
            window.location.origin
          )
        }
      } catch (e) {
        console.error('Error posting message to iframe:', e)
      }
    }

    iframe.addEventListener('load', syncProfile)
    syncProfile()

    const timer = setTimeout(syncProfile, 350)
    return () => {
      iframe.removeEventListener('load', syncProfile)
      clearTimeout(timer)
    }
  }, [profile, currentInvoiceId, initialInvoiceId])

  // Sync invoices list changes to editor
  const lastSyncedInvoicesJsonRef = React.useRef<string>('')
  React.useEffect(() => {
    const iframe = iframeRef.current
    if (!iframe) return

    const syncInvoices = () => {
      const invoicesJson = JSON.stringify(invoices)
      if (lastSyncedInvoicesJsonRef.current === invoicesJson) return
      lastSyncedInvoicesJsonRef.current = invoicesJson
      iframe.contentWindow?.postMessage({ type: 'SYNC_INVOICES', invoices }, window.location.origin)
    }

    iframe.addEventListener('load', syncInvoices)
    syncInvoices()
    return () => {
      iframe.removeEventListener('load', syncInvoices)
    }
  }, [invoices])

  // Handle print requests from iframe
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
    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Sub-navigation tabs (Hidden when Fullscreen) */}
      {!isFullscreen && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Invoice App
                <Badge variant="outline" className="text-[11px] font-normal py-0">
                  {view === 'list' ? 'Daftar Dokumen' : 'Editor Mode'}
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground">
                Satu aplikasi terpadu untuk mengelola riwayat tagihan & mendesain dokumen invoice / quotation PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-auto bg-muted/60 p-1 rounded-xl border border-border/60">
            <button
              onClick={() => setView('list')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer',
                view === 'list'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ListFilter className="h-3.5 w-3.5" />
              Daftar Invoice
              <span className="ml-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-bold px-1.5 py-0.2">
                {invoices.length}
              </span>
            </button>

            <button
              onClick={() => setView('builder')}
              className={cn(
                'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 cursor-pointer',
                view === 'builder'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Invoice Builder
            </button>
          </div>
        </div>
      )}

      {/* View 1: Daftar Invoice */}
      <div className={view === 'list' ? 'block' : 'hidden'}>
        <InvoicesListPage onOpenInvoiceEditor={handleOpenEditor} />
      </div>

      {/* View 2: Invoice Builder (Iframe preserved to retain edits) */}
      <div
        className={cn(
          'flex-col',
          view === 'builder' ? 'flex' : 'hidden',
          isFullscreen
            ? 'fixed inset-0 z-[100] bg-background'
            : 'h-[calc(100vh-10rem)]'
        )}
      >
        {/* Editor Sub-Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card rounded-t-xl shrink-0">
          <div className="flex items-center gap-2">
            {!isFullscreen && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setView('list')}
                className="h-8 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground mr-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Kembali ke Daftar
              </Button>
            )}
            <div className="h-3 w-3 rounded-full bg-red-500/80" />
            <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
            <div className="h-3 w-3 rounded-full bg-green-500/80" />
            <span className="ml-2 text-xs sm:text-sm font-medium text-muted-foreground truncate">
              InvoiceFlow — Invoice & Quotation Builder
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={openInNewTab}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              title="Buka di tab baru"
            >
              <ExternalLink className="h-4 w-4" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
              title={isFullscreen ? 'Keluar fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 overflow-hidden rounded-b-xl border border-t-0 border-border">
          <iframe
            id="invoice-editor"
            ref={iframeRef}
            src="/invoice-app/index.html"
            title="Invoice Builder"
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
          />
        </div>
      </div>
    </div>
  )
}
