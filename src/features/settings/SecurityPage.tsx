import { ShieldCheck, Key } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'

export function SecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Keamanan & Kunci API
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Kelola kunci autentikasi token, 2FA, dan sesi akses administrator.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* API Keys */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-blue-500" />
              <CardTitle>Kunci Akses API (Secret)</CardTitle>
            </div>
            <CardDescription>
              Gunakan token ini untuk menghubungkan backend atau cron jobs ke siBluudz Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Live Public Key</label>
              <div className="flex items-center gap-2">
                <Input readOnly value="sb_live_pub_98a72f0b12c8e33a" className="font-mono text-xs bg-muted/50" />
                <Button variant="outline" size="sm">Salin</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Live Secret Key</label>
              <div className="flex items-center gap-2">
                <Input readOnly type="password" value="sb_live_sec_****************" className="font-mono text-xs bg-muted/50" />
                <Button variant="outline" size="sm">Buka</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2FA & Session */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              <CardTitle>Autentikasi Dua Faktor (2FA)</CardTitle>
            </div>
            <CardDescription>
              Tingkatkan keamanan akun admin dengan perlindungan kode OTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div>
                <p className="text-xs font-semibold text-foreground">Status 2FA</p>
                <p className="text-[11px] text-muted-foreground">Autentikasi Google / Microsoft Authenticator</p>
              </div>
              <Badge variant="success">Aktif</Badge>
            </div>

            <Button variant="outline" size="sm" className="w-full">
              Konfigurasi Ulang 2FA
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
