import { motion, AnimatePresence } from 'framer-motion'
import {
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  X,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { AccountCredentials } from '../types'

interface CredentialsModalProps {
  open: boolean
  onClose: () => void
  loading: boolean
  data: AccountCredentials | null
  copiedField: string | null
  showPassword: boolean
  setShowPassword: (v: boolean) => void
  showToken: boolean
  setShowToken: (v: boolean) => void
  onCopyField: (text: string, fieldName: string) => void
}

export function CredentialsModal({
  open,
  onClose,
  loading,
  data,
  copiedField,
  showPassword,
  setShowPassword,
  showToken,
  setShowToken,
  onCopyField,
}: CredentialsModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-lg rounded-2xl border border-border/80 bg-background/95 backdrop-blur-md p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-500">
                  <Key className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">Kredensial Akun Tersimpan</h3>
                  <p className="text-xs text-muted-foreground">
                    Data disimpan terenkripsi di database dan dapat disalin sewaktu-waktu.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                <span>Mendekripsi data kredensial...</span>
              </div>
            ) : data ? (
              <div className="space-y-4">
                {/* Pipe format */}
                <div className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                      <Copy className="h-3.5 w-3.5" />
                      Format Pipa (email|password|refresh_token|client_id)
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onCopyField(data.pipe_line || '', 'pipe')}
                      className="h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {copiedField === 'pipe' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copiedField === 'pipe' ? 'Tersalin!' : 'Salin Format Pipa'}
                    </Button>
                  </div>
                  <pre className="font-mono text-xs p-2.5 rounded-lg border border-blue-500/30 bg-background/90 text-foreground overflow-x-auto whitespace-pre select-all">
                    {data.pipe_line}
                  </pre>
                </div>

                <div className="space-y-3">
                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Email</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly value={data.email} className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground select-all" />
                      <Button type="button" variant="outline" size="sm" onClick={() => onCopyField(data.email, 'email')} className="shrink-0 h-8 px-2.5 text-xs">
                        {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Password</label>
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-[11px] text-blue-500 hover:underline flex items-center gap-1">
                        {showPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {showPassword ? 'Sembunyikan' : 'Perlihatkan'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type={showPassword ? 'text' : 'password'} readOnly value={data.password || '(Kosong / tidak diisi)'} className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground select-all" />
                      <Button type="button" variant="outline" size="sm" onClick={() => onCopyField(data.password || '', 'password')} className="shrink-0 h-8 px-2.5 text-xs">
                        {copiedField === 'password' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Refresh Token */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Refresh Token OAuth2</label>
                      <button type="button" onClick={() => setShowToken(!showToken)} className="text-[11px] text-blue-500 hover:underline flex items-center gap-1">
                        {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        {showToken ? 'Sembunyikan' : 'Perlihatkan'}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type={showToken ? 'text' : 'password'} readOnly value={data.refresh_token || '-'} className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground select-all" />
                      <Button type="button" variant="outline" size="sm" onClick={() => onCopyField(data.refresh_token || '', 'token')} className="shrink-0 h-8 px-2.5 text-xs">
                        {copiedField === 'token' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>

                  {/* Client ID */}
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Client ID (Public Client)</label>
                    <div className="flex items-center gap-2">
                      <input type="text" readOnly value={data.client_id || '-'} className="w-full rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-foreground select-all" />
                      <Button type="button" variant="outline" size="sm" onClick={() => onCopyField(data.client_id || '', 'client_id')} className="shrink-0 h-8 px-2.5 text-xs">
                        {copiedField === 'client_id' ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Kredensial tidak dapat dimuat.</p>
            )}

            <div className="flex items-center justify-end border-t border-border/40 pt-3">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Tutup
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
