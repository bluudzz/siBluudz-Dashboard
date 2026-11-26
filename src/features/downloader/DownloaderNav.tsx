import * as React from 'react'
import {
  Camera,
  Check,
  ChevronDown,
  Clapperboard,
  Clock,
  Download,
  Film,
  History,
  Images,
} from 'lucide-react'
import {
  DOWNLOADER_GROUPS,
  DOWNLOADER_MODES,
  getDownloaderTool,
} from './downloader-catalog'
import type { DownloaderMode, DownloaderStatus } from './downloader-catalog'

const modeIcons: Record<DownloaderMode, React.ComponentType<{ size?: number; className?: string }>> = {
  tiktok_video: Film,
  tiktok_photo: Images,
  tiktok_story: Clock,
  instagram_reel: Clapperboard,
  instagram_photo: Camera,
  instagram_story: Clock,
}

export function DownloaderModeIcon({ mode, size = 16 }: { mode: DownloaderMode; size?: number }) {
  const Icon = modeIcons[mode] || Download
  return <Icon size={size} aria-hidden="true" />
}

function DownloaderBrandMark() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      className="dl-brand-mark"
      aria-hidden="true"
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M12 7.5V14.5M12 14.5L8.75 11.25M12 14.5L15.25 11.25"
        stroke="var(--dl-accent)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.5 17H15.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

interface DownloaderNavProps {
  mode: DownloaderMode
  disabled: boolean
  status: DownloaderStatus | null
  onSelect: (mode: DownloaderMode) => void
  onOpenHistory: () => void
}

export function DownloaderNav({
  mode,
  disabled,
  status,
  onSelect,
  onOpenHistory,
}: DownloaderNavProps) {
  const [menuOpen, setMenuOpen] = React.useState(false)
  const mobileMenuRef = React.useRef<HTMLDivElement>(null)
  const mobileTriggerRef = React.useRef<HTMLButtonElement>(null)
  const activeTool = getDownloaderTool(mode)

  React.useEffect(() => {
    if (!menuOpen) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
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

  const select = (next: DownloaderMode) => {
    onSelect(next)
    setMenuOpen(false)
  }

  const engineOnline = Boolean(status?.ytDlpAvailable)

  const actionButtons = (
    <button
      type="button"
      className="dl-rail-action-btn"
      onClick={onOpenHistory}
      aria-label="Riwayat unduhan"
      title="Riwayat unduhan"
    >
      <History size={15} aria-hidden="true" />
      <span className="dl-action-label">Riwayat</span>
    </button>
  )

  return (
    <aside className="dl-rail" aria-label="Navigasi Downloader">
      <div className="dl-rail-top">
        <div className="dl-brand">
          <DownloaderBrandMark />
          <div className="dl-brand-text">
            <span className="dl-brand-name">Downloader</span>
            <span className="dl-brand-scope">TikTok &amp; Instagram</span>
          </div>
        </div>

        <div className="dl-mobile-tools" ref={mobileMenuRef}>
          <button
            ref={mobileTriggerRef}
            type="button"
            className="dl-mobile-tool-trigger"
            aria-label={`Fitur aktif: ${activeTool.title}. Pilih downloader`}
            aria-haspopup="listbox"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <span className="dl-mobile-tool-trigger-main">
              <span className="dl-mobile-tool-icon" aria-hidden="true">
                <DownloaderModeIcon mode={mode} size={15} />
              </span>
              <span className="dl-mobile-tool-label">{activeTool.title}</span>
            </span>
            <ChevronDown
              size={15}
              className={`dl-mobile-tool-chevron${menuOpen ? ' is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          {menuOpen && (
            <div className="dl-mobile-tool-menu" role="listbox" aria-label="Pilih mode downloader">
              {DOWNLOADER_GROUPS.map((group) => (
                <div key={group.id} className="dl-mobile-tool-group" role="group" aria-label={group.label}>
                  <p className="dl-mobile-tool-group-label">{group.label}</p>
                  {DOWNLOADER_MODES.filter((item) => item.group === group.id).map((item) => {
                    const isActive = mode === item.mode
                    return (
                      <button
                        key={item.mode}
                        type="button"
                        role="option"
                        aria-selected={isActive}
                        className="dl-mobile-tool-option"
                        onClick={() => select(item.mode)}
                      >
                        <span className="dl-mobile-tool-option-main">
                          <DownloaderModeIcon mode={item.mode} size={15} />
                          <span>{item.title}</span>
                        </span>
                        {isActive && <Check size={14} aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="dl-compact-actions">{actionButtons}</div>
      </div>

      <nav className="dl-rail-nav" aria-label="Mode Downloader">
        {DOWNLOADER_GROUPS.map((group) => (
          <div key={group.id} className="dl-rail-group">
            <p className="dl-rail-group-label">{group.label}</p>
            <div className="dl-rail-group-items">
              {DOWNLOADER_MODES.filter((item) => item.group === group.id).map((item) => {
                const isActive = mode === item.mode
                return (
                  <button
                    key={item.mode}
                    type="button"
                    aria-pressed={isActive}
                    disabled={disabled}
                    onClick={() => select(item.mode)}
                    className="dl-rail-item"
                  >
                    <DownloaderModeIcon mode={item.mode} size={16} />
                    <span className="dl-rail-item-label">{item.title}</span>
                    <span className="dl-rail-item-kind">{item.kindLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="dl-rail-footer">
        <div className="dl-rail-status">
          <span className="dl-connection">
            <span
              className={`dl-status-dot ${engineOnline ? 'is-connected' : 'is-offline'}`}
              aria-hidden="true"
            />
            <span>{engineOnline ? 'Engine yt-dlp siap' : 'TikWM aktif (yt-dlp offline)'}</span>
          </span>
        </div>
        <div className="dl-rail-actions">{actionButtons}</div>
      </div>
    </aside>
  )
}
