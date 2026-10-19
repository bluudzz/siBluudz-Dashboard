import * as React from 'react'
import type { ToolItem } from '@/types/tool'
import { ToolIcon } from './ToolIcon'
import { ExternalLink, Star, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ToolCardProps {
  tool: ToolItem
  onToggleFavorite: (id: string) => void
  onDelete?: (id: string) => void
}

export function ToolCard({ tool, onToggleFavorite, onDelete }: ToolCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    // Prevent navigation if clicking interactive actions
    if ((e.target as HTMLElement).closest('button')) {
      return
    }
    if (tool.url && tool.url.startsWith('#')) {
      window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tool.url.replace(/^#/, '') }))
      return
    }
    if (tool.url && tool.url !== '#') {
      window.open(tool.url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex flex-col justify-between p-4 sm:p-5 rounded-2xl cursor-pointer',
        'bg-card/70 hover:bg-card border border-border/60 hover:border-primary/40',
        'shadow-sm hover:shadow-xl hover:shadow-primary/5',
        'transition-all duration-300 ease-out transform hover:-translate-y-1.5',
        'backdrop-blur-sm'
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          if (tool.url && tool.url.startsWith('#')) {
            window.dispatchEvent(new CustomEvent('navigate-tab', { detail: tool.url.replace(/^#/, '') }))
            return
          }
          if (tool.url && tool.url !== '#') {
            window.open(tool.url, '_blank', 'noopener,noreferrer')
          }
        }
      }}
    >
      {/* Top Bar: Icon + Actions */}
      <div className="flex items-start justify-between gap-3">
        {/* Smartphone-like App Squircle Icon */}
        <div className="relative">
          <div
            className={cn(
              'w-13 h-13 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center shadow-md bg-gradient-to-br',
              'transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg',
              tool.gradient
            )}
          >
            <ToolIcon name={tool.icon} className={cn('w-7 h-7', tool.iconColor || 'text-white')} />
          </div>

          {/* Status Dot */}
          <span
            className={cn(
              'absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-card',
              tool.status === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
            )}
            title={tool.status === 'online' ? 'Status: Online' : 'Status: Standby'}
          />
        </div>

        {/* Card Action Controls */}
        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite(tool.id)
            }}
            title={tool.isFavorite ? 'Hapus dari favorit' : 'Tambah ke favorit'}
            className={cn(
              'p-1.5 rounded-lg transition-colors',
              tool.isFavorite
                ? 'text-amber-400 hover:text-amber-500 bg-amber-400/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
            )}
          >
            <Star className={cn('w-4 h-4', tool.isFavorite && 'fill-current')} />
          </button>

          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(tool.id)
              }}
              title="Hapus tool ini"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          <a
            href={tool.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Buka di tab baru"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>

      {/* Middle: Title & Description */}
      <div className="mt-4 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-base sm:text-lg text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {tool.name}
          </h3>
          {tool.isLocalhost && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/20">
              LOCAL
            </span>
          )}
        </div>
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {tool.description}
        </p>
      </div>

      {/* Bottom: Tags & URL / Port */}
      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {tool.tags?.slice(0, 2).map((tag, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 rounded-full bg-secondary/80 text-secondary-foreground text-[11px] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono group-hover:text-foreground transition-colors">
          <span>{tool.port ? `:${tool.port}` : 'web'}</span>
        </div>
      </div>
    </div>
  )
}
