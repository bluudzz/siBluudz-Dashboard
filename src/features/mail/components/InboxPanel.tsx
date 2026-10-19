import {
  Inbox,
  RefreshCw,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import type { MailAccount, MailMessage, MailMessageDetail } from '../types'
import { formatDate } from '../utils'

interface InboxPanelProps {
  selectedAccount: MailAccount | undefined
  isOutlookGraph: boolean
  messages: MailMessage[]
  selectedMessage: MailMessageDetail | null
  loadingInbox: boolean
  onRefreshInbox: () => void
  onOpenMessage: (uid: number | string) => void
  onCloseMessage: () => void
}

export function InboxPanel({
  selectedAccount,
  isOutlookGraph,
  messages,
  selectedMessage,
  loadingInbox,
  onRefreshInbox,
  onOpenMessage,
  onCloseMessage,
}: InboxPanelProps) {
  return (
    <Card className="min-h-[32rem] xl:col-span-2 border-border/70 shadow-sm backdrop-blur-sm flex flex-col">
      <CardHeader className="border-b border-border/40 pb-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Inbox className="h-4 w-4 text-blue-500" />
              {selectedAccount ? `Inbox · ${selectedAccount.email}` : 'Inbox Email'}
            </CardTitle>
            <CardDescription className="text-xs mt-0.5">
              {selectedAccount
                ? isOutlookGraph
                  ? 'Sinkronisasi instan via Microsoft Graph API (Otorisasi Publik).'
                  : 'Menampilkan pesan terbaru dari folder INBOX.'
                : 'Pilih atau tambahkan akun di sebelah kiri untuk melihat pesan.'}
            </CardDescription>
          </div>

          {selectedAccount && (
            <div className="flex items-center gap-2 pt-1 sm:pt-0">
              <Button
                size="sm"
                variant="outline"
                onClick={onRefreshInbox}
                disabled={loadingInbox}
                className="gap-1.5 text-xs font-medium border-border hover:bg-muted"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingInbox ? 'animate-spin text-primary' : ''}`} />
                Refresh Inbox
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 flex flex-col">
        {selectedMessage ? (
          <div className="space-y-4 p-5 flex-1">
            <div className="flex items-start justify-between gap-3 border-b border-border/40 pb-4">
              <div className="min-w-0">
                <h2 className="break-words text-lg font-semibold text-foreground">{selectedMessage.subject}</h2>
                <p className="mt-1 break-all text-xs text-muted-foreground">{selectedMessage.from}</p>
                <p className="mt-1 text-xs text-muted-foreground">{formatDate(selectedMessage.date)}</p>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Tutup email" onClick={onCloseMessage}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <pre className="max-h-[38rem] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-4 text-sm font-sans leading-relaxed">
              {selectedMessage.text || '(Email ini tidak memiliki isi teks yang dapat ditampilkan.)'}
            </pre>
            <p className="text-[11px] text-muted-foreground">Isi email ditampilkan dalam format teks bersih untuk keamanan.</p>
          </div>
        ) : loadingInbox ? (
          <div className="flex flex-1 min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            Mengambil pesan dari Microsoft Graph / IMAP...
          </div>
        ) : !selectedAccount ? (
          <div className="flex flex-1 min-h-64 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40 text-blue-500" />
            <p className="text-sm">Belum ada akun email yang dipilih.</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 min-h-64 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
            <Inbox className="h-8 w-8 opacity-40 text-blue-500" />
            <p className="text-sm font-medium">Inbox kosong atau tidak ada email terbaru.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50 overflow-y-auto max-h-[46rem]">
            {messages.map((message) => {
              const sender = Array.isArray(message.from) ? message.from[0] : null
              return (
                <button
                  key={String(message.uid)}
                  type="button"
                  onClick={() => void onOpenMessage(message.uid)}
                  className="w-full p-4 text-left transition-colors hover:bg-accent/40 flex flex-col gap-1"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className={`min-w-0 truncate text-sm ${message.unread ? 'font-bold text-foreground' : 'font-medium text-foreground/80'}`}>
                      {message.subject}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatDate(message.date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {message.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                    <span className="truncate text-xs text-muted-foreground">
                      {sender?.name ? `${sender.name} · ` : ''}{sender?.address || 'Pengirim tidak diketahui'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
