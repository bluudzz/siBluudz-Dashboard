import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  Fingerprint,
  RefreshCw,
  Key,
  Info,
  Download,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { EmailProvider } from '../types'
import { PROVIDER_CONFIGS } from '../utils'

interface AddAccountModalProps {
  open: boolean
  profileEmail: string | undefined
  provider: EmailProvider
  showAdvanced: boolean
  setShowAdvanced: (v: boolean) => void
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  outlookSubMethod: 'device' | 'manual' | 'batch'
  setOutlookSubMethod: (v: 'device' | 'manual' | 'batch') => void
  saving: boolean
  imapForm: { email: string; host: string; username: string; password: string }
  setImapForm: (v: { email: string; host: string; username: string; password: string }) => void
  outlookForm: { email: string; password: string; refreshToken: string; clientId: string }
  setOutlookForm: (v: { email: string; password: string; refreshToken: string; clientId: string }) => void
  outlookBatchText: string
  setOutlookBatchText: (v: string) => void
  showOutlookPassword: boolean
  setShowOutlookPassword: (v: boolean) => void
  showOutlookToken: boolean
  setShowOutlookToken: (v: boolean) => void
  gmailSubMethod: 'oauth' | 'batch' | 'manual' | 'imap'
  setGmailSubMethod: (v: 'oauth' | 'batch' | 'manual' | 'imap') => void
  gmailForm: { email: string; password: string; refreshToken: string; clientId: string; clientSecret: string }
  setGmailForm: (v: { email: string; password: string; refreshToken: string; clientId: string; clientSecret: string }) => void
  gmailBatchText: string
  setGmailBatchText: (v: string) => void
  showGmailPassword: boolean
  setShowGmailPassword: (v: boolean) => void
  showGmailToken: boolean
  setShowGmailToken: (v: boolean) => void
  showGmailSecret: boolean
  setShowGmailSecret: (v: boolean) => void
  batchCountGmail: number
  deviceData: { user_code: string; device_code: string; verification_uri: string; client_id: string } | null
  loadingDeviceCode: boolean
  pollingDevice: boolean
  deviceCodeCopied: boolean
  setDeviceCodeCopied: (v: boolean) => void
  batchCount: number
  onEmailInput: (email: string) => void
  onSelectProvider: (p: EmailProvider) => void
  onAutoFillFromPipe: (text: string) => boolean
  onAddAccount: (e: React.FormEvent<HTMLFormElement>) => void
  onStartDeviceAuth: () => void
  onOpenPopup: () => void
  onCancelDeviceAuth: () => void
  onClose: () => void
}

