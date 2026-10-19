import * as React from 'react'
import { Save, User, Phone, Mail, Sliders, Bot, Users, AtSign, KeyRound, Check, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/ThemeContext'
import { useUser } from '@/context/UserContext'
import { AdminAiSettingsCard } from './components/AdminAiSettingsCard'
import { AdminUsersCard } from './components/AdminUsersCard'

interface SettingsPageProps {
  initialTab?: 'general' | 'ai' | 'users'
}

export function SettingsPage({ initialTab }: SettingsPageProps = {}) {
  const { theme, setTheme } = useTheme()
  const { profile, updateProfile, refreshAccount } = useUser()
  const isAdmin = profile.role === 'admin'

  const [activeSubTab, setActiveSubTab] = React.useState<'general' | 'ai' | 'users'>(() => {
    if (isAdmin && (initialTab === 'ai' || initialTab === 'users')) {
      return initialTab
    }
    return 'general'
  })

  // Sync tab if prop changes
  React.useEffect(() => {
    if (isAdmin && (initialTab === 'ai' || initialTab === 'users')) {
      setActiveSubTab(initialTab)
    }
  }, [initialTab, isAdmin])

  const [appName, setAppName] = React.useState('siBluudz Dashboard')
  const [formData, setFormData] = React.useState({
    name: profile.name,
    username: profile.username || '',
    company: profile.company,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
  })
  const [isSaved, setIsSaved] = React.useState(false)
  const [isSaving, setIsSaving] = React.useState(false)
  const [saveError, setSaveError] = React.useState('')

  // Password setting / changing state
  const [currentPassword, setCurrentPassword] = React.useState('')
  const [newPassword, setNewPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [passwordSaving, setPasswordSaving] = React.useState(false)
  const [passwordError, setPasswordError] = React.useState('')
  const [passwordSuccess, setPasswordSuccess] = React.useState('')

  // Sync when profile updates
  React.useEffect(() => {
    setFormData({
      name: profile.name,
      username: profile.username || '',
      company: profile.company,
      email: profile.email,
      phone: profile.phone,
      address: profile.address,
    })
  }, [profile])

  const handleSave = async () => {
    setIsSaving(true)
    setSaveError('')
    try {
      await updateProfile(formData)
      setIsSaved(true)
      setTimeout(() => setIsSaved(false), 2500)
    } catch (error) {
      console.error('Failed to save profile:', error)
      setSaveError(error instanceof Error ? error.message : 'Profil gagal disimpan ke server.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordError('')
    setPasswordSuccess('')

    if (newPassword.length < 10) {
      setPasswordError('Kata sandi baru minimal 10 karakter.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi kata sandi tidak cocok.')
      return
    }
    if (profile.hasPassword && !currentPassword) {
      setPasswordError('Masukkan kata sandi saat ini.')
      return
    }

    setPasswordSaving(true)
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const isJson = res.headers.get('content-type')?.includes('application/json')
      const data = isJson ? await res.json() : null
      if (!res.ok) {
        throw new Error(data?.error || `Gagal memperbarui kata sandi (${res.status}). Server backend mungkin perlu dimuat ulang.`)
      }
      setPasswordSuccess(data?.message || 'Kata sandi berhasil disimpan!')
      await refreshAccount().catch(() => null)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordSuccess(''), 4000)
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.')
    } finally {
      setPasswordSaving(false)
    }
  }

  return (
    <div className="space-y-6 w-full">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Pengaturan Sistem
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {isAdmin
            ? 'Kelola profil akun, tampilan antarmuka, konfigurasi 9router AI, dan manajemen pengguna.'
            : 'Kelola preferensi umum, nama instansi dashboard, dan tampilan antarmuka.'}
        </p>
      </div>

      {/* Admin Subtabs (Hanya muncul untuk akun Administrator) */}
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-card border border-border rounded-xl w-full sm:w-fit shadow-xs">
          <button
            type="button"
            onClick={() => setActiveSubTab('general')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer select-none',
              activeSubTab === 'general'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Sliders className="h-4 w-4" />
            Profil &amp; Tampilan
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('ai')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer select-none',
              activeSubTab === 'ai'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Bot className={cn('h-4 w-4', activeSubTab === 'ai' ? 'text-primary-foreground' : 'text-blue-500')} />
            Konfigurasi 9router AI
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0 px-1.5 transition-colors',
                activeSubTab === 'ai'
                  ? 'border-white/30 text-white bg-white/10'
                  : 'border-blue-500/30 text-blue-500'
              )}
            >
              Admin
            </Badge>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('users')}
            className={cn(
              'flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer select-none',
              activeSubTab === 'users'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <Users className={cn('h-4 w-4', activeSubTab === 'users' ? 'text-primary-foreground' : 'text-indigo-500')} />
            Kelola Pengguna
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] py-0 px-1.5 transition-colors',
                activeSubTab === 'users'
                  ? 'border-white/30 text-white bg-white/10'
                  : 'border-indigo-500/30 text-indigo-500'
              )}
            >
              Admin
            </Badge>
          </button>
        </div>
      )}

      {/* Tab Konten: AI Configuration (Admin Only) */}
      {isAdmin && activeSubTab === 'ai' && (
        <div className="space-y-6">
          <AdminAiSettingsCard />
        </div>
      )}

      {/* Tab Konten: User Management (Admin Only) */}
      {isAdmin && activeSubTab === 'users' && (
        <div className="space-y-6">
          <AdminUsersCard />
        </div>
      )}

      {/* Tab Konten: General Settings (Muncul untuk semua akun ketika tab General aktif) */}
      {(!isAdmin || activeSubTab === 'general') && (
        <div className="space-y-6">
          {/* Profil Akun Pengguna */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-blue-500" />
                <CardTitle>Profil Pengguna</CardTitle>
              </div>
              <CardDescription>
                Data pemilik akun yang tersinkronisasi otomatis dengan Invoice Builder dan Dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                    Nama Lengkap
                  </label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Johan Habibie"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                    Username
                  </label>
                  <Input
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="admin atau nama pengguna"
                  />
                  <p className="text-[11px] text-muted-foreground">Digunakan untuk login cepat tanpa mengetik email panjang.</p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                    Alamat Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    disabled
                    placeholder="johanhabibie12@gmail.com"
                  />
                  <p className="text-[11px] text-muted-foreground">Email login utama akun.</p>
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                    Nomor Telepon / WhatsApp
                  </label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+6285854321667"
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter className="border-t border-border pt-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {saveError ? (
                  <span className="text-rose-500 font-medium">{saveError}</span>
                ) : isSaved ? (
                  <span className="text-emerald-500 font-medium">✓ Profil berhasil disimpan ke akun Anda.</span>
                ) : (
                  'Simpan perubahan data profil Anda.'
                )}
              </span>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                <Save className="h-3.5 w-3.5" />
                {isSaving ? 'Menyimpan...' : 'Simpan Profil'}
              </Button>
            </CardFooter>
          </Card>

          {/* Keamanan Akun & Kata Sandi */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-500" />
                <CardTitle>Keamanan Akun &amp; Kata Sandi</CardTitle>
              </div>
              <CardDescription>
                {profile.hasPassword
                  ? 'Ubah kata sandi akun Anda untuk keamanan berkala.'
                  : 'Anda login menggunakan Google dan belum memiliki kata sandi mandiri. Buat kata sandi agar bisa login dengan username atau email.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSavePassword} className="space-y-4 max-w-md">
                {profile.hasPassword && (
                  <div className="grid gap-2">
                    <label className="text-xs font-semibold text-foreground">Kata Sandi Saat Ini</label>
                    <Input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Masukkan kata sandi lama"
                      autoComplete="current-password"
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground">
                    {profile.hasPassword ? 'Kata Sandi Baru' : 'Buat Kata Sandi Baru'}
                  </label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimal 10 karakter"
                    autoComplete="new-password"
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-xs font-semibold text-foreground">Konfirmasi Kata Sandi Baru</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Ulangi kata sandi baru"
                    autoComplete="new-password"
                  />
                </div>

                {passwordError && (
                  <div className="flex items-center gap-1.5 text-xs text-rose-500">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                    <Check className="h-4 w-4 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <Button type="submit" size="sm" disabled={passwordSaving} className="cursor-pointer">
                  <KeyRound className="h-3.5 w-3.5" />
                  {passwordSaving
                    ? 'Menyimpan...'
                    : profile.hasPassword
                    ? 'Perbarui Kata Sandi'
                    : 'Simpan Kata Sandi'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profil Dashboard</CardTitle>
              <CardDescription>Informasi umum instansi dashboard</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <label className="text-xs font-semibold text-foreground">Nama Dashboard</label>
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="siBluudz Dashboard"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tema &amp; Tampilan UI</CardTitle>
              <CardDescription>Pilih preferensi tema default sesuai kenyamanan Anda</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'light', label: 'Terang (Light)' },
                  { id: 'dark', label: 'Gelap (Dark)' },
                  { id: 'system', label: 'Sistem (Auto)' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTheme(t.id as any)}
                    className={`p-3 rounded-xl border text-xs font-medium text-center transition-all cursor-pointer ${
                      theme === t.id
                        ? 'border-primary bg-primary/10 text-primary font-bold shadow-xs'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </CardContent>
            <CardFooter className="border-t border-border pt-4 flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Pengaturan tampilan tersimpan otomatis di browser Anda.
              </span>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  )
}
