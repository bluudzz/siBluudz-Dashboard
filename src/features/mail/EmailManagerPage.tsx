import * as React from 'react'
import { Plus, Download, ShieldCheck, Sparkles, X, Search, Key, Trash2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/context/UserContext'
import { useMailAccounts } from './hooks/useMailAccounts'
import { useAddAccount } from './hooks/useAddAccount'
import { AccountsList } from './components/AccountsList'
import { InboxPanel } from './components/InboxPanel'
import { AddAccountModal } from './components/AddAccountModal'
import { CredentialsModal } from './components/CredentialsModal'
import { OtpModal } from './components/OtpModal'
import { filterMessages } from './utils'
import './mail-workspace.css'

export function EmailManagerPage() {
  const { profile } = useUser()
  const [query, setQuery] = React.useState('')

  const mail = useMailAccounts()
  const addAccount = useAddAccount({
    loadAccounts: mail.loadAccounts,
    loadInbox: mail.loadInbox,
    setSelectedAccountId: mail.setSelectedAccountId,
    setNotice: mail.setNotice,
    setError: mail.setError,
    setAccounts: mail.setAccounts,
    setLoadingInbox: mail.setLoadingInbox,
  })

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('gmailOAuth') === 'success') {
      const email = params.get('email')
      mail.setNotice(
        email
          ? `Akun Gmail ${email} berhasil dihubungkan via Google OAuth!`
          : 'Akun Gmail berhasil dihubungkan via Google OAuth!'
      )
      window.history.replaceState({}, document.title, window.location.pathname)
      void mail.loadAccounts()
    } else if (params.get('gmailOAuthError')) {
      const err = params.get('gmailOAuthError')
      mail.setError(`Gagal menghubungkan Google OAuth: ${err || 'Otorisasi dibatalkan'}`)
      window.history.replaceState({}, document.title, window.location.pathname)
    }
    // Only run for the OAuth redirect query on mount.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleMessages = React.useMemo(() => filterMessages(mail.messages, query), [mail.messages, query])

  const refreshInbox = () => {
    mail.setLoadingInbox(true)
    void mail.loadInbox(mail.selectedAccountId)
  }

  const openAddAccount = () => {
    addAccount.setAddAccountModalOpen(true)
    mail.setError('')
    mail.setNotice('')
  }

  return (
    <div className="em-workspace">
      <header className="em-page-header">
        <div>
          <h1>Email Manager</h1>
          <p>Kelola akun Outlook Graph, Gmail API, dan IMAP, lalu baca inbox-nya di satu ruang kerja.</p>
        </div>
        <div className="em-header-actions">
          <Button data-testid="add-account" onClick={openAddAccount}>
            <Plus size={16} />
            Tambah akun
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={mail.handleExportAll}
            disabled={mail.exportingAll || mail.accounts.length === 0}
            title="Unduh .txt format pipa (email|password|refresh_token|client_id)"
          >
            <Download size={15} />
            Export
          </Button>
        </div>
      </header>

      <div className="em-status" role="status">
        <span className="em-stat"><strong>{mail.accounts.length}</strong> akun terhubung</span>
        {mail.selectedAccount ? (
          <span className="em-stat">Aktif <strong>{mail.selectedAccount.email}</strong></span>
        ) : (
          <span className="em-stat">Belum ada akun dipilih</span>
        )}
        {mail.selectedAccount && (
          <span className="em-actions-inline">
            {(mail.isOutlookGraph || mail.isGmailApi) && (
              <>
                <button
                  type="button"
                  className="em-tool-button"
                  onClick={() => {
                    mail.setOtpModalOpen(true)
                    void mail.handleFetchOtp()
                  }}
                >
                  <Sparkles size={14} />
                  Cek OTP
                </button>
                <button
                  type="button"
                  className="em-tool-button"
                  onClick={() => void mail.handleTestRefreshToken(mail.selectedAccount!.id)}
                  disabled={mail.refreshingToken}
                >
                  <ShieldCheck size={14} className={mail.refreshingToken ? 'animate-spin' : ''} />
                  Test token
                </button>
              </>
            )}
            <button type="button" className="em-tool-button" onClick={() => void mail.handleViewCredentials(mail.selectedAccount!)}>
              <Key size={14} />
              Kredensial
            </button>
            <button type="button" className="em-tool-button is-danger" onClick={() => void mail.handleDeleteAccount(mail.selectedAccount!)}>
              <Trash2 size={14} />
              Hapus akun
            </button>
          </span>
        )}
      </div>

      {mail.error && (
        <div className="em-notice is-error" role="alert">
          <span>{mail.error}</span>
          <button type="button" aria-label="Tutup pesan galat" onClick={() => mail.setError('')}><X size={14} /></button>
        </div>
      )}
      {mail.notice && (
        <div className="em-notice is-success" role="status">
          <span>{mail.notice}</span>
          <button type="button" aria-label="Tutup pemberitahuan" onClick={() => mail.setNotice('')}><X size={14} /></button>
        </div>
      )}

      <div className="em-studio">
        <aside className="em-rail" aria-label="Akun dan tindakan email">
          <div className="em-rail-heading">
            <h2>Kotak masuk</h2>
            <span>{mail.accounts.length}</span>
          </div>
          <AccountsList
            accounts={mail.accounts}
            selectedAccountId={mail.selectedAccountId}
            loadingAccounts={mail.loadingAccounts}
            onSelectAccount={(id) => {
              setQuery('')
              mail.setSelectedAccountId(id)
            }}
            onSetLoadingInbox={mail.setLoadingInbox}
            onAddAccount={openAddAccount}
          />
          <p className="em-rail-note">Kredensial tidak pernah ditampilkan otomatis. Buka lewat tombol Kredensial dan tutup kembali setelah selesai.</p>
        </aside>

        <div className="em-sheet">
          <div className="em-sheet-tools">
            <label className="em-search">
              <Search size={15} />
              <input
                aria-label="Cari email"
                placeholder="Cari subjek, pengirim, atau cuplikan…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={!mail.selectedAccount}
              />
              {query && (
                <button type="button" aria-label="Hapus pencarian" onClick={() => setQuery('')}>
                  <X size={14} />
                </button>
              )}
            </label>
            <button
              type="button"
              className="em-tool-button"
              onClick={refreshInbox}
              disabled={!mail.selectedAccount || mail.loadingInbox}
            >
              <RefreshCw size={14} className={mail.loadingInbox ? 'animate-spin' : ''} />
              Muat ulang
            </button>
          </div>

          <InboxPanel
            selectedAccount={mail.selectedAccount}
            isOutlookGraph={mail.isOutlookGraph}
            query={query}
            messages={visibleMessages}
            totalMessages={mail.messages.length}
            selectedMessage={mail.selectedMessage}
            loadingInbox={mail.loadingInbox}
            onOpenMessage={mail.handleOpenMessage}
            onCloseMessage={() => mail.setSelectedMessage(null)}
          />
        </div>
      </div>

      <AddAccountModal
        open={addAccount.addAccountModalOpen}
        profileEmail={profile.email}
        provider={addAccount.provider}
        showAdvanced={addAccount.showAdvanced}
        setShowAdvanced={addAccount.setShowAdvanced}
        showPassword={addAccount.showPassword}
        setShowPassword={addAccount.setShowPassword}
        outlookSubMethod={addAccount.outlookSubMethod}
        setOutlookSubMethod={addAccount.setOutlookSubMethod}
        gmailSubMethod={addAccount.gmailSubMethod}
        setGmailSubMethod={addAccount.setGmailSubMethod}
        saving={addAccount.saving}
        imapForm={addAccount.imapForm}
        setImapForm={addAccount.setImapForm}
        outlookForm={addAccount.outlookForm}
        setOutlookForm={addAccount.setOutlookForm}
        outlookBatchText={addAccount.outlookBatchText}
        setOutlookBatchText={addAccount.setOutlookBatchText}
        showOutlookPassword={addAccount.showOutlookPassword}
        setShowOutlookPassword={addAccount.setShowOutlookPassword}
        showOutlookToken={addAccount.showOutlookToken}
        setShowOutlookToken={addAccount.setShowOutlookToken}
        gmailForm={addAccount.gmailForm}
        setGmailForm={addAccount.setGmailForm}
        gmailBatchText={addAccount.gmailBatchText}
        setGmailBatchText={addAccount.setGmailBatchText}
        showGmailPassword={addAccount.showGmailPassword}
        setShowGmailPassword={addAccount.setShowGmailPassword}
        showGmailToken={addAccount.showGmailToken}
        setShowGmailToken={addAccount.setShowGmailToken}
        showGmailSecret={addAccount.showGmailSecret}
        setShowGmailSecret={addAccount.setShowGmailSecret}
        batchCountGmail={addAccount.batchCountGmail}
        deviceData={addAccount.deviceData}
        loadingDeviceCode={addAccount.loadingDeviceCode}
        pollingDevice={addAccount.pollingDevice}
        deviceCodeCopied={addAccount.deviceCodeCopied}
        setDeviceCodeCopied={addAccount.setDeviceCodeCopied}
        batchCount={addAccount.batchCount}
        onEmailInput={addAccount.handleEmailInput}
        onSelectProvider={addAccount.handleSelectProvider}
        onAutoFillFromPipe={addAccount.handleAutoFillFromPipe}
        onAddAccount={addAccount.handleAddAccount}
        onStartDeviceAuth={addAccount.handleStartDeviceAuth}
        onOpenPopup={addAccount.handleOpenPopup}
        onCancelDeviceAuth={addAccount.handleCancelDeviceAuth}
        onClose={() => addAccount.setAddAccountModalOpen(false)}
      />

      <CredentialsModal
        open={mail.credentialsModalOpen}
        onClose={() => mail.setCredentialsModalOpen(false)}
        loading={mail.loadingCredentials}
        data={mail.credentialsData}
        copiedField={mail.copiedField}
        showPassword={mail.showCredPassword}
        setShowPassword={mail.setShowCredPassword}
        showToken={mail.showCredToken}
        setShowToken={mail.setShowCredToken}
        onCopyField={mail.handleCopyField}
      />

      <OtpModal
        open={mail.otpModalOpen}
        onClose={() => mail.setOtpModalOpen(false)}
        otpService={mail.otpService}
        setOtpService={mail.setOtpService}
        otpResult={mail.otpResult}
        loadingOtp={mail.loadingOtp}
        otpCopied={mail.otpCopied}
        onFetchOtp={mail.handleFetchOtp}
        onCopyOtp={mail.handleCopyOtp}
      />
    </div>
  )
}
