import * as React from 'react'
import {
  Search,
  X,
  ArrowRight,
  LayoutGrid,
  Star,
  Bot,
  Terminal,
  Cloud,
  Wrench,
  Settings,
  ShieldCheck,
  Receipt,
  Sparkles,
  Users,
  Mail,
} from 'lucide-react'
import { useUser } from '@/context/UserContext'

interface CommandDialogProps {
  open: boolean
  onClose: () => void
  onSelectTab: (tab: string) => void
}

export function CommandDialog({ open, onClose, onSelectTab }: CommandDialogProps) {
  const { profile } = useUser()
  const [query, setQuery] = React.useState('')

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) onClose()
      }
      if (e.key === 'Escape' && open) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const navigationCommands = [
    { title: 'App Launcher (Home)', tab: 'overview', icon: LayoutGrid, category: 'Launchpad' },
    { title: 'Favorit Pinned', tab: 'favorites', icon: Star, category: 'Launchpad' },
    { title: 'AI & LLM Hub', tab: 'cat-ai', icon: Bot, category: 'Kategori' },
    { title: 'Dev & Local Projects', tab: 'cat-dev', icon: Terminal, category: 'Kategori' },
    { title: 'Cloud & Deploy', tab: 'cat-cloud', icon: Cloud, category: 'Kategori' },
    { title: 'Utilities & Scraper', tab: 'cat-utility', icon: Wrench, category: 'Kategori' },
    { title: 'AI Generator', tab: 'ai-generator', icon: Sparkles, category: 'Aplikasi' },
    { title: 'Auto Workflow Studio (n8n Bot)', tab: 'automation', icon: Terminal, category: 'Aplikasi' },
    { title: 'AI Generator → Prompt Studio', tab: 'prompt-studio', icon: Sparkles, category: 'Tool AI' },
    { title: 'Email Manager', tab: 'email-manager', icon: Mail, category: 'Aplikasi' },
    { title: 'Invoice App (Daftar & Builder)', tab: 'invoice', icon: Receipt, category: 'Aplikasi' },
    ...(profile.role === 'admin'
      ? [{ title: 'Pengaturan 9router AI & Pengguna', tab: 'admin-users', icon: Users, category: 'Admin' }]
      : []),
    { title: 'Security Vault & Keys', tab: 'security', icon: ShieldCheck, category: 'Keamanan' },
    { title: 'Pengaturan Sistem', tab: 'settings', icon: Settings, category: 'Sistem' },
  ]

  const filtered = navigationCommands.filter((item) =>
    item.title.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ketik nama halaman atau aksi..."
            autoFocus
            className="flex-1 bg-transparent px-3 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command list */}
        <div className="p-2 max-h-80 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              Tidak ada hasil yang cocok dengan &quot;{query}&quot;
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Navigasi Cepat
              </div>
              {filtered.map((cmd) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.tab}
                    onClick={() => {
                      onSelectTab(cmd.tab)
                      onClose()
                    }}
                    className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      <span>{cmd.title}</span>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Navigasi: <kbd className="font-mono rounded border border-border bg-card px-1">↑</kbd> <kbd className="font-mono rounded border border-border bg-card px-1">↓</kbd></span>
            <span>Pilih: <kbd className="font-mono rounded border border-border bg-card px-1">Enter</kbd></span>
          </div>
          <span>Tutup: <kbd className="font-mono rounded border border-border bg-card px-1">Esc</kbd></span>
        </div>
      </div>
    </div>
  )
}
