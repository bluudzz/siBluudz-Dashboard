import * as React from 'react'
import { Search, Plus, Filter, MoreHorizontal } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'

export function CustomersPage() {
  const [searchTerm, setSearchTerm] = React.useState('')

  const customers = [
    { id: 'CUST-001', name: 'Rian Pratama', email: 'rian@tokobisnis.id', role: 'Enterprise', spend: 'Rp 14.500.000', status: 'Aktif', avatar: 'RP' },
    { id: 'CUST-002', name: 'Siti Sarah', email: 'siti.sarah@creative.co', role: 'Pro', spend: 'Rp 4.200.000', status: 'Aktif', avatar: 'SS' },
    { id: 'CUST-003', name: 'Budi Santoso', email: 'budi.s@digitalmedia.net', role: 'Starter', spend: 'Rp 950.000', status: 'Tidak Aktif', avatar: 'BS' },
    { id: 'CUST-004', name: 'Maya Anggraini', email: 'maya@studiofashion.id', role: 'Pro', spend: 'Rp 6.100.000', status: 'Aktif', avatar: 'MA' },
    { id: 'CUST-005', name: 'Dimas Aditya', email: 'dimas@techhub.co.id', role: 'Enterprise', spend: 'Rp 22.800.000', status: 'Aktif', avatar: 'DA' },
  ]

  const filtered = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Manajemen Pelanggan
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kelola data akun pengguna, status langganan, dan riwayat interaksi.
          </p>
        </div>

        <Button size="sm">
          <Plus className="h-3.5 w-3.5" />
          Tambah Pelanggan
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari nama, email, atau ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm">
                <Filter className="h-3.5 w-3.5" />
                Filter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/50 text-muted-foreground uppercase font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3">Pelanggan</th>
                  <th className="px-4 py-3">ID Akun</th>
                  <th className="px-4 py-3">Paket</th>
                  <th className="px-4 py-3">Total Belanja</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar fallback={c.avatar} className="h-7 w-7 text-xs bg-primary/10 text-primary font-bold" />
                        <div>
                          <p className="font-semibold text-foreground">{c.name}</p>
                          <p className="text-muted-foreground text-[11px]">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{c.id}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{c.role}</Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{c.spend}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.status === 'Aktif' ? 'success' : 'secondary'}>
                        {c.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            Menampilkan {filtered.length} dari {customers.length} data pelanggan. Siap dihubungkan ke database.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
