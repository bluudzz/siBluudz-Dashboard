import { ArrowLeft, Laptop, Lock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface WorkflowLocalOnlyLockProps {
  onGoHome: () => void
}

export function WorkflowLocalOnlyLock({ onGoHome }: WorkflowLocalOnlyLockProps) {
  return (
    <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-lg">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
          <Lock className="h-5 w-5" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          Auto Workflow Terkunci
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Fitur Auto Workflow hanya dibuka saat aplikasi dijalankan secara lokal (<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">localhost</code>) di komputer Anda, dan dikunci pada server website/VPS.
        </p>

        <div className="mt-5 rounded-xl border border-border bg-muted/40 p-4 text-left text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Laptop className="h-4 w-4 text-primary shrink-0" />
            <span>Cara membuka di laptop</span>
          </div>
          <p className="leading-relaxed">
            Jalankan server lokal dengan <code className="rounded bg-background px-1.5 py-0.5 text-foreground border border-border">npm run dev</code> lalu buka melalui{' '}
            <code className="rounded bg-background px-1.5 py-0.5 text-foreground border border-border">http://localhost:5173</code> atau{' '}
            <code className="rounded bg-background px-1.5 py-0.5 text-foreground border border-border">http://localhost:3001</code>.
          </p>
        </div>

        <Button
          type="button"
          onClick={onGoHome}
          className="mt-6 w-full gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke App Launcher
        </Button>
      </div>
    </div>
  )
}
