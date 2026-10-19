import * as React from 'react'
import type { ToolItem, ToolCategory } from '@/types/tool'
import { defaultTools } from '@/data/initialTools'
import { ToolCard } from '@/components/tools/ToolCard'
import { AddToolModal } from '@/components/tools/AddToolModal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import {
  Search,
  Plus,
  Star,
  Terminal,
  Bot,
  Cloud,
  Palette,
  Wrench,
  Layers,
  Sparkles,
  Server,
  Laptop
} from 'lucide-react'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'sibluudz-launcher-tools'

interface LaunchpadPageProps {
  initialCategory?: ToolCategory | 'favorites'
}

export function LaunchpadPage({ initialCategory = 'all' }: LaunchpadPageProps) {
  const [tools, setTools] = React.useState<ToolItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) {
          // Sync default tool attributes (e.g. icons, gradients) so existing cached items stay fresh
          const synced = parsed.map((item: ToolItem) => {
            const def = defaultTools.find((dt) => dt.id === item.id)
            if (def) {
              return {
                ...def,
                ...item,
                icon: def.icon,
                gradient: def.gradient,
                iconColor: def.iconColor,
                url: def.url,
              }
            }
            return item
          })
          const existingIds = new Set(synced.map((t: ToolItem) => t.id))
          const missingDefaults = defaultTools.filter((dt) => !existingIds.has(dt.id))
          if (missingDefaults.length > 0) {
            return [...missingDefaults, ...synced]
          }
          return synced
        }
      }
    } catch {
      // fallback
    }
    return defaultTools
  })

  const [activeCategory, setActiveCategory] = React.useState<string>(initialCategory)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isAddModalOpen, setIsAddModalOpen] = React.useState(false)

  // Sync to localStorage
  React.useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tools))
    } catch {
      // storage error
    }
  }, [tools])

  // Update category when prop changes
  React.useEffect(() => {
    if (initialCategory) {
      setActiveCategory(initialCategory)
    }
  }, [initialCategory])

  const handleToggleFavorite = (id: string) => {
    setTools((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isFavorite: !t.isFavorite } : t))
    )
  }

  const handleDeleteTool = (id: string) => {
    if (window.confirm('Yakin ingin menghapus tautan tool ini dari dashboard?')) {
      setTools((prev) => prev.filter((t) => t.id !== id))
    }
  }

  const handleAddTool = (newTool: ToolItem) => {
    setTools((prev) => [newTool, ...prev])
  }

  const handleResetDefaults = () => {
    if (window.confirm('Kembalikan daftar tools ke setelan default awal?')) {
      setTools(defaultTools)
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  // Filter tools based on category and search query
  const filteredTools = React.useMemo(() => {
    return tools.filter((tool) => {
      // Category filter
      if (activeCategory === 'favorites' && !tool.isFavorite) {
        return false
      }
      if (
        activeCategory !== 'all' &&
        activeCategory !== 'favorites' &&
        tool.category !== activeCategory
      ) {
        return false
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const matchName = tool.name.toLowerCase().includes(query)
        const matchDesc = tool.description.toLowerCase().includes(query)
        const matchTags = tool.tags?.some((t) => t.toLowerCase().includes(query))
        const matchUrl = tool.url.toLowerCase().includes(query)
        if (!matchName && !matchDesc && !matchTags && !matchUrl) {
          return false
        }
      }

      return true
    })
  }, [tools, activeCategory, searchQuery])

  // Statistics
  const totalTools = tools.length
  const favoriteTools = tools.filter((t) => t.isFavorite)
  const localhostCount = tools.filter((t) => t.isLocalhost).length
  const cloudCount = tools.filter((t) => !t.isLocalhost).length

  const categories = [
    { id: 'all', label: 'Semua Tool', icon: Layers, count: totalTools },
    { id: 'favorites', label: 'Favorit', icon: Star, count: favoriteTools.length },
    { id: 'ai', label: 'AI & LLMs', icon: Bot, count: tools.filter((t) => t.category === 'ai').length },
    { id: 'dev', label: 'Dev & Projects', icon: Terminal, count: tools.filter((t) => t.category === 'dev').length },
    { id: 'cloud', label: 'Cloud & Host', icon: Cloud, count: tools.filter((t) => t.category === 'cloud').length },
    { id: 'media', label: 'Media & Design', icon: Palette, count: tools.filter((t) => t.category === 'media').length },
    { id: 'utility', label: 'Utilities', icon: Wrench, count: tools.filter((t) => t.category === 'utility').length },
  ]

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {/* Hero Banner / Mission Control Header */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 bg-gradient-to-br from-card via-card/90 to-primary/5 border border-border shadow-sm">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
              <Sparkles className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
              siBluudz Private Mission Control
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground">
              App Launcher & Tools Hub
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
              Portal terpusat untuk mengakses semua tool, website eksternal, dan service lokal laptop Anda dengan satu klik.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => setIsAddModalOpen(true)}
              className="gap-2 shadow-lg shadow-primary/20 hover:shadow-primary/30"
              size="lg"
            >
              <Plus className="w-5 h-5" />
              Tambah Tool Baru
            </Button>
          </div>
        </div>

        {/* Quick Stat Counter Cards */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-border/50">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/40 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Tools</p>
              <p className="text-lg font-bold text-foreground">{totalTools}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/40 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Laptop className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Local Services</p>
              <p className="text-lg font-bold text-foreground">{localhostCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/40 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cloud & Web</p>
              <p className="text-lg font-bold text-foreground">{cloudCount}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-border/40 backdrop-blur-sm">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Favorit</p>
              <p className="text-lg font-bold text-foreground">{favoriteTools.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Launch Bar (Favorites - Horizontal Mobile Dock style) */}
      {favoriteTools.length > 0 && activeCategory === 'all' && !searchQuery && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Quick Access Favorit
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {favoriteTools.length} tool disematkan
            </span>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
            {favoriteTools.map((fav) => (
              <a
                key={fav.id}
                href={fav.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'group flex flex-col items-center text-center p-3 rounded-2xl',
                  'bg-card hover:bg-accent border border-border/60 hover:border-primary/50',
                  'shadow-xs hover:shadow-md transition-all duration-200 hover:-translate-y-1'
                )}
                title={fav.description}
              >
                <div
                  className={cn(
                    'w-12 h-12 rounded-xl flex items-center justify-center shadow-md bg-gradient-to-br',
                    fav.gradient,
                    'group-hover:scale-105 transition-transform'
                  )}
                >
                  <span className="text-white text-xs font-bold font-mono">
                    {fav.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                <span className="mt-2 text-xs font-medium text-foreground truncate w-full">
                  {fav.name}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama tool, tag, URL..."
            className="pl-10 h-11 rounded-xl bg-card border-border/80"
          />
        </div>

        {/* Category Pills (Smartphone Menu Tabs) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          {categories.map((cat) => {
            const Icon = cat.icon
            const isActive = activeCategory === cat.id
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:text-foreground hover:bg-accent border border-border/60'
                )}
              >
                <Icon className={cn('w-4 h-4', isActive ? 'text-primary-foreground' : 'text-muted-foreground')} />
                <span>{cat.label}</span>
                <span
                  className={cn(
                    'text-[10px] px-1.5 py-0.2 rounded-full font-mono',
                    isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-muted text-muted-foreground'
                  )}
                >
                  {cat.count}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Apps Grid (Mobile App Icon Grid Aesthetic) */}
      <div>
        {filteredTools.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredTools.map((tool) => (
              <ToolCard
                key={tool.id}
                tool={tool}
                onToggleFavorite={handleToggleFavorite}
                onDelete={tool.id.startsWith('custom-') ? handleDeleteTool : undefined}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center rounded-2xl bg-card border border-border/60">
            <div className="w-14 h-14 rounded-2xl bg-muted mx-auto flex items-center justify-center text-muted-foreground mb-4">
              <Search className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-foreground">Tidak ada tool ditemukan</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Tidak ada aplikasi yang cocok dengan kata kunci "{searchQuery}" atau filter kategori ini.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => { setSearchQuery(''); setActiveCategory('all') }}>
                Reset Pencarian
              </Button>
              <Button size="sm" onClick={() => setIsAddModalOpen(true)}>
                Tambah Tool Ini
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info & Reset */}
      <div className="pt-6 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-3">
        <p>
          💡 <strong>Tips:</strong> Klik kotak untuk langsung membuka tool di tab baru. Tambahkan tool baru sesuka hati untuk menghubungkan port lokal laptop Anda.
        </p>
        <button
          type="button"
          onClick={handleResetDefaults}
          className="hover:underline hover:text-foreground text-[11px] whitespace-nowrap"
        >
          Reset ke Preset Default
        </button>
      </div>

      {/* Add New Tool Modal */}
      <AddToolModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddTool={handleAddTool}
      />
    </div>
  )
}
