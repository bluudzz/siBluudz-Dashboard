import * as React from 'react'
import {
  Check,
  ChevronDown,
  ClipboardCheck,
  Globe2,
  Image,
  PanelsTopLeft,
  Replace,
  Search,
  Sun,
  X,
} from 'lucide-react'
import { generatorTools, toolGroups } from './tool-catalog'
import type { GeneratorMode } from './tool-catalog'

const icons: Record<GeneratorMode, React.ComponentType<{ size?: number; className?: string }>> = {
  prompt_checker: ClipboardCheck,
  prompt_studio: PanelsTopLeft,
  website_prompt: Globe2,
  image_prompt: Image,
  product_swap: Replace,
  relight_studio: Sun,
}

export function AiToolIcon({ mode, size = 16 }: { mode: GeneratorMode; size?: number }) {
  const Icon = icons[mode]
  return <Icon size={size} aria-hidden="true" />
}

function StudioMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="ag-brand-mark"
      aria-hidden="true"
    >
      <path
        d="M4 7.5L12 3L20 7.5V16.5L12 21L4 16.5V7.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M12 3V12M12 12L20 7.5M12 12L4 7.5"
        stroke="var(--ag-accent)"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.2" fill="var(--ag-accent)" />
    </svg>
  )
}

interface ToolNavigationProps {
  mode: GeneratorMode
  disabled: boolean
  onSelect: (mode: GeneratorMode) => void
  draftModes?: Partial<Record<GeneratorMode, boolean>>
  connectionStatus?: React.ReactNode
  quotaSummary?: React.ReactNode
  actions?: React.ReactNode
}

