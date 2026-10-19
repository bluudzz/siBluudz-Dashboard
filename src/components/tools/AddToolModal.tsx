import * as React from 'react'
import type { ToolItem, ToolCategory } from '@/types/tool'
import { ToolIcon } from './ToolIcon'
import { X, Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface AddToolModalProps {
  open: boolean
  onClose: () => void
  onAddTool: (tool: ToolItem) => void
}

const colorPresets = [
  { label: 'Blue Gradient', value: 'from-blue-600 to-cyan-700' },
  { label: 'Emerald Gradient', value: 'from-emerald-500 to-teal-700' },
  { label: 'Purple Gradient', value: 'from-violet-600 to-purple-800' },
  { label: 'Rose Gradient', value: 'from-rose-500 to-pink-600' },
  { label: 'Amber Gradient', value: 'from-amber-500 to-orange-600' },
  { label: 'Indigo Gradient', value: 'from-indigo-600 to-blue-700' },
  { label: 'Dark Slate', value: 'from-slate-700 to-zinc-900' },
]

const iconPresets = [
  'Bot',
  'Sparkles',
  'Receipt',
  'Mail',
  'Terminal',
  'Database',
  'Cloud',
  'Globe',
  'Palette',
  'FileText',
  'Radio',
  'Activity',
  'Key',
  'Server',
  'Zap',
  'Code2',
]

export function AddToolModal({ open, onClose, onAddTool }: AddToolModalProps) {
  const [name, setName] = React.useState('')
  const [url, setUrl] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [category, setCategory] = React.useState<ToolCategory>('dev')
  const [icon, setIcon] = React.useState('Globe')
  const [gradient, setGradient] = React.useState(colorPresets[0].value)
  const [isLocalhost, setIsLocalhost] = React.useState(false)
  const [port, setPort] = React.useState('')
  const [tagsInput, setTagsInput] = React.useState('')

  if (!open) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !url.trim()) return

    const parsedTags = tagsInput
      ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean)
      : [category.toUpperCase()]

    const newTool: ToolItem = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      url: url.trim(),
      description: description.trim() || 'Custom private service / web application',
      category,
      icon,
      gradient,
      isLocalhost,
      port: port ? parseInt(port, 10) || port : undefined,
      status: 'online',
      tags: parsedTags,
      isFavorite: false,
    }

    onAddTool(newTool)
    onClose()

    // Reset form
    setName('')
    setUrl('')
    setDescription('')
    setPort('')
    setTagsInput('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Plus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Tambah Tool / Web Baru</h2>
              <p className="text-xs text-muted-foreground">
                Tautkan proyek lokal, website, atau tool favorit Anda
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Nama Tool / Proyek <span className="text-destructive">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Local Next.js App, N8N, Dify, Portainer"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              URL / Link Tujuan <span className="text-destructive">*</span>
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com atau http://localhost:8080"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Kategori
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ToolCategory)}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="dev">Dev & Projects</option>
                <option value="ai">AI & Models</option>
                <option value="cloud">Cloud & Server</option>
                <option value="productivity">Productivity</option>
                <option value="media">Media & Design</option>
                <option value="utility">Utilities</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Tags (Pisah koma)
              </label>
              <Input
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Next.js, API, Docker"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Deskripsi Singkat
            </label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Deskripsi fungsi tool ini..."
            />
          </div>

          {/* Localhost switch */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-accent/40 border border-border/50">
            <div>
              <span className="text-sm font-medium text-foreground">Aplikasi Localhost?</span>
              <p className="text-xs text-muted-foreground">Berjalan di port lokal laptop Anda</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLocalhost"
                checked={isLocalhost}
                onChange={(e) => setIsLocalhost(e.target.checked)}
                className="w-4 h-4 rounded text-primary focus:ring-primary"
              />
              {isLocalhost && (
                <input
                  type="text"
                  placeholder="Port: 3000"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-24 h-8 px-2 rounded-md border border-input bg-background text-xs"
                />
              )}
            </div>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Pilih Ikon
            </label>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto p-1.5 rounded-lg border border-border/60 bg-muted/30">
              {iconPresets.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={cn(
                    'p-2 rounded-lg transition-all',
                    icon === ic
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ToolIcon name={ic} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {/* Color Gradient Selector */}
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Warna Kartu Ikon
            </label>
            <div className="flex flex-wrap gap-2">
              {colorPresets.map((preset) => (
                <button
                  type="button"
                  key={preset.value}
                  onClick={() => setGradient(preset.value)}
                  className={cn(
                    'w-7 h-7 rounded-lg bg-gradient-to-br transition-transform',
                    preset.value,
                    gradient === preset.value
                      ? 'ring-2 ring-primary ring-offset-2 ring-offset-background scale-110'
                      : 'opacity-80 hover:opacity-100 hover:scale-105'
                  )}
                  title={preset.label}
                />
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border/60">
            <Button type="button" variant="outline" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" className="gap-2">
              <Sparkles className="w-4 h-4" />
              Simpan Tool
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
