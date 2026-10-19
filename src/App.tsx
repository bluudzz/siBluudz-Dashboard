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
import { AiGeneratorPage } from '@/features/ai-generator/AiGeneratorPage'
import { EmailManagerPage } from '@/features/mail/EmailManagerPage'
import { AuthPage } from '@/features/auth/AuthPage'
import { useUser } from '@/context/UserContext'
import type { InvoiceRecord } from '@/types/invoice'

function DashboardContent() {
  const { isAuthenticated, authLoading, dataLoading, dataError, invoices, saveInvoices } = useUser()
  const [activeTab, setActiveTab] = React.useState('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const invoicesRef = React.useRef(invoices)
  invoicesRef.current = invoices

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
      
      // Prevent infinite feedback loop if incoming data identical to current state
      if (JSON.stringify(updatedInvoices) === JSON.stringify(invoicesRef.current)) return

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
        return <AiGeneratorPage />
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

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        collapsed={sidebarCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col min-w-0">
        <Header
          activeTab={activeTab}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
          setMobileOpen={setMobileOpen}
          onOpenSearch={() => setSearchOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
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
  return (
    <ThemeProvider defaultTheme="dark" storageKey="sibluudz-theme">
      <UserProvider>
        <DashboardContent />
      </UserProvider>
    </ThemeProvider>
  )
}
