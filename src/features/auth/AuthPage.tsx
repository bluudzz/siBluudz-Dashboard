import * as React from 'react'
import { LockKeyhole, Mail, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { useUser } from '@/context/UserContext'

export function AuthPage({ startupError = '' }: { startupError?: string }) {
  const { refreshAccount } = useUser()
  const [isSignUp, setIsSignUp] = React.useState(false)
  const [name, setName] = React.useState('')
  const [identifier, setIdentifier] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState('')
  const [isBusy, setIsBusy] = React.useState(false)
  const [googleEnabled, setGoogleEnabled] = React.useState(false)
  const [googleConfigLoading, setGoogleConfigLoading] = React.useState(true)

  React.useEffect(() => {
    fetch('/api/config')
      .then((response) => {
        if (!response.ok) throw new Error('Tidak dapat memuat konfigurasi backend.')
        return response.json() as Promise<{ googleEnabled: boolean }>
      })
      .then((config) => setGoogleEnabled(config.googleEnabled))
      .catch((cause: unknown) => {
        console.error('Failed to load authentication options:', cause)
      })
      .finally(() => setGoogleConfigLoading(false))
  }, [])

  React.useEffect(() => {
    const authError = new URLSearchParams(window.location.search).get('authError')
    if (authError === 'google') setError('Login Google gagal. Pastikan OAuth Google sudah dikonfigurasi, lalu coba lagi.')
  }, [])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setIsBusy(true)
    try {
      const payload = isSignUp
        ? { name, email: identifier, password }
        : { identifier, password }
      const response = await fetch(isSignUp ? '/api/auth/register' : '/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Autentikasi gagal. Silakan coba lagi.')
      await refreshAccount()
      window.history.replaceState({}, '', window.location.pathname)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Autentikasi gagal. Silakan coba lagi.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-md border-border/70 shadow-xl">
        <CardHeader className="space-y-2 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">siBluudz Dashboard</CardTitle>
          <CardDescription>
            {isSignUp ? 'Buat akun untuk menyimpan profil dan invoice Anda.' : 'Masuk untuk membuka data akun Anda.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {startupError && <p role="alert" className="text-sm text-destructive">{startupError}</p>}
          <form className="space-y-3" onSubmit={submit}>
            {isSignUp && (
              <label className="block space-y-1.5 text-sm">
                <span>Nama lengkap</span>
                <Input
                  autoComplete="name"
                  required
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nama Anda"
                />
              </label>
            )}
            {isSignUp ? (
              <label className="block space-y-1.5 text-sm">
                <span>Alamat Email</span>
                <Input
                  type="email"
                  autoComplete="email"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="nama@email.com"
                />
              </label>
            ) : (
              <label className="block space-y-1.5 text-sm">
                <span>Email atau Username</span>
                <Input
                  type="text"
                  autoComplete="username"
                  required
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="nama@email.com atau username"
                />
              </label>
            )}
            <label className="block space-y-1.5 text-sm">
              <span>Kata sandi</span>
              <Input
                type="password"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={10}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimal 10 karakter"
              />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button className="w-full" type="submit" disabled={isBusy}>
              <Mail className="h-4 w-4" />
              {isBusy ? 'Memproses...' : isSignUp ? 'Buat Akun' : 'Masuk'}
            </Button>
          </form>
          <div className="relative py-1 text-center text-xs text-muted-foreground">
            <span className="bg-card px-2">atau</span>
          </div>
          <Button
            className="w-full"
            variant="outline"
            disabled={isBusy || googleConfigLoading || !googleEnabled}
            onClick={() => { window.location.href = '/api/auth/google' }}
          >
            <UserRound className="h-4 w-4" />
            {googleConfigLoading ? 'Memeriksa login Google...' : 'Lanjutkan dengan Google'}
          </Button>
          {!googleConfigLoading && !googleEnabled && (
            <p className="text-center text-xs text-muted-foreground">
              Login Google opsional dan belum diaktifkan. Email dan kata sandi sudah bisa digunakan.
            </p>
          )}
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? 'Sudah memiliki akun?' : 'Belum memiliki akun?'}{' '}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                setIsSignUp((value) => !value)
                setError('')
              }}
            >
              {isSignUp ? 'Masuk' : 'Buat akun'}
            </button>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
