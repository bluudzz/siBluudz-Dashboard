import * as React from 'react'
import {
  Users,
  Key,
  Trash2,
  Edit2,
  X,
  Search,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useUser } from '@/context/UserContext'

export interface AdminUserRecord {
  id: string
  email: string
  username?: string
  name: string
  company: string
  phone: string
  role: 'admin' | 'user'
  tier: 'free' | 'pro'
  aiDailyLimit: number
  aiDailyLimitCustom: number | null
  aiUsageToday: number
  invoiceCount: number
  createdAt: string
}

export function AdminUsersCard() {
  const { profile } = useUser()

  // State for Users List
  const [users, setUsers] = React.useState<AdminUserRecord[]>([])
  const [usersLoading, setUsersLoading] = React.useState(true)
  const [usersError, setUsersError] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')

  // State for Edit User Modal / Dialog
  const [editingUser, setEditingUser] = React.useState<AdminUserRecord | null>(null)
  const [editUsername, setEditUsername] = React.useState<string>('')
  const [editTier, setEditTier] = React.useState<'free' | 'pro'>('free')
  const [editRole, setEditRole] = React.useState<'admin' | 'user'>('user')
  const [editCustomLimit, setEditCustomLimit] = React.useState<string>('')
  const [savingUser, setSavingUser] = React.useState(false)
  const [saveUserError, setSaveUserError] = React.useState('')

  // State for Reset Password Modal
  const [resettingUser, setResettingUser] = React.useState<AdminUserRecord | null>(null)
  const [newPassword, setNewPassword] = React.useState('')
  const [resettingLoading, setResettingLoading] = React.useState(false)
  const [resetError, setResetError] = React.useState('')
  const [resetSuccess, setResetSuccess] = React.useState('')

  // Fetch Users
  const fetchUsers = React.useCallback(async () => {
    setUsersLoading(true)
    setUsersError('')
    try {
      const res = await fetch('/api/admin/users', { credentials: 'same-origin' })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        throw new Error(data?.error || `Gagal memuat pengguna (${res.status}). Pastikan backend aktif.`)
      }
      setUsers(data.users || [])
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Gagal memuat daftar pengguna')
    } finally {
      setUsersLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Open Edit User
  const handleOpenEdit = (user: AdminUserRecord) => {
    setEditingUser(user)
    setEditUsername(user.username || '')
    setEditTier(user.tier)
    setEditRole(user.role)
    setEditCustomLimit(user.aiDailyLimitCustom != null ? String(user.aiDailyLimitCustom) : '')
    setSaveUserError('')
  }

  // Save Edit User
  const handleSaveUser = async () => {
    if (!editingUser) return
    setSavingUser(true)
    setSaveUserError('')

    const payload: {
      username: string
      role: 'admin' | 'user'
      tier: 'free' | 'pro'
      aiDailyLimit: number | null
    } = {
      username: editUsername.trim(),
      role: editRole,
      tier: editTier,
      aiDailyLimit: editCustomLimit.trim() === '' ? null : Math.max(0, parseInt(editCustomLimit, 10) || 0),
    }

    try {
      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error || `Gagal memperbarui pengguna (${res.status})`)

      setEditingUser(null)
      fetchUsers()
    } catch (err) {
      setSaveUserError(err instanceof Error ? err.message : 'Gagal menyimpan perubahan')
    } finally {
      setSavingUser(false)
    }
  }

  // Handle Delete User
  const handleDeleteUser = async (user: AdminUserRecord) => {
    if (user.id === profile.id) {
      alert('Anda tidak dapat menghapus akun Anda sendiri.')
      return
    }
    const confirmed = window.confirm(`Apakah Anda yakin ingin menghapus akun "${user.email}" beserta semua data invoicenya secara permanen?`)
    if (!confirmed) return

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(data?.error || `Gagal menghapus pengguna (${res.status})`)
      }
      fetchUsers()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Gagal menghapus pengguna')
    }
  }

  // Handle Reset Password
  const handleResetPassword = async () => {
    if (!resettingUser) return
    if (!newPassword || newPassword.length < 8) {
      setResetError('Kata sandi baru minimal 8 karakter.')
      return
    }

    setResettingLoading(true)
    setResetError('')
    setResetSuccess('')

    try {
      const res = await fetch(`/api/admin/users/${resettingUser.id}/reset-password`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) throw new Error(data?.error || `Gagal mereset kata sandi (${res.status})`)

      setResetSuccess(data.message || 'Kata sandi berhasil direset.')
      setNewPassword('')
      setTimeout(() => {
        setResettingUser(null)
        setResetSuccess('')
      }, 2000)
    } catch (err) {
      setResetError(err instanceof Error ? err.message : 'Gagal mereset kata sandi')
    } finally {
      setResettingLoading(false)
    }
  }

  const filteredUsers = users.filter((u) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      u.email.toLowerCase().includes(q) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      u.name.toLowerCase().includes(q) ||
      (u.company && u.company.toLowerCase().includes(q))
    )
  })

  return (
    <>
      <Card className="border-border">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-blue-500" />
                Daftar Akun Pengguna ({users.length})
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Pantau kuota AI hari ini, ubah tier akun, atur batas pemakaian khusus, atau reset password pengguna
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              {/* Search Input */}
              <div className="relative w-full sm:w-60">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama atau email..."
                  className="pl-8 text-xs h-9"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={fetchUsers}
                disabled={usersLoading}
                className="h-9 px-2.5 cursor-pointer"
                title="Segarkan daftar pengguna"
              >
                <RefreshCw className={`h-4 w-4 ${usersLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {usersError ? (
            <div className="p-6 text-center text-sm text-rose-500">{usersError}</div>
          ) : usersLoading ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Memuat data pengguna...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">Tidak ada pengguna yang sesuai.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-y border-border text-muted-foreground font-semibold">
                  <tr>
                    <th className="py-3 px-4">Pengguna</th>
                    <th className="py-3 px-4">Peran</th>
                    <th className="py-3 px-4">Tier Akun</th>
                    <th className="py-3 px-4">Pemakaian AI Hari Ini</th>
                    <th className="py-3 px-4">Batas Harian</th>
                    <th className="py-3 px-4">Dokumen</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredUsers.map((u) => {
                    const isSelf = u.id === profile.id
                    const isUnlimited = u.role === 'admin' || u.aiDailyLimit >= 9999

                    return (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-foreground flex items-center gap-1.5">
                            {u.name || 'Tanpa Nama'}
                            {isSelf && (
                              <span className="text-[10px] text-blue-600 bg-blue-500/10 px-1 rounded font-normal">
                                (Anda)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {u.email}
                            {u.username && (
                              <span className="ml-1.5 text-primary/80 font-mono">@{u.username}</span>
                            )}
                          </div>
                          {u.company && <div className="text-[10px] text-muted-foreground/80">{u.company}</div>}
                        </td>

                        <td className="py-3 px-4">
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'} className="text-[10px]">
                            {u.role === 'admin' ? 'Admin' : 'User'}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          <Badge
                            variant={u.tier === 'pro' ? 'default' : 'outline'}
                            className={`text-[10px] uppercase font-semibold ${
                              u.tier === 'pro' ? 'bg-indigo-600 text-white' : ''
                            }`}
                          >
                            {u.tier}
                          </Badge>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">
                            {u.aiUsageToday} request
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {isUnlimited ? 'Bebas kuota' : `Sisa ${Math.max(0, u.aiDailyLimit - u.aiUsageToday)} request`}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          {isUnlimited ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Unlimited</span>
                          ) : (
                            <span className="font-mono text-foreground font-medium">
                              {u.aiDailyLimit} /hari
                              {u.aiDailyLimitCustom != null && (
                                <span className="ml-1 text-[10px] text-blue-500 font-sans font-normal">(Kustom)</span>
                              )}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-muted-foreground">
                          {u.invoiceCount} invoice
                        </td>

                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(u)}
                              title="Edit Tier & Kuota"
                              className="h-7 w-7 p-0 cursor-pointer"
                            >
                              <Edit2 className="h-3.5 w-3.5 text-blue-500" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setResettingUser(u)
                                setNewPassword('')
                                setResetError('')
                                setResetSuccess('')
                              }}
                              title="Reset Kata Sandi"
                              className="h-7 w-7 p-0 cursor-pointer"
                            >
                              <Key className="h-3.5 w-3.5 text-amber-500" />
                            </Button>

                            {!isSelf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteUser(u)}
                                title="Hapus Pengguna"
                                className="h-7 w-7 p-0 cursor-pointer hover:bg-rose-500/10 text-rose-500"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit User Modal Dialog */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Edit Pengguna &amp; Kuota AI</h3>
                <p className="text-xs text-muted-foreground">{editingUser.email}</p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              {/* Username */}
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Username (Login Cepat)</label>
                <Input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="Contoh: johan / admin123"
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  3-30 karakter, unik, tanpa spasi. Kosongkan jika tidak ingin mengatur username.
                </p>
              </div>

              {/* Role */}
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Peran Akun</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as 'admin' | 'user')}
                  className="w-full rounded-lg border border-border bg-background p-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">User Standar</option>
                  <option value="admin">Administrator (Akses Penuh)</option>
                </select>
              </div>

              {/* Tier */}
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Tier Layanan</label>
                <select
                  value={editTier}
                  onChange={(e) => setEditTier(e.target.value as 'free' | 'pro')}
                  className="w-full rounded-lg border border-border bg-background p-2 text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="free">Free Tier (Dibatasi kuota harian)</option>
                  <option value="pro">Pro Tier (Prioritas &amp; batas lebih besar)</option>
                </select>
              </div>

              {/* Custom AI Limit */}
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">
                  Kustom Kuota AI Harian (Kosongkan untuk limit default tier)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={editCustomLimit}
                  onChange={(e) => setEditCustomLimit(e.target.value)}
                  placeholder={`Default: ${editTier === 'pro' ? 100 : 5}`}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Masukkan angka spesifik untuk memberikan kuota khusus pada akun ini.
                </p>
              </div>

              {saveUserError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-rose-600 dark:text-rose-400">
                  {saveUserError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingUser(null)}
                disabled={savingUser}
              >
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleSaveUser}
                disabled={savingUser}
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {savingUser ? 'Menyimpan...' : 'Simpan Perubahan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal Dialog */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-foreground">Reset Kata Sandi</h3>
                <p className="text-xs text-muted-foreground">{resettingUser.email}</p>
              </div>
              <button
                onClick={() => setResettingUser(null)}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-muted-foreground">Kata Sandi Baru (Min. 8 karakter)</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Masukkan kata sandi baru..."
                  className="text-xs"
                />
              </div>

              {resetError && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-2 text-rose-600 dark:text-rose-400">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-emerald-600 dark:text-emerald-400">
                  {resetSuccess}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResettingUser(null)}
                disabled={resettingLoading}
              >
                Batal
              </Button>
              <Button
                size="sm"
                onClick={handleResetPassword}
                disabled={resettingLoading || !newPassword}
                className="bg-amber-600 hover:bg-amber-700 text-white font-medium"
              >
                {resettingLoading ? 'Mereset...' : 'Perbarui Sandi'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
