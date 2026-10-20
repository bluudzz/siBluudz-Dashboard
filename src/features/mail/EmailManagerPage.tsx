import * as React from 'react'
import { motion } from 'framer-motion'
import {
  Mail,
  Plus,
  Download,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/context/UserContext'
import { useMailAccounts } from './hooks/useMailAccounts'
import { useAddAccount } from './hooks/useAddAccount'
import { AccountsList } from './components/AccountsList'
import { InboxPanel } from './components/InboxPanel'
import { AddAccountModal } from './components/AddAccountModal'
import { CredentialsModal } from './components/CredentialsModal'
import { OtpModal } from './components/OtpModal'

export function EmailManagerPage() {
  const { profile } = useUser()

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
    void mail.loadAccounts()
  }, [mail.loadAccounts])

  React.useEffect(() => {
    if (mail.selectedAccountId) void mail.loadInbox(mail.selectedAccountId)
  }, [mail.selectedAccountId, mail.loadInbox])

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
  }, [mail])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight text-foreground">
            <Mail className="h-6 w-6 text-blue-500" />
            Email Manager
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kelola akun email Outlook / Hotmail (OAuth2 Graph), Gmail (OAuth2 API), dan IMAP dengan penyimpanan kredensial aman.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {mail.selectedAccount && (mail.isOutlookGraph || mail.isGmailApi) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  mail.setOtpModalOpen(true)
                  void mail.handleFetchOtp()
                }}
                className="gap-1.5 border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-300"
              >
                <Sparkles className="h-4 w-4 text-blue-500" />
                Cek OTP
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void mail.handleTestRefreshToken(mail.selectedAccount!.id)}
                disabled={mail.refreshingToken}
                className="gap-1.5 border-border"
              >
                <ShieldCheck className={`h-4 w-4 ${mail.refreshingToken ? 'animate-spin text-primary' : 'text-emerald-500'}`} />
                Test Token
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={mail.handleExportAll}
            disabled={mail.exportingAll || mail.accounts.length === 0}
            className="gap-1.5 border-border hover:bg-muted"
            title="Download file .txt format pipa (email|password|refresh_token|client_id)"
          >
            <Download className={`h-4 w-4 ${mail.exportingAll ? 'animate-bounce text-primary' : 'text-muted-foreground'}`} />
            <span>Export Semua (.txt)</span>
          </Button>

          <Button
            size="sm"
            onClick={() => {
              addAccount.setAddAccountModalOpen(true)
              mail.setError('')
              mail.setNotice('')
            }}
            className="gap-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 font-medium"
          >
            <Plus className="h-4 w-4" />
            Tambah Akun
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {mail.error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">Perhatian:</span>
            <span>{mail.error}</span>
          </div>
          <button type="button" onClick={() => mail.setError('')} className="text-rose-400 hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}
      {mail.notice && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="status"
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{mail.notice}</span>
          </div>
          <button type="button" onClick={() => mail.setNotice('')} className="text-emerald-400 hover:text-emerald-200">
            <X className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-1">
          <AccountsList
            accounts={mail.accounts}
            selectedAccountId={mail.selectedAccountId}
            loadingAccounts={mail.loadingAccounts}
            onSelectAccount={mail.setSelectedAccountId}
            onSetLoadingInbox={mail.setLoadingInbox}
            onViewCredentials={mail.handleViewCredentials}
            onDeleteAccount={mail.handleDeleteAccount}
            onAddAccount={() => addAccount.setAddAccountModalOpen(true)}
          />
        </div>

        <InboxPanel
          selectedAccount={mail.selectedAccount}
          isOutlookGraph={mail.isOutlookGraph}
          messages={mail.messages}
          selectedMessage={mail.selectedMessage}
          loadingInbox={mail.loadingInbox}
          onRefreshInbox={() => {
            mail.setLoadingInbox(true)
            void mail.loadInbox(mail.selectedAccountId)
          }}
          onOpenMessage={mail.handleOpenMessage}
          onCloseMessage={() => mail.setSelectedMessage(null)}
        />
      </div>

      {/* Modals */}
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
