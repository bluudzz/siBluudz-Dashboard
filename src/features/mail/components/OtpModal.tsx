import { motion, AnimatePresence } from 'framer-motion'
import {
  Sparkles,
  Search,
  RefreshCw,
  Copy,
  Check,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface OtpModalProps {
  open: boolean
  onClose: () => void
  otpService: string
  setOtpService: (v: string) => void
  otpResult: string | null
  loadingOtp: boolean
  otpCopied: boolean
  onFetchOtp: (service?: string) => void
  onCopyOtp: () => void
}

export function OtpModal({
  open,
  onClose,
  otpService,
  setOtpService,
  otpResult,
  loadingOtp,
  otpCopied,
  onFetchOtp,
  onCopyOtp,
}: OtpModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full max-w-md rounded-2xl border border-border/80 bg-background/95 backdrop-blur-md p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                <h3 className="text-base font-bold text-foreground">Ekstraktor OTP & Verifikasi</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-semibold text-foreground">Filter Layanan (Opsional)</label>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={otpService}
                  onChange={(e) => setOtpService(e.target.value)}
                  placeholder="Contoh: GitHub, Steam, Google, Discord..."
                  className="w-full rounded-lg border border-border bg-background pl-8 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="flex flex-wrap gap-1.5 pt-1">
                {['Semua', 'GitHub', 'Google', 'Steam', 'Discord', 'Microsoft'].map((svc) => (
                  <button
                    key={svc}
                    type="button"
                    onClick={() => {
                      const target = svc === 'Semua' ? '' : svc
                      setOtpService(target)
                      void onFetchOtp(target)
                    }}
                    className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                  >
                    {svc}
                  </button>
                ))}
              </div>
            </div>

            {/* OTP Result Card */}
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 text-center space-y-2">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                Kode Verifikasi Ditemukan
              </span>
              {loadingOtp ? (
                <div className="flex items-center justify-center gap-2 py-3 text-sm text-blue-500 font-medium">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Memindai email terbaru...
                </div>
              ) : otpResult ? (
                <div className="space-y-3">
                  <div className="text-3xl font-extrabold tracking-widest text-primary font-mono select-all py-1">
                    {otpResult}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={onCopyOtp}
                    className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {otpCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {otpCopied ? 'Tersalin!' : 'Salin Kode OTP'}
                  </Button>
                </div>
              ) : (
                <div className="py-3 text-xs text-muted-foreground">
                  Belum ada kode OTP yang ditemukan pada pesan email terbaru.
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Tutup
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void onFetchOtp()}
                disabled={loadingOtp}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {loadingOtp ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Pindai Ulang
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
