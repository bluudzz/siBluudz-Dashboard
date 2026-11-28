import * as React from 'react'
import { ThemeProvider } from '@/context/ThemeContext'
import { UserProvider } from '@/context/UserContext'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { CommandDialog } from '@/components/layout/CommandDialog'
import { LaunchpadPage } from '@/features/dashboard/LaunchpadPage'
import { SecurityPage } from '@/features/settings/SecurityPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { InvoicePage } from '@/features/invoices/InvoicePage'
import { invoiceListSignature } from '@/features/invoices/invoice-utils'
import { AiGeneratorPage } from '@/features/ai-generator/AiGeneratorPage'
import { DownloaderPage } from '@/features/downloader/DownloaderPage'
import { EmailManagerPage } from '@/features/mail/EmailManagerPage'
import { WorkflowStudioPage } from '@/features/automation/WorkflowStudioPage'
import { WorkflowLocalOnlyLock } from '@/features/automation/WorkflowLocalOnlyLock'
import { isLocalhostOrigin } from '@/lib/localHost'
import { AuthPage } from '@/features/auth/AuthPage'
import { RelightStandaloneApp } from '@/features/relight-app/RelightStandaloneApp'
import { useUser } from '@/context/UserContext'
import type { InvoiceRecord } from '@/types/invoice'

function isRelightStandaloneHost() {
  if (typeof window === 'undefined') return false
  const { hostname, pathname, search } = window.location
  if (hostname.toLowerCase().startsWith('relight.')) return true
  if (['localhost', '127.0.0.1'].includes(hostname)) {
    return pathname.startsWith('/relight-studio') || new URLSearchParams(search).get('app') === 'relight'
  }
  return false
}

function DashboardContent() {
  const { isAuthenticated, authLoading, dataLoading, dataError, invoices, saveInvoices } = useUser()
  const [activeTab, setActiveTab] = React.useState('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(true)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const invoicesRef = React.useRef(invoices)
  React.useEffect(() => {
    invoicesRef.current = invoices
  }, [invoices])

  // Listen for internal tab navigation events (e.g. from app launcher cards)
  React.useEffect(() => {
    const handleTabNav = (e: Event) => {
      const customEvent = e as CustomEvent<string>
      if (customEvent.detail) {
        setActiveTab(customEvent.detail)
      }
    }
    window.addEventListener('navigate-tab', handleTabNav)
    return () => window.removeEventListener('navigate-tab', handleTabNav)
  }, [])

  // Listen for Ctrl+K or Cmd+K
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  React.useEffect(() => {
    const handleInvoiceUpdate = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'INVOICES_UPDATED') return
      const invoiceFrame = document.querySelector<HTMLIFrameElement>('#invoice-editor')
      if (!invoiceFrame || event.source !== invoiceFrame.contentWindow) return
      if (!Array.isArray(event.data.invoices)) return
      const updatedInvoices = event.data.invoices as InvoiceRecord[]
      if (!updatedInvoices.every((invoice) => invoice && typeof invoice.id === 'string')) return
      
      // Prevent infinite feedback loop if incoming data identical to current state (ignoring timestamps & key order)
      if (invoiceListSignature(updatedInvoices) === invoiceListSignature(invoicesRef.current)) {
        return
      }

      saveInvoices(updatedInvoices).catch((error: unknown) => {
        console.error('Invoice synchronization failed:', error)
      })
    }

    window.addEventListener('message', handleInvoiceUpdate)
    return () => window.removeEventListener('message', handleInvoiceUpdate)
  }, [saveInvoices])

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memeriksa sesi akun...</div>
  }
  if (!isAuthenticated) return <AuthPage startupError={dataError} />
  if (dataLoading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Memuat data akun...</div>
  }

  const isLocalWorkflowUnlocked = isLocalhostOrigin()

  const renderActivePage = () => {
    switch (activeTab) {
      case 'overview':
        return <LaunchpadPage initialCategory="all" />
      case 'favorites':
        return <LaunchpadPage initialCategory="favorites" />
      case 'cat-ai':
        return <LaunchpadPage initialCategory="ai" />
      case 'cat-dev':
        return <LaunchpadPage initialCategory="dev" />
      case 'cat-cloud':
        return <LaunchpadPage initialCategory="cloud" />
      case 'cat-utility':
        return <LaunchpadPage initialCategory="utility" />
      case 'security':
        return <SecurityPage />
      case 'invoices-list':
      case 'invoice':
        return <InvoicePage />
      case 'ai-generator':
        return <AiGeneratorPage key="ai-generator" />
      case 'prompt-studio':
        return <AiGeneratorPage key="prompt-studio" initialMode="prompt_studio" />
      case 'downloader':
        return <DownloaderPage />
      case 'automation':
        return isLocalWorkflowUnlocked
          ? <WorkflowStudioPage />
          : <WorkflowLocalOnlyLock onGoHome={() => setActiveTab('overview')} />
      case 'email-manager':
        return <EmailManagerPage />
      case 'admin-users':
        return <SettingsPage initialTab="ai" />
      case 'settings':
        return <SettingsPage />
      default:
        return <LaunchpadPage initialCategory="all" />
    }
  }

  const isEmbeddedPage = ['automation', 'invoice', 'invoices-list', 'ai-generator', 'prompt-studio', 'downloader'].includes(activeTab)

  return (
    <div className={`flex bg-background text-foreground ${isEmbeddedPage ? 'h-dvh overflow-hidden' : 'min-h-screen'}`}>
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab === 'prompt-studio' ? 'ai-generator' : activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0">
        <Header
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          setMobileOpen={setMobileOpen}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className={`flex-1 min-w-0 ${isEmbeddedPage ? 'p-0 w-full min-h-0 flex flex-col overflow-hidden' : activeTab === 'email-manager' ? 'animate-in fade-in duration-200 p-4 sm:p-6 lg:p-8 w-full' : 'animate-in fade-in duration-200 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto'}`}>
          {dataError && (
            <div role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {dataError}
            </div>
          )}
          {renderActivePage()}
        </main>
      </div>

      {/* Global Command Palette (⌘K) */}
      <CommandDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelectTab={(tab) => setActiveTab(tab)}
      />
    </div>
  )
}

export default function App() {
  const standaloneRelight = isRelightStandaloneHost()
  React.useEffect(() => {
    if (standaloneRelight) {
      document.title = 'Relight Studio by siBluudz — AI Photo Lighting'
    }
  }, [standaloneRelight])

  if (standaloneRelight) {
    return <RelightStandaloneApp />
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="sibluudz-theme">
      <UserProvider>
        <DashboardContent />
      </UserProvider>
    </ThemeProvider>
  )
}
