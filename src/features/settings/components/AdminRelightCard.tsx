import * as React from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Edit2,
  ExternalLink,
  Image as ImageIcon,
  Key,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { curateImageModels } from '../../../../shared/model-catalog.js'
import { resolvePresetSamples } from '@/features/relight-app/relight-sample-art'

interface RelightAdminUser {
  id: string
  username: string
  email: string
  name: string
  isActive: boolean
  dailyLimit: number
  usageToday: number
  usageTotal: number
  remaining: number
  note: string
  lastLoginAt: string
  createdAt: string
}

interface RelightSampleItem {
  id: string
  label: string
  description: string
  hasCustomBefore: boolean
  hasCustomAfter: boolean
  beforeUrl: string
  afterUrl: string
  updatedAt: string
}

interface RelightOverviewConfig {
  defaultDailyLimit: number
  imageModel: string
  globalImageModel: string
  availableImageModels: string[]
  hasApiKey: boolean
  baseUrl: string
  relightUrl: string
}

interface Props {
  onOpenAiConfig?: () => void
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Gagal membaca file gambar.'))
    }
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'))
    reader.readAsDataURL(file)
  })
}

export function AdminRelightCard({ onOpenAiConfig }: Props) {
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [users, setUsers] = React.useState<RelightAdminUser[]>([])
  const [samples, setSamples] = React.useState<RelightSampleItem[]>([])
  const [config, setConfig] = React.useState<RelightOverviewConfig | null>(null)

  // Settings form
  const [defaultLimitDraft, setDefaultLimitDraft] = React.useState('10')
  const [imageModelDraft, setImageModelDraft] = React.useState('')
  const [configSaving, setConfigSaving] = React.useState(false)
  const [configMessage, setConfigMessage] = React.useState('')

  // Search & user modals
  const [searchQuery, setSearchQuery] = React.useState('')
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createForm, setCreateForm] = React.useState({
    name: '',
    username: '',
    email: '',
    password: '',
    dailyLimit: '10',
    note: '',
  })
  const [createBusy, setCreateBusy] = React.useState(false)
  const [createError, setCreateError] = React.useState('')

  const [editingUser, setEditingUser] = React.useState<RelightAdminUser | null>(null)
  const [editForm, setEditForm] = React.useState({
    name: '',
    username: '',
    email: '',
    dailyLimit: '10',
    note: '',
  })
  const [editBusy, setEditBusy] = React.useState(false)
  const [editError, setEditError] = React.useState('')

  const [resetUser, setResetUser] = React.useState<RelightAdminUser | null>(null)
  const [resetPassword, setResetPassword] = React.useState('')
  const [resetBusy, setResetBusy] = React.useState(false)
  const [resetFeedback, setResetFeedback] = React.useState('')

  // Sample upload state
  const [sampleBusyKey, setSampleBusyKey] = React.useState<string | null>(null)
  const [sampleMessage, setSampleMessage] = React.useState('')

  const fetchOverview = React.useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/relight/overview', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        throw new Error(data?.error || `Gagal memuat data Relight Studio (${res.status}).`)
      }
      setUsers(Array.isArray(data.users) ? data.users : [])
      setSamples(Array.isArray(data.samples) ? data.samples : [])
      if (data.config) {
        setConfig(data.config)
        setDefaultLimitDraft(String(data.config.defaultDailyLimit ?? 10))
        setImageModelDraft(data.config.imageModel || '')
        setCreateForm((prev) => ({ ...prev, dailyLimit: String(data.config.defaultDailyLimit ?? 10) }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan Relight Studio.')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    fetch('/api/admin/relight/overview', { credentials: 'same-origin' })
      .then((res) => res.json().then((data) => ({ ok: res.ok, status: res.status, data })))
      .then(({ ok, status, data }) => {
        if (!active) return
        if (!ok || !data) {
          throw new Error(data?.error || `Gagal memuat data Relight Studio (${status}).`)
        }
        setUsers(Array.isArray(data.users) ? data.users : [])
        setSamples(Array.isArray(data.samples) ? data.samples : [])
        if (data.config) {
          setConfig(data.config)
          setDefaultLimitDraft(String(data.config.defaultDailyLimit ?? 10))
          setImageModelDraft(data.config.imageModel || '')
          setCreateForm((prev) => ({ ...prev, dailyLimit: String(data.config.defaultDailyLimit ?? 10) }))
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Gagal memuat pengaturan Relight Studio.')
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setConfigSaving(true)
    setConfigMessage('')
    try {
      const res = await fetch('/api/admin/relight/config', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultDailyLimit: Math.max(0, Number.parseInt(defaultLimitDraft, 10) || 0),
          imageModel: imageModelDraft,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal menyimpan pengaturan Relight Studio.')
      setConfigMessage('Pengaturan kuota default dan model Relight berhasil disimpan.')
      await fetchOverview()
    } catch (err) {
      setConfigMessage(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.')
    } finally {
      setConfigSaving(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateBusy(true)
    setCreateError('')
    try {
      const res = await fetch('/api/admin/relight/users', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          username: createForm.username.trim(),
          email: createForm.email.trim(),
          password: createForm.password,
          dailyLimit: Math.max(0, Number.parseInt(createForm.dailyLimit, 10) || 0),
          note: createForm.note.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal membuat user Relight.')
      setCreateOpen(false)
      setCreateForm({
        name: '',
        username: '',
        email: '',
        password: '',
        dailyLimit: String(config?.defaultDailyLimit ?? 10),
        note: '',
      })
      await fetchOverview()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Gagal membuat user.')
    } finally {
      setCreateBusy(false)
    }
  }

  const handleToggleActive = async (target: RelightAdminUser) => {
    try {
      const res = await fetch(`/api/admin/relight/users/${target.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !target.isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal mengubah status user.')
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status user.')
    }
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setEditBusy(true)
    setEditError('')
    try {
      const res = await fetch(`/api/admin/relight/users/${editingUser.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          username: editForm.username.trim(),
          email: editForm.email.trim(),
          dailyLimit: Math.max(0, Number.parseInt(editForm.dailyLimit, 10) || 0),
          note: editForm.note.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal memperbarui user Relight.')
      setEditingUser(null)
      await fetchOverview()
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan.')
    } finally {
      setEditBusy(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!resetUser) return
    setResetBusy(true)
    setResetFeedback('')
    try {
      const res = await fetch(`/api/admin/relight/users/${resetUser.id}/reset-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: resetPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal mereset kata sandi.')
      setResetFeedback(data?.message || 'Kata sandi diperbarui.')
      setResetPassword('')
      window.setTimeout(() => {
        setResetUser(null)
        setResetFeedback('')
      }, 1100)
    } catch (err) {
      setResetFeedback(err instanceof Error ? err.message : 'Gagal mereset kata sandi.')
    } finally {
      setResetBusy(false)
    }
  }

  const handleDeleteUser = async (target: RelightAdminUser) => {
    if (!window.confirm(`Hapus permanen user Relight "@${target.username}" beserta riwayat pemakaiannya?`)) return
    try {
      const res = await fetch(`/api/admin/relight/users/${target.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Gagal menghapus user Relight.')
      }
      await fetchOverview()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus user.')
    }
  }

  const handleUploadSample = async (presetId: string, side: 'before' | 'after', file: File | undefined) => {
    if (!file) return
    if (file.size > 8 * 1024 * 1024) {
      setSampleMessage('Ukuran foto contoh maksimal 8 MB.')
      return
    }
    const busyKey = `${presetId}:${side}`
    setSampleBusyKey(busyKey)
    setSampleMessage('')
    try {
      const dataUrl = await readFileAsDataUrl(file)
      const res = await fetch(`/api/admin/relight/samples/${presetId}`, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(side === 'before' ? { beforeImage: dataUrl } : { afterImage: dataUrl }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Gagal mengunggah foto contoh.')
      setSampleMessage(`Foto ${side.toUpperCase()} untuk ${data.sample?.label || presetId} diperbarui.`)
      await fetchOverview()
    } catch (err) {
      setSampleMessage(err instanceof Error ? err.message : 'Gagal mengunggah foto contoh.')
    } finally {
      setSampleBusyKey(null)
    }
  }

  const handleResetSample = async (presetId: string) => {
    setSampleBusyKey(`${presetId}:reset`)
    setSampleMessage('')
    try {
      const res = await fetch(`/api/admin/relight/samples/${presetId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!res.ok) throw new Error('Gagal mereset foto contoh.')
      setSampleMessage('Foto contoh dikembalikan ke ilustrasi bawaan.')
      await fetchOverview()
    } catch (err) {
      setSampleMessage(err instanceof Error ? err.message : 'Gagal mereset foto contoh.')
    } finally {
      setSampleBusyKey(null)
    }
  }

  const filteredUsers = users.filter((u) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      u.username.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.note.toLowerCase().includes(q)
    )
  })

  const activeUsersCount = users.filter((u) => u.isActive).length
  const totalUsageToday = users.reduce((sum, u) => sum + (u.usageToday || 0), 0)
  const curated = curateImageModels(config?.availableImageModels || [])
  const dropdownModels = curated.latest.length > 0 ? curated.latest : curated.all

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Ringkasan & Konfigurasi Relight Standalone */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Sun className="h-5 w-5 text-amber-500" />
              <CardTitle>Sub-Website Relight Studio</CardTitle>
              <Badge variant="outline" className="border-amber-500/30 text-amber-600 dark:text-amber-400">
                Terpisah dari Dashboard
              </Badge>
            </div>
            <CardDescription className="mt-1">
              Kelola pengguna khusus, kuota harian, model gambar 9router, dan foto contoh Before / After untuk{' '}
              <strong>relight.sibluudz.my.id</strong>.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button type="button" variant="outline" size="sm" onClick={() => void fetchOverview()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {config?.relightUrl && (
              <a
                href={config.relightUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Buka relight.sibluudz.my.id
              </a>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <div className="text-xs text-muted-foreground">User Aktif Relight</div>
              <div className="mt-1 text-2xl font-bold">
                {activeUsersCount} <span className="text-xs font-normal text-muted-foreground">/ {users.length} total</span>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3.5">
              <div className="text-xs text-muted-foreground">Generate Hari Ini</div>
              <div className="mt-1 text-2xl font-bold">{totalUsageToday} foto</div>
            </div>
            <div className="rounded-xl border border-border bg-muted/30 p-3.5 flex items-center justify-between gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Koneksi 9router</div>
                <div className="mt-1 flex items-center gap-1.5 text-sm font-semibold">
                  {config?.hasApiKey ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span>Terhubung</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span>API Key Kosong</span>
                    </>
                  )}
                </div>
              </div>
              {onOpenAiConfig && (
                <Button type="button" size="sm" variant="outline" onClick={onOpenAiConfig}>
                  Atur 9router
                </Button>
              )}
            </div>
          </div>

          <form onSubmit={(e) => void handleSaveConfig(e)} className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3 sm:items-end">
            <div className="grid gap-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                Model Gambar Khusus relight.sibluudz.my.id
              </label>
              <select
                value={imageModelDraft}
                onChange={(e) => setImageModelDraft(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs"
              >
                <option value="">
                  Ikuti default 9router ({config?.globalImageModel || 'ag/gemini-3.1-flash-image'})
                </option>
                {dropdownModels.map((modelId) => (
                  <option key={modelId} value={modelId}>
                    {modelId}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-foreground">Kuota Default / Hari</label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={defaultLimitDraft}
                  onChange={(e) => setDefaultLimitDraft(e.target.value)}
                />
                <Button type="submit" disabled={configSaving}>
                  <Save className="h-4 w-4 mr-1.5" />
                  {configSaving ? 'Menyimpan...' : 'Simpan'}
                </Button>
              </div>
            </div>

            {configMessage && (
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 sm:col-span-3">{configMessage}</p>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Kelola User Khusus Relight Studio */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-500" />
              <CardTitle>Akun Pengguna relight.sibluudz.my.id</CardTitle>
            </div>
            <CardDescription className="mt-0.5">
              Akun ini terpisah dari dashboard utama siBluudz dan hanya dapat masuk di subdomain Relight Studio.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari user..."
                className="pl-8 h-9 w-44 sm:w-56"
              />
            </div>
            <Button type="button" size="sm" onClick={() => { setCreateError(''); setCreateOpen(true) }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Tambah User Relight
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {loading && users.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Memuat daftar akun Relight...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {users.length === 0
                ? 'Belum ada akun Relight Studio. Klik "Tambah User Relight" untuk membuat akses pertama.'
                : 'Tidak ada akun yang cocok dengan pencarian.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 rounded-xl border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{u.name || u.username}</span>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">@{u.username}</code>
                      <Badge variant={u.isActive ? 'default' : 'secondary'}>
                        {u.isActive ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                      <Badge variant="outline">
                        Hari ini: {u.usageToday}/{u.dailyLimit >= 9999 ? '∞' : u.dailyLimit}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Total: {u.usageTotal}</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                      {u.email && <span>{u.email}</span>}
                      {u.note && <span>Catatan: {u.note}</span>}
                      <span>Login terakhir: {u.lastLoginAt || 'Belum pernah'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant={u.isActive ? 'outline' : 'default'}
                      onClick={() => void handleToggleActive(u)}
                      title={u.isActive ? 'Nonaktifkan akses login' : 'Aktifkan akses login'}
                    >
                      <Power className="h-3.5 w-3.5 mr-1" />
                      {u.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingUser(u)
                        setEditForm({
                          name: u.name,
                          username: u.username,
                          email: u.email,
                          dailyLimit: String(u.dailyLimit),
                          note: u.note,
                        })
                        setEditError('')
                      }}
                    >
                      <Edit2 className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setResetUser(u)
                        setResetPassword('')
                        setResetFeedback('')
                      }}
                    >
                      <Key className="h-3.5 w-3.5 mr-1" />
                      Reset Sandi
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-rose-500 hover:text-rose-600"
                      onClick={() => void handleDeleteUser(u)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Kelola Foto Contoh Before / After tiap Fitur */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-500" />
            <CardTitle>Foto Contoh Before / After (7 Fitur Relight)</CardTitle>
          </div>
          <CardDescription>
            Setiap kartu fitur di menu pemilihan <strong>relight.sibluudz.my.id</strong> menampilkan 1 perbandingan slider Before / After. Anda bisa mengganti foto contohnya dengan foto asli di sini.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {sampleMessage && (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{sampleMessage}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {samples.map((preset) => {
              const resolved = resolvePresetSamples(preset)
              return (
                <div key={preset.id} className="rounded-xl border border-border p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm">{preset.label}</div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{preset.description}</p>
                    </div>
                    {(preset.hasCustomBefore || preset.hasCustomAfter) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={sampleBusyKey === `${preset.id}:reset`}
                        onClick={() => void handleResetSample(preset.id)}
                        title="Kembalikan contoh default"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <div className="aspect-[4/5] rounded-lg overflow-hidden border border-border bg-black/80 relative">
                        <img src={resolved.beforeUrl} alt={`${preset.label} Before`} className="w-full h-full object-cover" />
                        <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          Before
                        </span>
                      </div>
                      <label className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium cursor-pointer hover:bg-muted">
                        <Upload className="h-3 w-3" />
                        <span>{sampleBusyKey === `${preset.id}:before` ? 'Mengunggah...' : 'Ganti Before'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          disabled={Boolean(sampleBusyKey)}
                          onChange={(e) => {
                            void handleUploadSample(preset.id, 'before', e.target.files?.[0])
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                    </div>

                    <div className="space-y-1.5">
                      <div className="aspect-[4/5] rounded-lg overflow-hidden border border-border bg-black/80 relative">
                        <img src={resolved.afterUrl} alt={`${preset.label} After`} className="w-full h-full object-cover" />
                        <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          After
                        </span>
                      </div>
                      <label className="flex items-center justify-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium cursor-pointer hover:bg-muted">
                        <Upload className="h-3 w-3" />
                        <span>{sampleBusyKey === `${preset.id}:after` ? 'Mengunggah...' : 'Ganti After'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          hidden
                          disabled={Boolean(sampleBusyKey)}
                          onChange={(e) => {
                            void handleUploadSample(preset.id, 'after', e.target.files?.[0])
                            e.currentTarget.value = ''
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Modal Tambah User */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Tambah User Relight Studio</h3>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleCreateUser(e)} className="space-y-3">
              {createError && <p className="text-xs text-rose-500 font-medium">{createError}</p>}
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Nama Tampilan</label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Contoh: Studio Klien 01"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Username Login *</label>
                <Input
                  required
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  placeholder="klien01 (huruf, angka, ._-)"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Email (Opsional)</label>
                <Input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  placeholder="klien01@email.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <label className="text-xs font-semibold">Kata Sandi *</label>
                  <Input
                    required
                    type="password"
                    minLength={6}
                    value={createForm.password}
                    onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                    placeholder="Min. 6 karakter"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs font-semibold">Kuota / Hari</label>
                  <Input
                    type="number"
                    min={0}
                    max={100000}
                    value={createForm.dailyLimit}
                    onChange={(e) => setCreateForm({ ...createForm, dailyLimit: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Catatan (Opsional)</label>
                <Input
                  value={createForm.note}
                  onChange={(e) => setCreateForm({ ...createForm, note: e.target.value })}
                  placeholder="Paket atau keterangan akses"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Batal</Button>
                <Button type="submit" disabled={createBusy}>{createBusy ? 'Menyimpan...' : 'Buat Akun'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Edit User @{editingUser.username}</h3>
              <button type="button" onClick={() => setEditingUser(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleSaveEdit(e)} className="space-y-3">
              {editError && <p className="text-xs text-rose-500 font-medium">{editError}</p>}
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Nama Tampilan</label>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Username Login</label>
                <Input required value={editForm.username} onChange={(e) => setEditForm({ ...editForm, username: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Email (Opsional)</label>
                <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Kuota Harian (isi 9999 untuk Unlimited)</label>
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={editForm.dailyLimit}
                  onChange={(e) => setEditForm({ ...editForm, dailyLimit: e.target.value })}
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Catatan</label>
                <Input value={editForm.note} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingUser(null)}>Batal</Button>
                <Button type="submit" disabled={editBusy}>{editBusy ? 'Menyimpan...' : 'Simpan'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Reset Sandi */}
      {resetUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Reset Sandi @{resetUser.username}</h3>
              <button type="button" onClick={() => setResetUser(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-3">
              <div className="grid gap-1">
                <label className="text-xs font-semibold">Kata Sandi Baru (min. 6 karakter)</label>
                <Input
                  required
                  type="password"
                  minLength={6}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Masukkan sandi baru"
                />
              </div>
              {resetFeedback && <p className="text-xs font-medium text-emerald-500">{resetFeedback}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setResetUser(null)}>Batal</Button>
                <Button type="submit" disabled={resetBusy}>{resetBusy ? 'Menyimpan...' : 'Perbarui Sandi'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
