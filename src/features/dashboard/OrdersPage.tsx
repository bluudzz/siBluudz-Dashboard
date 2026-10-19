import { Download } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function OrdersPage() {
  const orders = [
    { id: 'ORD-9901', customer: 'Ahmad Fauzi', product: 'Paket SaaS Premium', date: '09 Okt 2026', total: 'Rp 499.000', status: 'Selesai' },
    { id: 'ORD-9902', customer: 'CV Solusi Digital', product: 'Lisensi API Enterprise', date: '09 Okt 2026', total: 'Rp 2.499.000', status: 'Selesai' },
    { id: 'ORD-9903', customer: 'Dewi Lestari', product: 'Add-on Cloud Storage', date: '08 Okt 2026', total: 'Rp 150.000', status: 'Menunggu Bayar' },
    { id: 'ORD-9904', customer: 'Hendro Wijaya', product: 'Paket SaaS Premium', date: '08 Okt 2026', total: 'Rp 499.000', status: 'Selesai' },
    { id: 'ORD-9905', customer: 'PT Makmur Jaya', product: 'Lisensi API Enterprise', date: '07 Okt 2026', total: 'Rp 2.499.000', status: 'Dibatalkan' },
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Selesai':
        return <Badge variant="success">Selesai</Badge>
      case 'Menunggu Bayar':
        return <Badge variant="warning">Menunggu</Badge>
      case 'Dibatalkan':
        return <Badge variant="destructive">Batal</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Riwayat Pesanan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daftar seluruh transaksi invoice dan status pembayaran pelanggan.
          </p>
        </div>

        <Button variant="outline" size="sm">
          <Download className="h-3.5 w-3.5" />
          Ekspor CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Semua Pesanan</CardTitle>
          <CardDescription>Transaksi terkini dari gateway pembayaran</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Order ID</th>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">Item / Layanan</th>
                  <th className="px-4 py-3">Tanggal</th>
                  <th className="px-4 py-3">Nominal</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{o.id}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{o.customer}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.product}</td>
                    <td className="px-4 py-3 text-muted-foreground">{o.date}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{o.total}</td>
                    <td className="px-4 py-3">{getStatusBadge(o.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
