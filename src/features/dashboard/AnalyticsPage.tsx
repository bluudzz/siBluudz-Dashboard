import { BarChart3, TrendingUp, Users2, Eye, MousePointerClick, Globe } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

export function AnalyticsPage() {
  const metrics = [
    { label: 'Page Views', val: '284.500', change: '+14.2%', icon: Eye },
    { label: 'Unique Visitors', val: '45.120', change: '+9.8%', icon: Users2 },
    { label: 'Bounce Rate', val: '32.4%', change: '-2.1%', icon: MousePointerClick },
    { label: 'Conversion Rate', val: '4.85%', change: '+1.4%', icon: TrendingUp },
  ]

  const channels = [
    { source: 'Pencarian Organik (Google)', percentage: 48, visits: '136.560' },
    { source: 'Direct / Langsung', percentage: 24, visits: '68.280' },
    { source: 'Media Sosial (Twitter/X, LinkedIn)', percentage: 16, visits: '45.520' },
    { source: 'Referral & Backlinks', percentage: 12, visits: '34.140' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Statistik & Analisis
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Pantau performa trafik, sumber pengunjung, dan rasio konversi website secara real-time.
        </p>
      </div>

      {/* Analytics KPI */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, idx) => {
          const Icon = m.icon
          return (
            <Card key={idx}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{m.val}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-1">
                    {m.change}
                  </span>
                  dibandingkan minggu lalu
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Traffic Sources */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Sumber Trafik Utama</CardTitle>
                <CardDescription>Distribusi kunjungan berdasarkan kanal perolehan</CardDescription>
              </div>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {channels.map((ch, idx) => (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">{ch.source}</span>
                  <span className="text-muted-foreground">{ch.visits} ({ch.percentage}%)</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500"
                    style={{ width: `${ch.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-dashed flex flex-col justify-center items-center p-8 text-center bg-accent/20">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-3">
            <BarChart3 className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-foreground text-base mb-1">
            Integrasi Google Analytics / PostHog
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4 leading-relaxed">
            Placeholder analitik siap dihubungkan dengan Google Analytics 4, Umami, PostHog, atau analitik internal custom.
          </p>
          <Badge variant="outline">Modul Kosongan Siap Pasang</Badge>
        </Card>
      </div>
    </div>
  )
}
