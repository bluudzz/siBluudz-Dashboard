import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { InvoiceRecord } from '@/types/invoice'

export interface UserProfile {
  id: string
  name: string
  username?: string
  company: string
  email: string
  phone: string
  address: string
  role: 'admin' | 'user'
  tier?: 'free' | 'pro'
  aiDailyLimit?: number
  aiUsageToday?: number
  hasPassword?: boolean
}

interface UserContextType {
  profile: UserProfile
  invoices: InvoiceRecord[]
  isAuthenticated: boolean
  authLoading: boolean
  dataLoading: boolean
  dataError: string
  refreshAccount: () => Promise<void>
  updateProfile: (updated: Partial<UserProfile>) => Promise<void>
  saveInvoices: (updated: InvoiceRecord[]) => Promise<void>
  signOut: () => Promise<void>
}

const EMPTY_PROFILE: UserProfile = {
  id: '',
  name: '',
  company: '',
  email: '',
  phone: '',
  address: '',
  role: 'user',
  tier: 'free',
  aiDailyLimit: 5,
  aiUsageToday: 0,
}
const ACCOUNT_STORAGE_KEY = 'invoice_active_account_id'
const ACCOUNT_SCOPED_LOCAL_KEYS = [
  'invoice_saved_invoices_list',
  'invoice_current_draft',
  'invoice_active_invoice_id',
  'invoice_sender_profile',
  'invoice_app_has_initialized',
]

interface AccountResponse {
  authenticated: boolean
  user?: UserProfile
  invoices?: InvoiceRecord[]
}

const UserContext = createContext<UserContextType | undefined>(undefined)

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    if (response.status === 502) {
      throw new Error(result.error || 'Server backend belum berjalan (502 Bad Gateway). Pastikan server API aktif (port 3001).')
    }
    throw new Error(result.error || `Permintaan gagal (${response.status}).`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [dataError, setDataError] = useState('')
  const invoiceSaveQueue = useRef<Promise<void>>(Promise.resolve())

  const refreshAccount = async () => {
    setDataLoading(true)
    setDataError('')
    try {
      const account = await apiRequest<AccountResponse>('/api/auth/status')
      if (!account.authenticated || !account.user) {
        setProfile(EMPTY_PROFILE)
        setInvoices([])
        setIsAuthenticated(false)
        return
      }
      const accountInvoices = account.invoices ?? []
      const previousAccountId = localStorage.getItem(ACCOUNT_STORAGE_KEY)
      if (previousAccountId !== account.user.id) {
        ACCOUNT_SCOPED_LOCAL_KEYS.forEach((key) => localStorage.removeItem(key))
      }
      setProfile(account.user)
      setInvoices(accountInvoices)
      setIsAuthenticated(true)
      localStorage.setItem('invoice_saved_invoices_list', JSON.stringify(accountInvoices))
      localStorage.setItem(ACCOUNT_STORAGE_KEY, account.user.id)
    } catch (error) {
      setDataError(error instanceof Error ? error.message : 'Tidak dapat memuat data akun.')
      throw error
    } finally {
      setDataLoading(false)
      setAuthLoading(false)
    }
  }

  useEffect(() => {
    refreshAccount().catch((error: unknown) => {
      console.error('Failed to load account session:', error)
    })
  }, [])

  const updateProfile = async (updated: Partial<UserProfile>) => {
    const result = await apiRequest<{ user: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(updated),
    })
    setProfile(result.user)
  }

  const saveInvoices = (updated: InvoiceRecord[]) => {
    const persist = async () => {
      await apiRequest('/api/invoices', {
        method: 'PUT',
        body: JSON.stringify({ invoices: updated }),
      })
      setInvoices(updated)
      localStorage.setItem('invoice_saved_invoices_list', JSON.stringify(updated))
      setDataError('')
    }

    const operation = invoiceSaveQueue.current.then(persist)
    invoiceSaveQueue.current = operation.catch(() => undefined)
    return operation.catch((error: unknown) => {
      console.error('Failed to save invoices on local API:', error)
      setDataError(error instanceof Error ? error.message : 'Invoice gagal disimpan ke server lokal.')
      throw error
    })
  }

  const signOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' })
    setProfile(EMPTY_PROFILE)
    setInvoices([])
    setIsAuthenticated(false)
    localStorage.removeItem('invoice_saved_invoices_list')
    localStorage.removeItem('invoice_current_draft')
    localStorage.removeItem('invoice_active_invoice_id')
    localStorage.removeItem('invoice_sender_profile')
    localStorage.removeItem('invoice_app_has_initialized')
    localStorage.removeItem(ACCOUNT_STORAGE_KEY)
  }

  return (
    <UserContext.Provider
      value={{
        profile,
        invoices,
        isAuthenticated,
        authLoading,
        dataLoading,
        dataError,
        refreshAccount,
        updateProfile,
        saveInvoices,
        signOut,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const context = useContext(UserContext)
  if (!context) {
    throw new Error('useUser must be used within a UserProvider')
  }
  return context
}
