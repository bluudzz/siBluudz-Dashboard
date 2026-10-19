import { Check, Info, AlertTriangle, ShieldCheck } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export function NotificationsPage() {
  const notifs = [
    { title: 'Inisialisasi Project Berhasil', desc: 'Template siBluudz Dashboard telah disetup lengkap dengan mode gelap dan responsif.', time: '10 menit yang lalu', type: 'info', icon: Info },
    { title: 'Pembayaran Diterima #ORD-9901', desc: 'Pembayaran sebesar Rp 499.000 dari Ahmad Fauzi telah berhasil diverifikasi.', time: '1 jam yang lalu', type: 'success', icon: Check },
    { title: 'Peringatan Pemakaian Kuota API', desc: 'Penggunaan API gateway mencapai 78% dari kuota bulanan saat ini.', time: '3 jam yang lalu', type: 'warning', icon: AlertTriangle },
    { title: 'Pembaruan Patch Keamanan', desc: 'Semua dependensi project telah diaudit dan bebas kerentanan keamanan.', time: '1 hari yang lalu', type: 'security', icon: ShieldCheck },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Pusat Notifikasi
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Log aktivitas sistem, peringatan keamanan, dan pemberitahuan transaksi.
          </p>
        </div>

        <Button variant="outline" size="sm">
          Tandai Semua Dibaca
        </Button>
      </div>

      <div className="space-y-3">
        {notifs.map((n, idx) => {
          const Icon = n.icon
          return (
            <Card key={idx} className="hover:border-primary/30 transition-colors">
              <CardContent className="p-4 flex items-start gap-3.5">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{n.title}</p>
                    <span className="text-[11px] text-muted-foreground">{n.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{n.desc}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