export function AddAccountModal({
  open,
  profileEmail,
  provider,
  showAdvanced,
  setShowAdvanced,
  showPassword,
  setShowPassword,
  outlookSubMethod,
  setOutlookSubMethod,
  gmailSubMethod,
  setGmailSubMethod,
  saving,
  imapForm,
  setImapForm,
  outlookForm,
  setOutlookForm,
  outlookBatchText,
  setOutlookBatchText,
  showOutlookPassword,
  setShowOutlookPassword,
  showOutlookToken,
  setShowOutlookToken,
  gmailForm,
  setGmailForm,
  gmailBatchText,
  setGmailBatchText,
  showGmailPassword,
  setShowGmailPassword,
  showGmailToken,
  setShowGmailToken,
  showGmailSecret,
  setShowGmailSecret,
  batchCountGmail,
  deviceData,
  loadingDeviceCode,
  pollingDevice,
  deviceCodeCopied,
  setDeviceCodeCopied,
  batchCount,
  onEmailInput,
  onSelectProvider,
  onAutoFillFromPipe,
  onAddAccount,
  onStartDeviceAuth,
  onOpenPopup,
  onCancelDeviceAuth,
  onClose,
}: AddAccountModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-background/95 backdrop-blur-md p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 pb-3.5">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">Tambah / Hubungkan Akun</h3>
                  <p className="text-xs text-muted-foreground">
                    Penyedia terdeteksi otomatis saat Anda mengetik alamat email.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { onCancelDeviceAuth(); onClose() }}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Email Input */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-foreground">Alamat Email</label>
                {profileEmail && (
                  <button
                    type="button"
                    onClick={() => onEmailInput(profileEmail)}
                    className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-medium"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    Gunakan {profileEmail}
                  </button>
                )}
              </div>
              <input
                type="email"
                required
                value={
                  provider === 'outlook'
                    ? outlookForm.email
                    : provider === 'gmail'
                      ? gmailForm.email
                      : imapForm.email
                }
                onChange={(e) => onEmailInput(e.target.value)}
                placeholder="Contoh: user@hotmail.com, user@outlook.com, nama@gmail.com"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                autoFocus
              />
            </div>

            {/* Provider Tabs */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Penyedia Email Terdeteksi
                </label>
                <span className="text-[11px] font-medium text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                  {PROVIDER_CONFIGS[provider].name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {(['outlook', 'gmail', 'yahoo', 'icloud', 'custom'] as EmailProvider[]).map((p) => {
                  const isSelected = provider === p
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onSelectProvider(p)}
                      className={`rounded-lg px-2 py-2 text-xs font-medium transition-all text-center border relative ${
                        isSelected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground border-border/50'
                      }`}
                    >
                      {PROVIDER_CONFIGS[p].shortName}
                      {p === 'outlook' && (
                        <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* OUTLOOK PROVIDER */}
            {provider === 'outlook' && (
              <div className="space-y-4 pt-1">
                {/* Method Switcher */}
                <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border/40 text-xs">
                  <button type="button" onClick={() => setOutlookSubMethod('device')} className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-center transition-all ${outlookSubMethod === 'device' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                    Login Interaktif (Device Code)
                  </button>
                  <button type="button" onClick={() => setOutlookSubMethod('manual')} className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-center transition-all ${outlookSubMethod === 'manual' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                    Format Pipa / Manual
                  </button>
                  <button type="button" onClick={() => setOutlookSubMethod('batch')} className={`flex-1 py-1.5 px-3 rounded-lg font-medium text-center transition-all ${outlookSubMethod === 'batch' ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'}`}>
                    Batch ({batchCount})
                  </button>
                </div>

                {/* DEVICE CODE */}
                {outlookSubMethod === 'device' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">
                        Password Akun Outlook <span className="text-muted-foreground font-normal">(opsional untuk disimpan)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showOutlookPassword ? 'text' : 'password'}
                          value={outlookForm.password}
                          onChange={(e) => setOutlookForm({ ...outlookForm, password: e.target.value })}
                          placeholder="Kata sandi akun (disimpan terenkripsi untuk kebutuhan Anda)"
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowOutlookPassword(!showOutlookPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showOutlookPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {!deviceData ? (
                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
                        <div className="flex items-start gap-2.5">
                          <Sparkles className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                          <div className="space-y-1 text-xs">
                            <p className="font-semibold text-foreground">Login Otomatis via Microsoft Device Flow</p>
                            <p className="text-muted-foreground leading-relaxed">
                              Sistem akan memberikan 8-karakter PIN. Anda cukup membuka halaman resmi Microsoft, paste PIN, dan login. Token & Client ID akan terdeteksi dan tersimpan otomatis!
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          onClick={onStartDeviceAuth}
                          disabled={loadingDeviceCode}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 gap-2 shadow-sm"
                        >
                          {loadingDeviceCode ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
                          {loadingDeviceCode ? 'Menghubungkan ke Microsoft...' : 'Mulai Login Microsoft (Dapatkan PIN)'}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3 rounded-xl border border-blue-500/40 bg-blue-500/5 p-4">
                        {/* Step 1: PIN */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">1</span>
                              Salin PIN Otorisasi
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await navigator.clipboard.writeText(deviceData.user_code)
                                setDeviceCodeCopied(true)
                                setTimeout(() => setDeviceCodeCopied(false), 2000)
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {deviceCodeCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              {deviceCodeCopied ? 'Tersalin!' : 'Salin PIN'}
                            </button>
                          </div>
                          <div className="flex items-center justify-center rounded-lg border border-blue-500/40 bg-background py-2 px-4 shadow-inner">
                            <span className="font-mono text-2xl sm:text-3xl font-extrabold tracking-widest text-primary select-all">
                              {deviceData.user_code}
                            </span>
                          </div>
                        </div>

                        {/* Step 2: Open auth page */}
                        <div className="space-y-1.5 pt-1">
                          <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">2</span>
                            Buka Halaman Otorisasi Microsoft
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <a
                              href={deviceData.verification_uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={async () => {
                                await navigator.clipboard.writeText(deviceData.user_code)
                                setDeviceCodeCopied(true)
                                setTimeout(() => setDeviceCodeCopied(false), 2000)
                              }}
                              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-2 text-xs shadow-sm transition-all text-center"
                            >
                              <ExternalLink className="h-4 w-4" />
                              <span>Buka Halaman Microsoft (Tab Baru)</span>
                            </a>
                            <Button type="button" variant="outline" size="sm" onClick={onOpenPopup} className="gap-1.5 text-xs border-border">
                              <Fingerprint className="h-3.5 w-3.5 text-blue-500" />
                              <span>Buka Jendela Popup</span>
                            </Button>
                          </div>
                          <p className="text-[11px] text-muted-foreground text-center pt-0.5">
                            Paste PIN di halaman Microsoft, lalu konfirmasi akun email Anda.
                          </p>
                        </div>

                        {/* Step 3: Polling */}
                        <div className="rounded-lg border border-border/60 bg-background/60 p-3 flex items-center gap-2.5 text-xs text-muted-foreground">
                          <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-blue-500" />
                          <span>
                            {pollingDevice
                              ? 'Menunggu Anda menyelesaikan login di Microsoft... Akun akan tersimpan otomatis saat selesai!'
                              : 'Otorisasi selesai.'}
                          </span>
                        </div>

                        <div className="flex justify-end pt-1">
                          <button type="button" onClick={onCancelDeviceAuth} className="text-xs text-rose-500 hover:underline">
                            Batalkan Otorisasi
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* MANUAL / PIPE */}
                {outlookSubMethod === 'manual' && (
                  <form onSubmit={onAddAccount} className="space-y-3">
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs">
                      <label className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                        Paste 1 Baris Format Pipa (Auto-fill Cepat):
                      </label>
                      <input
                        type="text"
                        placeholder="email|password|refresh_token|client_id"
                        onChange={(e) => { if (onAutoFillFromPipe(e.target.value)) e.target.value = '' }}
                        className="w-full rounded border border-blue-500/30 bg-background px-2.5 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Password (Disimpan Terenkripsi)</label>
                      <div className="relative">
                        <input
                          type={showOutlookPassword ? 'text' : 'password'}
                          value={outlookForm.password}
                          onChange={(e) => setOutlookForm({ ...outlookForm, password: e.target.value })}
                          placeholder="Kata sandi akun"
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowOutlookPassword(!showOutlookPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showOutlookPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Refresh Token OAuth2</label>
                      <div className="relative">
                        <input
                          type={showOutlookToken ? 'text' : 'password'}
                          required
                          value={outlookForm.refreshToken}
                          onChange={(e) => setOutlookForm({ ...outlookForm, refreshToken: e.target.value })}
                          placeholder="M.C548_BAY.0.U..."
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowOutlookToken(!showOutlookToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showOutlookToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Client ID (Public Client)</label>
                      <input
                        type="text"
                        required
                        value={outlookForm.clientId}
                        onChange={(e) => setOutlookForm({ ...outlookForm, clientId: e.target.value })}
                        placeholder="04b07795-8ddb-461a-bbee-02f9e1bf7b46"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono"
                      />
                    </div>

                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2 pt-2" disabled={saving}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                      {saving ? 'Menyimpan Akun...' : 'Simpan & Hubungkan Akun Outlook'}
                    </Button>
                  </form>
                )}

                {/* BATCH */}
                {outlookSubMethod === 'batch' && (
                  <form onSubmit={onAddAccount} className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">Daftar Akun Format Pipa</label>
                        <span className="text-[11px] text-muted-foreground font-mono">1 akun per baris</span>
                      </div>
                      <textarea
                        rows={6}
                        required
                        value={outlookBatchText}
                        onChange={(e) => setOutlookBatchText(e.target.value)}
                        placeholder={'email@hotmail.com|password123|refresh_token_here|client_id_here\nemail2@outlook.com|pass456|token_here|client_id_here'}
                        className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/40 leading-relaxed"
                      />
                    </div>
                    <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2" disabled={saving || batchCount === 0}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {saving ? 'Mengimpor Akun...' : `Impor ${batchCount || ''} Akun Outlook`}
                    </Button>
                  </form>
                )}
              </div>
            )}

            {/* GMAIL PROVIDER */}
            {provider === 'gmail' && (
              <div className="space-y-4 pt-1">
                {/* Method Switcher */}
                <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border/40 text-xs overflow-x-auto gap-1">
                  <button
                    type="button"
                    onClick={() => setGmailSubMethod('oauth')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium text-center transition-all whitespace-nowrap ${
                      gmailSubMethod === 'oauth'
                        ? 'bg-background text-rose-600 dark:text-rose-400 shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    One-Click OAuth
                  </button>
                  <button
                    type="button"
                    onClick={() => setGmailSubMethod('batch')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium text-center transition-all whitespace-nowrap ${
                      gmailSubMethod === 'batch'
                        ? 'bg-background text-rose-600 dark:text-rose-400 shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Format Pipa ({batchCountGmail})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGmailSubMethod('manual')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium text-center transition-all whitespace-nowrap ${
                      gmailSubMethod === 'manual'
                        ? 'bg-background text-rose-600 dark:text-rose-400 shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Manual
                  </button>
                  <button
                    type="button"
                    onClick={() => setGmailSubMethod('imap')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg font-medium text-center transition-all whitespace-nowrap ${
                      gmailSubMethod === 'imap'
                        ? 'bg-background text-foreground shadow-xs font-semibold'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    App Password
                  </button>
                </div>

                {/* GMAIL ONE-CLICK OAUTH */}
                {gmailSubMethod === 'oauth' && (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
                      <div className="flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-rose-500 mt-0.5 shrink-0" />
                        <div className="space-y-1 text-xs">
                          <p className="font-semibold text-foreground">Login Otomatis via Google Web OAuth (One-Click)</p>
                          <p className="text-muted-foreground leading-relaxed">
                            Cukup klik tombol di bawah untuk membuka halaman otorisasi resmi Google dan konfirmasi akun Gmail Anda. Server akan otomatis menangkap dan menyimpan <b>Refresh Token, Client ID, dan Client Secret</b> ke database!
                          </p>
                        </div>
                      </div>
                      <a
                        href="/api/gmail/oauth/authorize"
                        className="flex items-center justify-center w-full rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-medium py-2.5 gap-2 shadow-md shadow-rose-500/20 text-xs text-center transition-all cursor-pointer"
                      >
                        <Fingerprint className="h-4 w-4" />
                        <span>Hubungkan dengan Akun Google (Login Otomatis)</span>
                        <ExternalLink className="h-3.5 w-3.5 opacity-80" />
                      </a>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                      <p className="font-medium text-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-blue-500" />
                        Tips Multi-Akun Google:
                      </p>
                      <p className="text-[11px] leading-relaxed">
                        Anda dapat menghubungkan akun Gmail berbeda secara berturut-turut. Setiap kali klik tombol di atas, Google akan meminta Anda memilih akun yang ingin dihubungkan.
                      </p>
                    </div>
                  </div>
                )}

                {/* GMAIL BATCH */}
                {gmailSubMethod === 'batch' && (
                  <form onSubmit={onAddAccount} className="space-y-3">
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs text-rose-900 dark:text-rose-200">
                      <p className="font-semibold text-rose-600 dark:text-rose-400">
                        Format Pipa Standar Gmail (OAuth2):
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground pt-0.5 select-all">
                        email|refresh_token|client_id|client_secret
                      </p>
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Atau 5 segmen jika ada password: <span className="font-mono select-all">email|password|refresh_token|client_id|client_secret</span>
                      </p>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-foreground">Daftar Akun Format Pipa</label>
                        <span className="text-[11px] text-muted-foreground font-mono">1 akun per baris</span>
                      </div>
                      <textarea
                        rows={6}
                        required
                        value={gmailBatchText}
                        onChange={(e) => setGmailBatchText(e.target.value)}
                        placeholder={'user1@gmail.com|1//04xxxx|xxxx.apps.googleusercontent.com|GOCSPX-xxxx\nuser2@gmail.com|pass123|1//04xxxx|xxxx.apps.googleusercontent.com|GOCSPX-xxxx'}
                        className="w-full rounded-xl border border-border bg-background p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-rose-500/40 leading-relaxed"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white font-medium gap-2 shadow-sm"
                      disabled={saving || batchCountGmail === 0}
                    >
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      {saving ? 'Mengimpor Akun...' : `Impor ${batchCountGmail || ''} Akun Gmail`}
                    </Button>
                  </form>
                )}

                {/* GMAIL MANUAL */}
                {gmailSubMethod === 'manual' && (
                  <form onSubmit={onAddAccount} className="space-y-3">
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5 text-xs">
                      <label className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                        Paste 1 Baris Format Pipa Gmail (Auto-fill Cepat):
                      </label>
                      <input
                        type="text"
                        placeholder="email|refresh_token|client_id|client_secret"
                        onChange={(e) => { if (onAutoFillFromPipe(e.target.value)) e.target.value = '' }}
                        className="w-full rounded border border-rose-500/30 bg-background px-2.5 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-rose-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Client ID Google</label>
                      <input
                        type="text"
                        required
                        value={gmailForm.clientId}
                        onChange={(e) => setGmailForm({ ...gmailForm, clientId: e.target.value })}
                        placeholder="xxxx.apps.googleusercontent.com"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Client Secret Google</label>
                      <div className="relative">
                        <input
                          type={showGmailSecret ? 'text' : 'password'}
                          required
                          value={gmailForm.clientSecret}
                          onChange={(e) => setGmailForm({ ...gmailForm, clientSecret: e.target.value })}
                          placeholder="GOCSPX-xxxx"
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowGmailSecret(!showGmailSecret)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showGmailSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Refresh Token OAuth2</label>
                      <div className="relative">
                        <input
                          type={showGmailToken ? 'text' : 'password'}
                          required
                          value={gmailForm.refreshToken}
                          onChange={(e) => setGmailForm({ ...gmailForm, refreshToken: e.target.value })}
                          placeholder="1//04xxxx..."
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowGmailToken(!showGmailToken)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showGmailToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">
                        Password Cadangan <span className="text-muted-foreground font-normal">(opsional)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showGmailPassword ? 'text' : 'password'}
                          value={gmailForm.password}
                          onChange={(e) => setGmailForm({ ...gmailForm, password: e.target.value })}
                          placeholder="Password akun (opsional)"
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono"
                        />
                        <button type="button" onClick={() => setShowGmailPassword(!showGmailPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showGmailPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700 text-white font-medium gap-2 pt-2" disabled={saving}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                      {saving ? 'Menyimpan Akun...' : 'Simpan & Hubungkan Akun Gmail'}
                    </Button>
                  </form>
                )}

                {/* GMAIL IMAP */}
                {gmailSubMethod === 'imap' && (
                  <form onSubmit={onAddAccount} className="space-y-3.5 pt-1">
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                        <div className="space-y-1">
                          <p className="font-semibold">Gunakan Sandi Aplikasi Google (App Password)</p>
                          <p className="text-[11px] leading-relaxed text-muted-foreground dark:text-amber-200/80">
                            Aktifkan 2-Step Verification pada Akun Google Anda, lalu buat Sandi Aplikasi 16-karakter khusus untuk Mail.
                          </p>
                          <a
                            href="https://myaccount.google.com/apppasswords"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400 hover:underline pt-0.5"
                          >
                            <span>Buka Pengaturan App Password Google</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-foreground">Sandi Aplikasi (16 Karakter)</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={imapForm.password}
                          onChange={(e) => setImapForm({ ...imapForm, password: e.target.value })}
                          placeholder="xxxx xxxx xxxx xxxx"
                          className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/40 font-mono tracking-wider"
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <Button type="submit" className="w-full bg-rose-600 hover:bg-rose-700 text-white font-medium gap-2 mt-3" disabled={saving}>
                      {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                      {saving ? 'Memverifikasi & Menghubungkan...' : 'Masuk via IMAP Google'}
                    </Button>
                  </form>
                )}
              </div>
            )}

            {/* IMAP PROVIDER */}
            {provider !== 'outlook' && provider !== 'gmail' && (
              <form onSubmit={onAddAccount} className="space-y-3.5 pt-1">
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                    <div className="space-y-1">
                      <p className="font-semibold">Gunakan Sandi Aplikasi (App Password)</p>
                      <p className="text-[11px] leading-relaxed text-muted-foreground dark:text-amber-200/80">
                        {PROVIDER_CONFIGS[provider].hint}
                      </p>
                      {PROVIDER_CONFIGS[provider].helpUrl && (
                        <a
                          href={PROVIDER_CONFIGS[provider].helpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-blue-600 dark:text-blue-400 hover:underline pt-0.5"
                        >
                          <span>{PROVIDER_CONFIGS[provider].helpLabel}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-foreground">
                    {provider === 'yahoo' || provider === 'icloud'
                      ? 'Sandi Aplikasi (16 Karakter)'
                      : 'Kata Sandi Email'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={imapForm.password}
                      onChange={(e) => setImapForm({ ...imapForm, password: e.target.value })}
                      placeholder={
                        provider === 'yahoo' || provider === 'icloud'
                          ? 'xxxx xxxx xxxx xxxx'
                          : 'Kata sandi email Anda'
                      }
                      className="w-full rounded-lg border border-border bg-background pl-3 pr-10 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 font-mono tracking-wider"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {(provider === 'custom' || showAdvanced) && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-foreground">Host Server IMAP</label>
                    <input
                      required
                      value={imapForm.host}
                      onChange={(e) => setImapForm({ ...imapForm, host: e.target.value })}
                      placeholder="mail.domainanda.com"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                )}

                {provider !== 'custom' && !showAdvanced && (
                  <button type="button" onClick={() => setShowAdvanced(true)} className="text-[11px] text-muted-foreground hover:text-foreground inline-block">
                    + Pengaturan Host IMAP Lanjutan
                  </button>
                )}

                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium gap-2 mt-3" disabled={saving}>
                  {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  {saving ? 'Memverifikasi & Menghubungkan...' : 'Masuk & Hubungkan Inbox'}
                </Button>
              </form>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end border-t border-border/40 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={() => { onCancelDeviceAuth(); onClose() }}>
                Tutup
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
