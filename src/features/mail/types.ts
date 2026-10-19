export interface MailAccount {
  id: string
  label: string
  email: string
  host: string
  port: number
  username: string
  auth_type?: 'password' | 'oauth2'
  provider?: string
  created_at?: string
  status?: 'valid' | 'invalid'
  invalid_reason?: string | null
}

export interface MailMessage {
  uid: number | string
  subject: string
  from: { name: string; address: string }[]
  date: string | null
  unread: boolean
  snippet?: string
}

export interface MailMessageDetail {
  subject: string
  from: string
  date: string | null
  text: string
}

export interface AccountCredentials {
  id: string
  email: string
  password?: string
  refresh_token?: string
  client_id?: string
  pipe_line?: string
}

export interface ApiError {
  error?: string
}

export type EmailProvider = 'gmail' | 'outlook' | 'yahoo' | 'icloud' | 'custom'

export interface ProviderConfig {
  id: EmailProvider
  name: string
  shortName: string
  host: string
  hint: string
  helpUrl?: string
  helpLabel?: string
}
