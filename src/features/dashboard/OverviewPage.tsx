import * as React from 'react'
import {
  DollarSign,
  Users,
  CreditCard,
  Activity,
  ArrowUpRight,
  Download,
  Plus,
  TrendingUp,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'

export function OverviewPage() {
  const [selectedRange, setSelectedRange] = React.useState('30 Hari')

  // Sample monthly data for visual chart
  const monthlyData = [
    { month: 'Jan', val: 35 },
    { month: 'Feb', val: 58 },
    { month: 'Mar', val: 42 },
    { month: 'Apr', val: 75 },
    { month: 'Mei', val: 62 },
    { month: 'Jun', val: 89 },
    { month: 'Jul', val: 70 },
    { month: 'Agu', val: 95 },
    { month: 'Sep', val: 82 },
    { month: 'Okt', val: 110 },
    { month: 'Nov', val: 92 },
    { month: 'Des', val: 124 },
  ]

  const maxVal = Math.max(...monthlyData.map((d) => d.val))

  const recentTransactions = [
    { name: 'Olivia Martin', email: 'olivia.martin@email.com', amount: '+Rp 1.999.000', status: 'Selesai', avatar: 'OM' },
    { name: 'Jackson Lee', email: 'jackson.lee@email.com', amount: '+Rp 390.000', status: 'Selesai', avatar: 'JL' },
    { name: 'Isabella Nguyen', email: 'isabella.nguyen@email.com', amount: '+Rp 2.490.000', status: 'Tertunda', avatar: 'IN' },
    { name: 'William Kim', email: 'will@email.com', amount: '+Rp 990.000', status: 'Selesai', avatar: 'WK' },
    { name: 'Sofia Davis', email: 'sofia.davis@email.com', amount: '+Rp 3.500.000', status: 'Selesai', avatar: 'SD' },
  ]

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
            siBluudz Dashboard
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              <Sparkles className="h-3 w-3" /> Live Starter
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Selamat datang di template dashboard modern Anda. Struktur kosongan siap diisi data & logika backend.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Filter */}
          <div className="inline-flex rounded-lg border border-border bg-card p-1 shadow-2xs">
            {['7 Hari', '30 Hari', 'Tahun Ini'].map((range) => (
              <button
                key={range}
                onClick={() => setSelectedRange(range)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  selectedRange === range
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <Button variant="outline" size="sm" className="hidden sm:inline-flex">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Entri Baru
          </Button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Revenue */}
        <Card className="relative overflow-hidden border-border/80 hover:border-primary/40 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Pendapatan
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <DollarSign className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">Rp 45.231.890</div>
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400 mr-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> +20.1%
              </span>
              <span>dari bulan sebelumnya</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Subscriptions */}
        <Card className="relative overflow-hidden border-border/80 hover:border-primary/40 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Pengguna Aktif
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">+2.350</div>
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400 mr-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> +180.1%
              </span>
              <span>pertumbuhan kuartal</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Sales */}
        <Card className="relative overflow-hidden border-border/80 hover:border-primary/40 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Total Penjualan
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <CreditCard className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">+12.234</div>
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400 mr-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> +19%
              </span>
              <span>konversi checkout</span>
            </div>
          </CardContent>
        </Card>

        {/* Card 4: Active Rate */}
        <Card className="relative overflow-hidden border-border/80 hover:border-primary/40 transition-all duration-200">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sesi Sedang Aktif
            </CardTitle>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
              <Activity className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">+573</div>
            <div className="mt-1 flex items-center text-xs text-muted-foreground">
              <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400 mr-1.5">
                <ArrowUpRight className="h-3.5 w-3.5 mr-0.5" /> +201
              </span>
              <span>1 jam terakhir</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Charts & Activity Section */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        {/* Performance Chart (4 cols) */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ringkasan Performa Tahunan</CardTitle>
                <CardDescription>Grafik tren pendapatan & transaksi per bulan</CardDescription>
              </div>
              <Badge variant="outline" className="gap-1 font-mono text-[11px]">
                <TrendingUp className="h-3 w-3 text-emerald-500" />
                +24.5% YoY
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* Visual SVG & CSS Bar Chart */}
            <div className="mt-4 flex h-64 items-end justify-between gap-2 pt-6">
              {monthlyData.map((item, idx) => {
                const heightPercent = Math.round((item.val / maxVal) * 100)
                const isHighest = item.val === maxVal
                return (
                  <div key={idx} className="group relative flex flex-1 flex-col items-center gap-2 h-full justify-end">
                    {/* Hover Tooltip */}
                    <div className="absolute -top-7 hidden rounded-md border border-border bg-popover px-2 py-0.5 text-[10px] font-semibold text-popover-foreground shadow-sm group-hover:block z-10 whitespace-nowrap">
                      {item.val}k Transaksi
                    </div>

                    {/* Bar */}
                    <div className="w-full max-w-[28px] rounded-t-md bg-muted transition-all duration-300 group-hover:bg-primary/80 overflow-hidden flex flex-col justify-end" style={{ height: `${heightPercent}%` }}>
                      <div
                        className={`w-full h-full rounded-t-md transition-colors ${
                          isHighest
                            ? 'bg-gradient-to-t from-blue-600 to-indigo-500'
                            : 'bg-primary/60 group-hover:bg-primary'
                        }`}
                      />
                    </div>

                    {/* X-axis label */}
                    <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground">
                      {item.month}
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity / Transactions (3 cols) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Aktivitas & Transaksi Terkini</CardTitle>
            <CardDescription>5 transaksi terbaru di siBluudz Dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentTransactions.map((tx, idx) => (
                <div key={idx} className="flex items-center justify-between space-x-4">
                  <div className="flex items-center space-x-3 truncate">
                    <Avatar fallback={tx.avatar} className="bg-primary/10 text-primary font-bold" />
                    <div className="space-y-0.5 truncate">
                      <p className="text-sm font-semibold leading-none text-foreground truncate">{tx.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{tx.email}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground">{tx.amount}</p>
                    <span
                      className={`inline-flex items-center text-[10px] font-medium ${
                        tx.status === 'Selesai'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}
                    >
                      {tx.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Developer Placeholder / Starter Guide */}
      <Card className="border-dashed border-2 border-border/80 bg-accent/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-500" />
            <CardTitle className="text-base">Area Kosongan Siap Deploy & Dikembangkan</CardTitle>
          </div>
          <CardDescription>
            File ini berada di <code className="text-xs text-primary font-mono bg-muted px-1.5 py-0.5 rounded">src/pages/OverviewPage.tsx</code>. Anda dapat mengganti data statis ini dengan query database (Supabase, Firebase, REST API, GraphQL, atau Prisma).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 text-xs text-muted-foreground">
            <div className="rounded-lg border border-border bg-card p-3">
              <span className="font-semibold text-foreground block mb-1">1. Tambah Endpoint API</span>
              Hubungkan fetching data melalui React Query, SWR, atau native fetch.
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <span className="font-semibold text-foreground block mb-1">2. Modifikasi Komponen</span>
              Gunakan komponen di <code className="font-mono text-primary">src/components/ui</code> untuk merakit UI sesuai selera.
            </div>
            <div className="rounded-lg border border-border bg-card p-3">
              <span className="font-semibold text-foreground block mb-1">3. Siap Deploy</span>
              Tinggal jalankan <code className="font-mono text-primary">npm run build</code> dan deploy ke Vercel, Netlify, atau VPS Anda.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
