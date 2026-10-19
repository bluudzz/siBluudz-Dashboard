import * as React from 'react'
import type { EmailProvider } from '../types'
import { apiRequest, PROVIDER_CONFIGS, detectProviderFromEmail } from '../utils'

export function useAddAccount(deps: {
  loadAccounts: () => Promise<void>
  loadInbox: (id: string) => Promise<void>
  setSelectedAccountId: (id: string) => void
  setNotice: (msg: string) => void
  setError: (msg: string) => void
  setAccounts: React.Dispatch<React.SetStateAction<import('../types').MailAccount[]>>
  setLoadingInbox: (v: boolean) => void
}) {
  const { loadAccounts, loadInbox, setSelectedAccountId, setNotice, setError, setAccounts, setLoadingInbox } = deps

  const [addAccountModalOpen, setAddAccountModalOpen] = React.useState(false)
  const [provider, setProvider] = React.useState<EmailProvider>('outlook')
  const [showAdvanced, setShowAdvanced] = React.useState(false)
  const [showPassword, setShowPassword] = React.useState(false)
  const [outlookSubMethod, setOutlookSubMethod] = React.useState<'device' | 'manual' | 'batch'>('device')
  const [saving, setSaving] = React.useState(false)

  const [imapForm, setImapForm] = React.useState({
    email: '',
    host: PROVIDER_CONFIGS.gmail.host,
    username: '',
    password: '',
  })

  const [outlookForm, setOutlookForm] = React.useState({
    email: '',
    password: '',
    refreshToken: '',
    clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46',
  })
  const [outlookBatchText, setOutlookBatchText] = React.useState('')
  const [showOutlookPassword, setShowOutlookPassword] = React.useState(false)
  const [showOutlookToken, setShowOutlookToken] = React.useState(false)

  // Device Auth State
  const [deviceData, setDeviceData] = React.useState<{
    user_code: string
    device_code: string
    verification_uri: string
    client_id: string
  } | null>(null)
  const [loadingDeviceCode, setLoadingDeviceCode] = React.useState(false)
  const [pollingDevice, setPollingDevice] = React.useState(false)
  const [deviceCodeCopied, setDeviceCodeCopied] = React.useState(false)
  const pollTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const popupWindowRef = React.useRef<Window | null>(null)

  React.useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
      if (popupWindowRef.current && !popupWindowRef.current.closed) {
        try { popupWindowRef.current.close() } catch {}
      }
    }
  }, [])

  const batchCount = React.useMemo(() => {
    if (!outlookBatchText.trim()) return 0
    return outlookBatchText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.split('|').length >= 4).length
  }, [outlookBatchText])

  const handleEmailInput = (val: string) => {
    const detected = detectProviderFromEmail(val)
    setProvider(detected)
    setImapForm((prev) => ({
      ...prev,
      email: val,
      username: (!prev.username || prev.username === prev.email) ? val : prev.username,
      host: detected !== 'custom' ? PROVIDER_CONFIGS[detected].host : prev.host,
    }))
    setOutlookForm((prev) => ({
      ...prev,
      email: val,
    }))
  }

  const handleSelectProvider = (newProvider: EmailProvider) => {
    setProvider(newProvider)
    setImapForm((prev) => ({
      ...prev,
      host: PROVIDER_CONFIGS[newProvider].host || prev.host,
    }))
    if (newProvider === 'custom') {
      setShowAdvanced(true)
    }
  }

  const handleAutoFillFromPipe = (rawText: string) => {
    const trimmed = rawText.trim()
    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map((p) => p.trim())
      if (parts.length >= 3) {
        setOutlookForm({
          email: parts[0] || '',
          password: parts[1] || '',
          refreshToken: parts[2] || '',
          clientId: parts[3] || '04b07795-8ddb-461a-bbee-02f9e1bf7b46',
        })
        setNotice('Format data pipa berhasil diisikan ke formulir!')
        return true
      }
    }
    return false
  }

  const handleAddAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    if (provider === 'outlook') {
      try {
        if (outlookSubMethod === 'manual') {
          if (!outlookForm.email || !outlookForm.refreshToken || !outlookForm.clientId) {
            throw new Error('Email, Refresh Token, dan Client ID wajib diisi.')
          }
          const result = await apiRequest<{ imported: number; accounts: Array<{ id: string; email: string }> }>(
            '/api/outlook/accounts/import',
            {
              method: 'POST',
              body: JSON.stringify({
                email: outlookForm.email.trim(),
                password: outlookForm.password.trim(),
                refreshToken: outlookForm.refreshToken.trim(),
                clientId: outlookForm.clientId.trim(),
              }),
            }
          )
          setNotice(`Akun Outlook ${outlookForm.email} berhasil disimpan & dihubungkan!`)
          setOutlookForm({ email: '', password: '', refreshToken: '', clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46' })
          setAddAccountModalOpen(false)
          await loadAccounts()
          if (result.accounts?.[0]?.id) {
            setSelectedAccountId(result.accounts[0].id)
            void loadInbox(result.accounts[0].id)
          }
        } else if (outlookSubMethod === 'batch') {
          if (!outlookBatchText.trim()) {
            throw new Error('Masukkan data akun dalam format pipa (email|password|refresh_token|client_id).')
          }
          const result = await apiRequest<{ imported: number; accounts: Array<{ id: string; email: string }> }>(
            '/api/outlook/accounts/import',
            {
              method: 'POST',
              body: JSON.stringify({ accounts: outlookBatchText.trim() }),
            }
          )
          setNotice(`Berhasil mengimpor ${result.imported} akun Outlook!`)
          setOutlookBatchText('')
          setAddAccountModalOpen(false)
          await loadAccounts()
          if (result.accounts?.[0]?.id) {
            setSelectedAccountId(result.accounts[0].id)
            void loadInbox(result.accounts[0].id)
          }
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Gagal menyimpan akun Outlook.')
      } finally {
        setSaving(false)
      }
      return
    }

    // Standard IMAP flow
    const hostToUse = (imapForm.host || PROVIDER_CONFIGS[provider].host).trim()
    const usernameToUse = (imapForm.username || imapForm.email).trim()

    if (!hostToUse) {
      setError('Host IMAP wajib diisi untuk penyedia email ini.')
      setSaving(false)
      return
    }

    try {
      const result = await apiRequest<{ account: import('../types').MailAccount }>('/api/mail/accounts', {
        method: 'POST',
        body: JSON.stringify({
          label: imapForm.email.trim(),
          email: imapForm.email.trim(),
          host: hostToUse,
          username: usernameToUse,
          password: imapForm.password,
          port: 993,
        }),
      })
      setAccounts((current) => [result.account, ...current])
      setLoadingInbox(true)
      setSelectedAccountId(result.account.id)
      setImapForm({ email: '', host: PROVIDER_CONFIGS[provider].host, username: '', password: '' })
      setAddAccountModalOpen(false)
      setNotice(`Akun ${result.account.email} berhasil terhubung! Membaca inbox...`)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Akun email gagal ditambahkan.')
    } finally {
      setSaving(false)
    }
  }

  // Device Auth
  const startPollingDeviceToken = (deviceCode: string, clientId: string) => {
    const checkOnce = async () => {
      try {
        const result = await apiRequest<{
          pending: boolean
          refresh_token?: string
          client_id?: string
          pipe_line?: string
          account_id?: string
        }>('/api/outlook/device/poll', {
          method: 'POST',
          body: JSON.stringify({
            device_code: deviceCode,
            client_id: clientId,
            email: outlookForm.email,
            password: outlookForm.password,
            auto_save: true,
          }),
        })

        if (result.pending) {
          pollTimerRef.current = setTimeout(checkOnce, 3000)
        } else if (result.refresh_token) {
          setPollingDevice(false)
          if (popupWindowRef.current && !popupWindowRef.current.closed) {
            try { popupWindowRef.current.close() } catch {}
          }
          setNotice(`Berhasil login & menyimpan akun Outlook ${outlookForm.email || 'Microsoft'}!`)
          setDeviceData(null)
          setAddAccountModalOpen(false)
          await loadAccounts()
          if (result.account_id) {
            setSelectedAccountId(result.account_id)
            void loadInbox(result.account_id)
          }
        }
      } catch (pollErr) {
        setPollingDevice(false)
        setError(pollErr instanceof Error ? pollErr.message : 'Polling otorisasi Microsoft terhenti.')
      }
    }

    pollTimerRef.current = setTimeout(checkOnce, 3000)
  }

  const handleStartDeviceAuth = async () => {
    setLoadingDeviceCode(true)
    setError('')
    try {
      const result = await apiRequest<{
        user_code: string
        device_code: string
        verification_uri: string
        client_id: string
      }>('/api/outlook/device/code', {
        method: 'POST',
        body: JSON.stringify({}),
      })
      setDeviceData(result)
      setPollingDevice(true)
      startPollingDeviceToken(result.device_code, result.client_id)
    } catch (devErr) {
      setError(devErr instanceof Error ? devErr.message : 'Gagal meminta kode autentikasi Microsoft.')
    } finally {
      setLoadingDeviceCode(false)
    }
  }

  const handleOpenPopup = async () => {
    if (!deviceData) return
    await navigator.clipboard.writeText(deviceData.user_code)
    setDeviceCodeCopied(true)
    setTimeout(() => setDeviceCodeCopied(false), 2500)

    const width = 520
    const height = 680
    const left = Math.max(0, window.screenX + (window.outerWidth - width) / 2)
    const top = Math.max(0, window.screenY + (window.outerHeight - height) / 2)

    const popup = window.open(
      deviceData.verification_uri,
      'ms_device_login_popup',
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no,scrollbars=yes`
    )
    popupWindowRef.current = popup
  }

  const handleCancelDeviceAuth = () => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current)
    if (popupWindowRef.current && !popupWindowRef.current.closed) {
      try { popupWindowRef.current.close() } catch {}
    }
    setPollingDevice(false)
    setDeviceData(null)
  }

  return {
    addAccountModalOpen, setAddAccountModalOpen,
    provider, showAdvanced, setShowAdvanced,
    showPassword, setShowPassword,
    outlookSubMethod, setOutlookSubMethod,
    saving,
    imapForm, setImapForm,
    outlookForm, setOutlookForm,
    outlookBatchText, setOutlookBatchText,
    showOutlookPassword, setShowOutlookPassword,
    showOutlookToken, setShowOutlookToken,
    deviceData, loadingDeviceCode, pollingDevice, deviceCodeCopied, setDeviceCodeCopied,
    batchCount,
    handleEmailInput,
    handleSelectProvider,
    handleAutoFillFromPipe,
    handleAddAccount,
    handleStartDeviceAuth,
    handleOpenPopup,
    handleCancelDeviceAuth,
  }
}
