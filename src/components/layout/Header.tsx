import * as React from 'react'
import {
  Bell,
  Search,
  Moon,
  Sun,
  Menu,
  PanelLeftClose,
  PanelLeft,
  User,
  Sliders,
  LogOut,
  Sparkles,
} from 'lucide-react'
import { useTheme } from '@/context/ThemeContext'
import { useUser } from '@/context/UserContext'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'

interface HeaderProps {
  activeTab: string
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean | ((prev: boolean) => boolean)) => void
  setMobileOpen: (v: boolean | ((prev: boolean) => boolean)) => void
  onOpenSearch: () => void
}

export function Header({
  activeTab,
  sidebarCollapsed,
  setSidebarCollapsed,
  setMobileOpen,
  onOpenSearch,
}: HeaderProps) {
  const { setTheme, resolvedTheme } = useTheme()
  const { profile, signOut } = useUser()
  const [showNotifications, setShowNotifications] = React.useState(false)
  const [showUserMenu, setShowUserMenu] = React.useState(false)
  const [signOutError, setSignOutError] = React.useState('')

  // format tab label
  const pageTitleMap: Record<string, string> = {
    overview: 'App Launcher (Home)',
    favorites: 'Favorit Pinned',
    'cat-ai': 'AI & LLM Hub',
    'cat-dev': 'Dev & Projects',
    'cat-cloud': 'Cloud & Deploy',
    'cat-utility': 'Utilities & Scraper',
    'ai-generator': 'AI Generator',
    'invoices-list': 'Invoice App',
    invoice: 'Invoice App',
    'admin-users': 'Kelola Pengguna & AI',
    security: 'Security Vault',
    settings: 'Pengaturan',
  }
  const pageTitle = pageTitleMap[activeTab] || (activeTab.charAt(0).toUpperCase() + activeTab.slice(1))

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-md sm:px-6">
      {/* Left side: Hamburger (mobile), Collapse button (desktop), Breadcrumbs */}
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="md:hidden"
          aria-label="Buka menu navigasi"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Desktop sidebar collapse toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          className="hidden md:flex text-muted-foreground hover:text-foreground"
          title={sidebarCollapsed ? 'Perluas Sidebar' : 'Ciutkan Sidebar'}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </Button>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground hidden sm:inline">Dashboard</span>
          <span className="text-muted-foreground/60 hidden sm:inline">/</span>
          <span className="font-semibold text-foreground tracking-tight">{pageTitle}</span>
        </div>
      </div>

      {/* Right side: Search, Theme, Notifications, User Profile */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Search trigger button */}
        <button
          onClick={onOpenSearch}
          className="flex h-9 w-40 sm:w-60 items-center justify-between rounded-lg border border-input bg-card/60 px-3 text-xs text-muted-foreground shadow-2xs hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-2 truncate">
            <Search className="h-3.5 w-3.5" />
            <span className="truncate">Cari apapun...</span>
          </span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          className="rounded-lg text-muted-foreground hover:text-foreground"
          aria-label="Toggle tema"
        >
          {resolvedTheme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400 transition-transform hover:rotate-45" />
          ) : (
            <Moon className="h-4 w-4 text-slate-700 transition-transform hover:-rotate-12" />
          )}
        </Button>

        {/* Notifications Popover */}
        <div className="relative">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowNotifications(!showNotifications)
              setShowUserMenu(false)
            }}
            className="relative rounded-lg text-muted-foreground hover:text-foreground"
            aria-label="Notifikasi"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-500 opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-600"></span>
            </span>
          </Button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border bg-popover p-4 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-semibold text-foreground">Notifikasi</h4>
                  <Badge variant="default" className="text-[10px] px-1.5 py-0">3 Baru</Badge>
                </div>
                <button
                  onClick={() => setShowNotifications(false)}
                  className="text-xs text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                >
                  Tandai dibaca
                </button>
              </div>

              <div className="mt-2 space-y-2.5 max-h-72 overflow-y-auto">
                <div className="rounded-lg p-2.5 bg-accent/40 hover:bg-accent/70 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Sistem Siap Digunakan</span>
                    <span className="text-[10px] text-muted-foreground">Baru saja</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Template siBluudz Dashboard telah diinisialisasi dan siap diisi modul aplikasi Anda.
                  </p>
                </div>

                <div className="rounded-lg p-2.5 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Pembaruan Komponen</span>
                    <span className="text-[10px] text-muted-foreground">10m lalu</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Modul responsif, dark mode, dan command palette aktif otomatis.
                  </p>
                </div>

                <div className="rounded-lg p-2.5 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">Audit Keamanan UI</span>
                    <span className="text-[10px] text-muted-foreground">1j lalu</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Semua dependensi dan styling diverifikasi aman dan optimal.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => {
              setShowUserMenu(!showUserMenu)
              setShowNotifications(false)
            }}
            className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
          >
            <Avatar
              fallback={profile.name ? profile.name.slice(0, 2).toUpperCase() : profile.email.slice(0, 2).toUpperCase() || 'U'}
              className="h-8 w-8 ring-2 ring-primary/20 ring-offset-1 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-semibold text-xs"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-border bg-popover p-2 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="px-3 py-2 border-b border-border mb-1">
                <p className="text-sm font-semibold text-foreground">{profile.name || 'Pengguna'}</p>
                <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                <p className="text-[10px] text-blue-500 font-medium truncate mt-0.5">{profile.company}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Badge variant={profile.role === 'admin' ? 'default' : (profile.tier === 'pro' ? 'default' : 'secondary')} className="text-[10px] py-0">
                    {profile.role === 'admin' ? 'Admin' : (profile.tier === 'pro' ? 'Pro' : 'Free')}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    AI: {profile.role === 'admin' ? 'Unlimited' : `${profile.aiUsageToday || 0}/${profile.aiDailyLimit || 5}`}
                  </span>
                </div>
              </div>

              <div className="space-y-0.5 text-xs">
                <button
                  onClick={() => setShowUserMenu(false)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                >
                  <User className="h-4 w-4 text-muted-foreground" />
                  Profil Akun
                </button>
                <button
                  onClick={() => setShowUserMenu(false)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                >
                  <Sliders className="h-4 w-4 text-muted-foreground" />
                  Preferensi
                </button>
                <button
                  onClick={() => setShowUserMenu(false)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
                >
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Upgrade Pro
                </button>
                <div className="border-t border-border my-1"></div>
                {signOutError && <p role="alert" className="px-3 py-2 text-[11px] text-destructive">{signOutError}</p>}
                <button
                  onClick={() => {
                    setSignOutError('')
                    signOut().then(() => setShowUserMenu(false)).catch((error: unknown) => {
                      console.error('Failed to sign out:', error)
                      setSignOutError('Tidak dapat keluar. Silakan coba lagi.')
                    })
                  }}
                  className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                >
                  <LogOut className="h-4 w-4 text-destructive" />
                  Keluar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
