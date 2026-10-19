import { Plus } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export function ProductsPage() {
  const products = [
    { id: 'PRD-101', name: 'Paket SaaS Premium siBluudz', category: 'Software', price: 'Rp 499.000 / bln', stock: 'Tersedia', sales: '840 terjual' },
    { id: 'PRD-102', name: 'Lisensi API Enterprise', category: 'Layanan API', price: 'Rp 2.499.000 / bln', stock: 'Tersedia', sales: '142 terjual' },
    { id: 'PRD-103', name: 'Add-on Dedicated Cloud Storage', category: 'Infrastruktur', price: 'Rp 150.000 / bln', stock: 'Tersedia', sales: '520 terjual' },
    { id: 'PRD-104', name: 'Custom Domain & SSL Manager', category: 'Fitur', price: 'Rp 99.000 / thn', stock: 'Tersedia', sales: '1.200 terjual' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Katalog Produk & Layanan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daftar paket dan item produk siap dijual atau dikonfigurasi.
          </p>
        </div>

        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Tambah Produk
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((item) => (
          <Card key={item.id} className="relative flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">{item.id}</span>
                <Badge variant="outline" className="text-[10px]">{item.category}</Badge>
              </div>
              <CardTitle className="text-base mt-2">{item.name}</CardTitle>
              <CardDescription className="text-xs">{item.sales}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center justify-between border-t border-border pt-3 mt-2">
                <span className="text-sm font-bold text-foreground">{item.price}</span>
                <Badge variant="success" className="text-[10px]">{item.stock}</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