export function ToolNavigation({
  mode,
  disabled,
  onSelect,
  draftModes,
  connectionStatus,
  quotaSummary,
  actions,
}: ToolNavigationProps) {
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const dialogRef = React.useRef<HTMLDialogElement>(null)
  const activeToolRef = React.useRef<HTMLButtonElement>(null)
  const mobileMenuRef = React.useRef<HTMLDivElement>(null)
  const mobileTriggerRef = React.useRef<HTMLButtonElement>(null)
  const activeTool = generatorTools.find((tool) => tool.mode === mode) || generatorTools[0]

  const matchingTools = generatorTools.filter((tool) =>
    `${tool.title} ${tool.description} ${tool.kindLabel}`.toLowerCase().includes(search.toLowerCase())
  )

  React.useEffect(() => {
    const dialog = dialogRef.current
    if (open && dialog && !dialog.open) dialog.showModal()
    if (!open && dialog?.open) dialog.close()
  }, [open])

  React.useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        mobileTriggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  React.useEffect(() => {
    activeToolRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [mode])

  const select = (next: GeneratorMode) => {
    onSelect(next)
    setOpen(false)
    setMenuOpen(false)
  }

  return (
    <>
      <aside className="ag-rail" aria-label="Navigasi AI Studio">
        <div className="ag-rail-top">
          <div className="ag-brand">
            <StudioMark />
            <div className="ag-brand-text">
              <span className="ag-brand-name">AI Studio</span>
              <span className="ag-brand-scope">Workbench</span>
            </div>
          </div>

          <div className="ag-mobile-tools" ref={mobileMenuRef}>
            <button
              ref={mobileTriggerRef}
              id="ai-tool-select"
              type="button"
              className="ag-mobile-tool-trigger"
              aria-label={`Tool aktif: ${activeTool.title}. Pilih tool AI`}
              aria-haspopup="listbox"
              aria-expanded={menuOpen}
              aria-controls="ai-mobile-tool-listbox"
              disabled={disabled}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <span className="ag-mobile-tool-trigger-main">
                <span className="ag-mobile-tool-icon" aria-hidden="true">
                  <AiToolIcon mode={mode} size={15} />
                </span>
                <span className="ag-mobile-tool-label">
                  {activeTool.headerTitle || activeTool.title}
                </span>
              </span>
              <ChevronDown
                size={15}
                className={`ag-mobile-tool-chevron${menuOpen ? ' is-open' : ''}`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                id="ai-mobile-tool-listbox"
                className="ag-mobile-tool-menu"
                role="listbox"
                aria-label="Pilih tool AI"
              >
                {toolGroups.map((group) => (
                  <div key={group.id} className="ag-mobile-tool-group" role="group" aria-label={group.label}>
                    <p className="ag-mobile-tool-group-label">{group.label}</p>
                    {generatorTools
                      .filter((tool) => tool.group === group.id)
                      .map((tool) => {
                        const isActive = mode === tool.mode
                        const hasDraft = Boolean(draftModes?.[tool.mode])
                        return (
                          <button
                            key={tool.mode}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            className="ag-mobile-tool-option"
                            onClick={() => select(tool.mode)}
                          >
                            <span className="ag-mobile-tool-option-main">
                              <AiToolIcon mode={tool.mode} size={15} />
                              <span>{tool.title}</span>
                            </span>
                            <span className="ag-mobile-tool-option-meta">
                              {hasDraft && <span className="ag-draft-dot" aria-hidden="true" />}
                              {isActive && <Check size={14} aria-hidden="true" />}
                            </span>
                          </button>
                        )
                      })}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ag-rail-top-actions">
            <button
              type="button"
              className="ag-find-btn"
              aria-label="Cari tool"
              aria-haspopup="dialog"
              onClick={() => {
                setSearch('')
                setOpen(true)
              }}
              disabled={disabled}
            >
              <Search size={15} aria-hidden="true" />
              <span>Cari</span>
            </button>
            <div className="ag-compact-actions">{actions}</div>
          </div>
        </div>

        <nav className="ag-rail-nav" aria-label="Tool AI">
          {toolGroups.map((group) => (
            <div key={group.id} className="ag-rail-group">
              <p className="ag-rail-group-label">{group.label}</p>
              <div className="ag-rail-group-items">
                {generatorTools
                  .filter((tool) => tool.group === group.id)
                  .map((tool) => {
                    const isActive = mode === tool.mode
                    const hasDraft = Boolean(draftModes?.[tool.mode])
                    return (
                      <button
                        key={tool.mode}
                        type="button"
                        ref={isActive ? activeToolRef : undefined}
                        data-mode={tool.mode}
                        aria-pressed={isActive}
                        disabled={disabled}
                        onClick={() => select(tool.mode)}
                        className="ag-rail-item"
                      >
                        <AiToolIcon mode={tool.mode} size={16} />
                        <span className="ag-rail-item-label">{tool.title}</span>
                        {hasDraft && (
                          <span
                            className="ag-draft-dot"
                            title="Memiliki draf aktif"
                            aria-label="Memiliki draf aktif"
                          />
                        )}
                      </button>
                    )
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="ag-rail-footer">
          <div className="ag-rail-status">
            {connectionStatus}
            {quotaSummary}
          </div>
          <div className="ag-rail-actions">{actions}</div>
        </div>
      </aside>

      <dialog
        ref={dialogRef}
        className="ag-dialog ag-tool-picker-dialog"
        aria-labelledby="ai-tool-picker-title"
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <div className="ag-dialog-head">
          <div>
            <h2 id="ai-tool-picker-title">Pilih tool AI</h2>
            <p className="ag-muted">Pilih ruang kerja sesuai kebutuhan prompt atau olah foto.</p>
          </div>
          <button
            type="button"
            className="ag-icon-btn"
            aria-label="Tutup pilihan tool"
            onClick={() => setOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <label className="ag-search-box">
          <Search size={16} aria-hidden="true" />
          <input
            autoFocus
            aria-label="Cari tool AI"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari prompt, foto, relight, atau coding..."
          />
        </label>

        <div className="ag-tool-picker-results">
          {matchingTools.map((tool) => (
            <button
              key={tool.mode}
              type="button"
              onClick={() => select(tool.mode)}
              aria-pressed={mode === tool.mode}
              className="ag-picker-item"
            >
              <span className="ag-picker-icon">
                <AiToolIcon mode={tool.mode} size={18} />
              </span>
              <span className="ag-picker-copy">
                <strong>
                  {tool.title}
                  <span className="ag-picker-kind">{tool.kindLabel}</span>
                </strong>
                <small>{tool.description}</small>
              </span>
            </button>
          ))}
          {!matchingTools.length && (
            <p className="ag-empty-note">Tool tidak ditemukan. Coba kata kunci lain.</p>
          )}
        </div>
      </dialog>
    </>
  )
}
