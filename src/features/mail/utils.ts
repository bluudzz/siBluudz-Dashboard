import type { ApiError, EmailProvider, MailMessage, ProviderConfig } from './types'

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const result = await response.json().catch((): ApiError => ({}))
    throw new Error(result.error || `Permintaan gagal (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function formatDate(value: string | null) {
  if (!value) return 'Tanggal tidak tersedia'
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

// Compact list label: today HH:mm, this year d MMM, otherwise d MMM yyyy.
export function formatListDate(value: string | null) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(date)
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  }).format(date)
}

export const PROVIDER_CONFIGS: Record<EmailProvider, ProviderConfig> = {
  outlook: {
    id: 'outlook',
    name: 'Outlook / Microsoft 365',
    shortName: 'Outlook / Hotmail',
    host: 'graph.microsoft.com',
    hint: 'Login otomatis via OAuth2 Microsoft Graph API dengan Device Code atau Format Pipa.',
    helpUrl: 'https://learn.microsoft.com/en-us/graph/overview',
    helpLabel: 'Dokumentasi Microsoft Graph API',
  },
  gmail: {
    id: 'gmail',
    name: 'Gmail / Google',
    shortName: 'Gmail',
    host: 'imap.gmail.com',
    hint: 'Gunakan Sandi Aplikasi (App Password 16 karakter) dari akun Google Anda.',
    helpUrl: 'https://myaccount.google.com/apppasswords',
    helpLabel: 'Buka Panduan Sandi Aplikasi Google',
  },
  yahoo: {
    id: 'yahoo',
    name: 'Yahoo Mail',
    shortName: 'Yahoo',
    host: 'imap.mail.yahoo.com',
    hint: 'Gunakan App Password dari menu Keamanan Akun Yahoo.',
    helpUrl: 'https://login.yahoo.com/account/security',
    helpLabel: 'Buat App Password Yahoo',
  },
  icloud: {
    id: 'icloud',
    name: 'iCloud Mail',
    shortName: 'iCloud',
    host: 'imap.mail.me.com',
    hint: 'Gunakan Kata Sandi Khusus App dari akun Apple ID Anda.',
    helpUrl: 'https://appleid.apple.com/account/manage',
    helpLabel: 'Keamanan Apple ID',
  },
  custom: {
    id: 'custom',
    name: 'Kustom / Domain Sendiri',
    shortName: 'Domain Kustom',
    host: '',
    hint: 'Masukkan alamat Host IMAP dan port 993 dari hosting / penyedia email Anda.',
  },
}

export function providerLabel(provider?: string) {
  if (provider === 'outlook_graph') return 'Graph OAuth'
  if (provider === 'gmail_api') return 'Gmail API'
  return 'IMAP'
}

export function filterMessages(messages: MailMessage[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return messages
  return messages.filter((message) => {
    const senders = (message.from || []).map((person) => `${person.name} ${person.address}`).join(' ')
    return `${message.subject} ${senders} ${message.snippet ?? ''}`.toLowerCase().includes(q)
  })
}

export function detectProviderFromEmail(email: string): EmailProvider {
  const domain = (email.split('@')[1] || '').trim().toLowerCase()
  if (!domain) return 'outlook'
  if (domain.includes('outlook.') || domain.includes('hotmail.') || domain.includes('live.') || domain.includes('office365.') || domain.includes('msn.')) return 'outlook'
  if (domain.includes('gmail.com') || domain.includes('googlemail.com')) return 'gmail'
  if (domain.includes('yahoo.') || domain.includes('ymail.')) return 'yahoo'
  if (domain.includes('icloud.') || domain.includes('me.com') || domain.includes('mac.com')) return 'icloud'
  return 'custom'
}
