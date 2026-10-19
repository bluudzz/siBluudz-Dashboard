interface InvoiceItem {
  id: string
  name: string
  description?: string
  qty: number | string
  price: number | string
  tax?: number | string
}

export interface InvoiceRecord {
  id: string
  invoiceNumber: string
  docType: string
  docLang?: string
  subject?: string
  issueDate: string
  dueDate?: string
  from?: {
    company?: string
    name?: string
    address?: string
    email?: string
    phone?: string
  }
  to?: {
    company?: string
    name?: string
    address?: string
    email?: string
    phone?: string
  }
  items: InvoiceItem[]
  currency?: string
  taxMode?: string
  paymentNotes?: string
  customNotes?: string
  updatedAt?: string
  [key: string]: unknown
}
