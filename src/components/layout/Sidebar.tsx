import { navigationSections } from './navData'
import { Badge } from '@/components/ui/Badge'
import { useUser } from '@/context/UserContext'
import { cn } from '@/lib/utils'
import {
  Layers,
  X,
  Zap,
} from 'lucide-react'

interface SidebarProps {
  activeTab: string
  setActiveTab: (tab: string) => void
  collapsed: boolean
  mobileOpen: boolean
  setMobileOpen: (open: boolean) => void
}

export function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) {
  const { profile } = useUser()
  const isPro = profile.tier === 'pro' || profile.role === 'admin'
  const visibleSections = navigationSections.filter((section) => !section.adminOnly || profile.role === 'admin')

  return (
    <>
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out md:sticky md:top-0 md:h-screen md:shrink-0',
          // Desktop collapse logic
          collapsed ? 'md:w-18' : 'md:w-64',
          // Mobile open logic
          mobileOpen ? 'translate-x-0 w-72 shadow-2xl' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-3 overflow-hidden">
            {/* Glowing Logo Icon */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 via-indigo-600 to-sky-500 text-white shadow-md shadow-blue-500/20">
              <Layers className="h-5 w-5" />
            </div>

            {(!collapsed || mobileOpen) && (
              <div className="flex flex-col overflow-hidden transition-all duration-200">
                <span className="truncate text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                  siBluudz
                  <span className={cn(
                    'text-[10px] uppercase font-bold px-1.5 py-0.2 rounded',
                    isPro ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  )}>
                    {profile.role === 'admin' ? 'Admin' : (isPro ? 'Pro' : 'Free')}
                  </span>
                </span>
                <span className="truncate text-[11px] font-medium text-muted-foreground">
                  Modern Dashboard UI
                </span>
              </div>
            )}
          </div>

          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {visibleSections.map((section, idx) => (
            <div key={idx} className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2">
                  {section.title}
                </p>
              )}

              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon
                  const isActive = activeTab === item.id

                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id)
                        if (mobileOpen) setMobileOpen(false)
                      }}
                      title={collapsed && !mobileOpen ? item.title : undefined}
                      className={cn(
                        'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 cursor-pointer',
                        isActive
                          ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon
                        className={cn(
                          'h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-110',
                          isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'
                        )}
                      />

                      {(!collapsed || mobileOpen) && (
                        <>
                          <span className="flex-1 truncate text-left">{item.title}</span>
                          {item.badge && (
                            <Badge
                              variant={isActive ? 'outline' : 'secondary'}
                              className={cn(
                                'text-[10px] px-1.5 py-0 font-normal shrink-0',
                                isActive && 'border-white/30 text-white'
                              )}
                            >
                              {item.badge}
                            </Badge>
                          )}
                        </>
                      )}

                      {/* Tooltip hint on hover when collapsed */}
                      {collapsed && !mobileOpen && (
                        <div className="absolute left-full ml-2 hidden rounded-md border border-border bg-popover px-2.5 py-1 text-xs font-semibold text-popover-foreground shadow-md group-hover:block z-50 whitespace-nowrap">
                          {item.title}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Workspace / Version Banner */}
        {(!collapsed || mobileOpen) ? (
          <div className="p-3 border-t border-sidebar-border space-y-2">
            <div className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-transparent p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-blue-500" />
                  {profile.role === 'admin' ? 'Akses Admin' : (isPro ? 'Akun Pro' : 'Free Tier')}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  {profile.role === 'admin' ? 'Unlimited' : `${profile.aiUsageToday || 0}/${profile.aiDailyLimit || 5}`}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {profile.role === 'admin'
                  ? 'Akses admin penuh & kuota AI tanpa batas.'
                  : isPro
                  ? 'Kuota harian Pro aktif untuk akses AI 9router.'
                  : `Batas harian ${profile.aiDailyLimit || 5} request AI. Reset tiap 00:00.`}
              </p>
            </div>
          </div>
        ) : (
          <div className="p-3 border-t border-sidebar-border flex justify-center">
            <div className="h-2 w-2 rounded-full bg-emerald-500" title="Sistem Aktif" />
          </div>
        )}
      </aside>
    </>
  )
}
