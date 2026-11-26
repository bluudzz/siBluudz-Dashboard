import * as React from 'react'
import { useUser } from '@/context/UserContext'
import type { InvoiceRecord } from '@/types/invoice'
import { invoiceListSignature } from './invoice-utils'

interface InvoicePageProps {
  initialInvoiceId?: string | null
}

export function InvoicePage({ initialInvoiceId }: InvoicePageProps = {}) {
  const { profile, invoices } = useUser()
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const readyRef = React.useRef(false)
  const lastSyncRef = React.useRef({ profile: '', invoices: '', invoiceId: '' })

  const syncEditor = React.useCallback((force = false) => {
    const editor = iframeRef.current?.contentWindow
    if (!editor || !readyRef.current) return
    const origin = window.location.origin
    const profileJson = JSON.stringify(profile)
    const invoicesSig = invoiceListSignature(invoices)

    if (force || lastSyncRef.current.profile !== profileJson) {
      editor.postMessage({ type: 'SYNC_USER_PROFILE', profile }, origin)
      lastSyncRef.current.profile = profileJson
    }
    if (force || lastSyncRef.current.invoices !== invoicesSig) {
      editor.postMessage({ type: 'SYNC_INVOICES', invoices }, origin)
      lastSyncRef.current.invoices = invoicesSig
    }
    if (initialInvoiceId && (force || lastSyncRef.current.invoiceId !== initialInvoiceId)) {
      editor.postMessage({ type: 'LOAD_INVOICE', invoiceId: initialInvoiceId }, origin)
      lastSyncRef.current.invoiceId = initialInvoiceId
    }
  }, [profile, invoices, initialInvoiceId])

  React.useEffect(() => { syncEditor() }, [syncEditor])

  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const editor = iframeRef.current?.contentWindow
      if (!editor || event.origin !== window.location.origin || event.source !== editor) return
      if (event.data?.type === 'INVOICES_UPDATED' && Array.isArray(event.data.invoices)) {
        lastSyncRef.current.invoices = invoiceListSignature(event.data.invoices as InvoiceRecord[])
        return
      }
      if (event.data?.type === 'PRINT_INVOICE_REQUEST') {
        editor.focus()
        editor.print()
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  return <iframe
    id="invoice-editor"
    ref={iframeRef}
    src="/invoice-app/index.html"
    title="InvoiceFlow"
    className="block h-full w-full min-h-0 flex-1 border-0 bg-white"
    sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads allow-modals"
    onLoad={() => { readyRef.current = true; syncEditor(true) }}
  />
}
