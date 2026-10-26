import { Mail, RefreshCw } from 'lucide-react'
import type { MailAccount } from '../types'
import { providerLabel } from '../utils'

interface AccountsListProps {
  accounts: MailAccount[]
  selectedAccountId: string
  loadingAccounts: boolean
  onSelectAccount: (id: string) => void
  onSetLoadingInbox: (v: boolean) => void
  onAddAccount: () => void
}

export function AccountsList({
  accounts,
  selectedAccountId,
  loadingAccounts,
  onSelectAccount,
  onSetLoadingInbox,
  onAddAccount,
}: AccountsListProps) {
  return (
    <div className="em-rail-group">
      <h3>Akun</h3>
      {loadingAccounts ? (
        <p className="em-rail-note"><RefreshCw size={13} className="animate-spin" /> Memuat akun…</p>
      ) : accounts.length === 0 ? (
        <div className="em-rail-empty">
          <Mail size={16} />
          <p>Belum ada akun.</p>
          <button type="button" className="em-text-button" onClick={onAddAccount}>Tambah akun</button>
        </div>
      ) : (
        accounts.map((account) => {
          const isSelected = selectedAccountId === account.id
          return (
            <button
              key={account.id}
              type="button"
              data-account-id={account.id}
              className={isSelected ? 'is-selected' : ''}
              aria-current={isSelected ? 'true' : undefined}
              title={`${account.email} · ${providerLabel(account.provider)}`}
              onClick={() => {
                if (!isSelected) onSetLoadingInbox(true)
                onSelectAccount(account.id)
              }}
            >
              <span className="em-rail-account">
                <span className="em-rail-email">{account.email}</span>
                <span className="em-rail-meta">
                  {providerLabel(account.provider)}
                  {account.status === 'invalid' && ' · token kedaluwarsa'}
                </span>
              </span>
              {account.status === 'invalid' && <span className="em-warn-dot" aria-hidden="true" />}
            </button>
          )
        })
      )}
    </div>
  )
}
