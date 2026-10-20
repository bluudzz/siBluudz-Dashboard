import {
  Mail,
  RefreshCw,
  Key,
  Trash2,
  Plus,
  Fingerprint,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card'
import type { MailAccount } from '../types'

interface AccountsListProps {
  accounts: MailAccount[]
  selectedAccountId: string
  loadingAccounts: boolean
  onSelectAccount: (id: string) => void
  onSetLoadingInbox: (v: boolean) => void
  onViewCredentials: (account: MailAccount) => void
  onDeleteAccount: (account: MailAccount) => void
  onAddAccount: () => void
}

export function AccountsList({
  accounts,
  selectedAccountId,
  loadingAccounts,
  onSelectAccount,
  onSetLoadingInbox,
  onViewCredentials,
  onDeleteAccount,
  onAddAccount,
}: AccountsListProps) {
  return (
    <Card className="border-border/70 shadow-sm backdrop-blur-sm flex flex-col h-full min-h-[30rem]">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" />
            <span>Akun Terhubung</span>
          </CardTitle>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20">
            {accounts.length} akun
          </span>
        </div>
        <CardDescription className="text-xs">
          Klik akun untuk membaca inbox atau klik ikon kunci untuk melihat kredensial &amp; format pipa.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-2 pt-3 flex-1 overflow-y-auto max-h-[38rem]">
        {loadingAccounts ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <span>Memuat daftar akun...</span>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
            <Mail className="h-10 w-10 opacity-30 text-blue-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">Belum ada akun email</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Hubungkan akun Outlook atau IMAP Anda dengan mengklik tombol Tambah Akun di atas.
              </p>
            </div>
            <Button
              size="sm"
              onClick={onAddAccount}
              className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white mt-1"
            >
              <Plus className="h-4 w-4" />
              + Tambah Akun Pertama
            </Button>
          </div>
        ) : (
          accounts.map((account) => {
            const isSelected = selectedAccountId === account.id
            const isGraph = account.provider === 'outlook_graph'
            return (
              <div
                key={account.id}
                className={`group flex items-center gap-2 rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-blue-500/60 bg-blue-500/10 shadow-sm ring-1 ring-blue-500/30'
                    : 'border-border/60 hover:border-border hover:bg-muted/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (selectedAccountId !== account.id) onSetLoadingInbox(true)
                    onSelectAccount(account.id)
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`block truncate text-sm font-semibold ${isSelected ? 'text-blue-600 dark:text-blue-300' : 'text-foreground'}`}>
                      {account.email}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {isGraph ? (
                      <span className="inline-flex items-center gap-1 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-300">
                        <Fingerprint className="h-2.5 w-2.5" />
                        OAuth2 Graph
                      </span>
                    ) : account.provider === 'gmail_api' ? (
                      <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                        <Fingerprint className="h-2.5 w-2.5" />
                        Gmail REST API
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground truncate font-mono">
                        {account.host}
                      </span>
                    )}
                    {account.status === 'invalid' && (
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">
                        Token Expired
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Lihat / Salin Kredensial & Format Pipa"
                    aria-label={`Lihat kredensial ${account.email}`}
                    onClick={() => void onViewCredentials(account)}
                    className="h-8 w-8 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10"
                  >
                    <Key className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Hapus akun dari dashboard"
                    aria-label={`Hapus akun ${account.email}`}
                    onClick={() => void onDeleteAccount(account)}
                    className="h-8 w-8 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
