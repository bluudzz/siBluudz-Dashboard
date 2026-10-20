import * as React from 'react'
import type { MailAccount, MailMessage, MailMessageDetail, AccountCredentials } from '../types'
import { apiRequest } from '../utils'

export function useMailAccounts() {
  const [accounts, setAccounts] = React.useState<MailAccount[]>([])
  const [selectedAccountId, setSelectedAccountId] = React.useState('')
  const [messages, setMessages] = React.useState<MailMessage[]>([])
  const [selectedMessage, setSelectedMessage] = React.useState<MailMessageDetail | null>(null)

  const [loadingAccounts, setLoadingAccounts] = React.useState(true)
  const [loadingInbox, setLoadingInbox] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')

  // Credentials modal state
  const [credentialsModalOpen, setCredentialsModalOpen] = React.useState(false)
  const [credentialsData, setCredentialsData] = React.useState<AccountCredentials | null>(null)
  const [loadingCredentials, setLoadingCredentials] = React.useState(false)
  const [copiedField, setCopiedField] = React.useState<string | null>(null)
  const [showCredPassword, setShowCredPassword] = React.useState(false)
  const [showCredToken, setShowCredToken] = React.useState(false)
  const [exportingAll, setExportingAll] = React.useState(false)
  const [refreshingToken, setRefreshingToken] = React.useState(false)

  // OTP state
  const [otpModalOpen, setOtpModalOpen] = React.useState(false)
  const [otpService, setOtpService] = React.useState('')
  const [otpResult, setOtpResult] = React.useState<string | null>(null)
  const [loadingOtp, setLoadingOtp] = React.useState(false)
  const [otpCopied, setOtpCopied] = React.useState(false)

  const loadAccounts = React.useCallback(async () => {
    try {
      const result = await apiRequest<{ accounts: MailAccount[] }>('/api/mail/accounts')
      setError('')
      setAccounts(result.accounts)
      setLoadingInbox(result.accounts.length > 0)
      setSelectedAccountId((current) =>
        result.accounts.some((account) => account.id === current)
          ? current
          : result.accounts[0]?.id || ''
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Gagal memuat akun email.')
    } finally {
      setLoadingAccounts(false)
    }
  }, [])

  React.useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const loadInbox = React.useCallback(async (accountId: string) => {
    if (!accountId) return
    try {
      const result = await apiRequest<{ messages: MailMessage[] }>(
        `/api/mail/accounts/${encodeURIComponent(accountId)}/messages`
      )
      setError('')
      setSelectedMessage(null)
      setMessages(result.messages)
    } catch (inboxError) {
      setError(inboxError instanceof Error ? inboxError.message : 'Gagal mengambil inbox.')
      setMessages([])
    } finally {
      setLoadingInbox(false)
    }
  }, [])

  React.useEffect(() => {
    void loadInbox(selectedAccountId)
  }, [loadInbox, selectedAccountId])

  const handleDeleteAccount = async (account: MailAccount) => {
    if (!window.confirm(`Hapus akun ${account.email} dari dashboard?`)) return
    setError('')
    setNotice('')
    try {
      await apiRequest<void>(`/api/mail/accounts/${encodeURIComponent(account.id)}`, { method: 'DELETE' })
      const remaining = accounts.filter((item) => item.id !== account.id)
      setAccounts(remaining)
      if (selectedAccountId === account.id) {
        setMessages([])
        setSelectedMessage(null)
        setLoadingInbox(Boolean(remaining.length))
        setSelectedAccountId(remaining[0]?.id || '')
      }
      setNotice('Akun email dan kredensial terenkripsinya telah dihapus.')
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Akun email gagal dihapus.')
    }
  }

  const handleViewCredentials = async (account: MailAccount) => {
    setError('')
    setNotice('')
    setCredentialsData(null)
    setCredentialsModalOpen(true)
    setLoadingCredentials(true)
    setShowCredPassword(false)
    setShowCredToken(false)

    try {
      if (account.provider === 'outlook_graph') {
        const data = await apiRequest<AccountCredentials>(
          `/api/outlook/accounts/${encodeURIComponent(account.id)}/credentials`
        )
        setCredentialsData(data)
      } else if (account.provider === 'gmail_api') {
        const data = await apiRequest<AccountCredentials>(
          `/api/gmail/accounts/${encodeURIComponent(account.id)}/credentials`
        )
        setCredentialsData(data)
      } else {
        setCredentialsData({
          id: account.id,
          email: account.email,
          password: '(Terenkripsi di server IMAP)',
          client_id: account.host,
          pipe_line: `${account.email}|***|IMAP|${account.host}`,
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengambil detail kredensial akun.')
    } finally {
      setLoadingCredentials(false)
    }
  }

  const handleCopyField = async (text: string, fieldName: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(fieldName)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleExportAll = async () => {
    setExportingAll(true)
    setError('')
    setNotice('')
    try {
      const isGmail = selectedAccount?.provider === 'gmail_api'
      const endpoint = isGmail ? '/api/gmail/accounts-export' : '/api/outlook/accounts-export'
      const providerLabel = isGmail ? 'Gmail' : 'Outlook'
      const filename = isGmail ? 'gmail_accounts_export' : 'outlook_accounts_export'

      const result = await apiRequest<{ count: number; accounts: AccountCredentials[]; raw_pipe_text: string }>(
        endpoint
      )
      if (!result.raw_pipe_text) {
        setNotice(`Belum ada akun ${providerLabel} terdaftar untuk diekspor.`)
        return
      }

      await navigator.clipboard.writeText(result.raw_pipe_text)

      const blob = new Blob([result.raw_pipe_text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}_${new Date().toISOString().slice(0, 10)}.txt`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      setNotice(`Berhasil mengekspor ${result.count} akun ${providerLabel}! File .txt terunduh dan teks pipa tersalin ke clipboard.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor data akun.')
    } finally {
      setExportingAll(false)
    }
  }

  const handleOpenMessage = async (uid: number | string) => {
    if (!selectedAccountId) return
    setError('')
    setSelectedMessage(null)
    try {
      const result = await apiRequest<{ message: MailMessageDetail }>(
        `/api/mail/accounts/${encodeURIComponent(selectedAccountId)}/messages/${encodeURIComponent(uid)}`
      )
      setSelectedMessage(result.message)
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : 'Email gagal dibuka.')
    }
  }

  const handleFetchOtp = async (serviceFilter?: string) => {
    if (!selectedAccountId) return
    setLoadingOtp(true)
    setError('')
    try {
      const query = new URLSearchParams()
      const targetService = (serviceFilter !== undefined ? serviceFilter : otpService).trim()
      if (targetService) query.set('service', targetService)
      query.set('limit', '10')

      const isGmail = selectedAccount?.provider === 'gmail_api'
      const endpoint = isGmail
        ? `/api/gmail/accounts/${encodeURIComponent(selectedAccountId)}/otp?${query}`
        : `/api/outlook/accounts/${encodeURIComponent(selectedAccountId)}/otp?${query}`

      const result = await apiRequest<{ code: string | null }>(endpoint)
      setOtpResult(result.code)
      if (!result.code) {
        setNotice('Tidak ditemukan kode OTP pada email terbaru akun ini.')
      } else {
        setNotice(`Kode OTP ditemukan: ${result.code}`)
      }
    } catch (otpErr) {
      setError(otpErr instanceof Error ? otpErr.message : 'Gagal memindai OTP dari email.')
    } finally {
      setLoadingOtp(false)
    }
  }

  const handleCopyOtp = async () => {
    if (!otpResult) return
    await navigator.clipboard.writeText(otpResult)
    setOtpCopied(true)
    setTimeout(() => setOtpCopied(false), 2000)
  }

  const handleTestRefreshToken = async (accountId: string) => {
    setRefreshingToken(true)
    setError('')
    setNotice('')
    try {
      const isGmail = selectedAccount?.provider === 'gmail_api'
      const endpoint = isGmail
        ? `/api/gmail/accounts/${encodeURIComponent(accountId)}/refresh`
        : `/api/outlook/accounts/${encodeURIComponent(accountId)}/refresh`
      const providerLabel = isGmail ? 'Google' : 'Microsoft'

      const result = await apiRequest<{ access_token: string }>(
        endpoint,
        { method: 'POST' }
      )
      setNotice(`Token valid! Berhasil me-refresh access token ${providerLabel}: ${result.access_token.slice(0, 16)}...`)
    } catch (refreshErr) {
      setError(refreshErr instanceof Error ? refreshErr.message : 'Gagal me-refresh token akun.')
    } finally {
      setRefreshingToken(false)
    }
  }

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId)
  const isOutlookGraph = selectedAccount?.provider === 'outlook_graph'
  const isGmailApi = selectedAccount?.provider === 'gmail_api'

  return {
    accounts, setAccounts,
    selectedAccountId, setSelectedAccountId,
    messages, setMessages,
    selectedMessage, setSelectedMessage,
    selectedAccount, isOutlookGraph, isGmailApi,
    loadingAccounts, loadingInbox, setLoadingInbox,
    error, setError,
    notice, setNotice,
    // Credentials
    credentialsModalOpen, setCredentialsModalOpen,
    credentialsData, loadingCredentials,
    copiedField, showCredPassword, setShowCredPassword,
    showCredToken, setShowCredToken,
    exportingAll, refreshingToken,
    // OTP
    otpModalOpen, setOtpModalOpen,
    otpService, setOtpService,
    otpResult, loadingOtp, otpCopied,
    // Actions
    loadAccounts, loadInbox,
    handleDeleteAccount,
    handleViewCredentials,
    handleCopyField,
    handleExportAll,
    handleOpenMessage,
    handleFetchOtp,
    handleCopyOtp,
    handleTestRefreshToken,
  }
}
