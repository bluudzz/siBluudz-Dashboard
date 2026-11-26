import type { InvoiceRecord } from '@/types/invoice'

// Accepts "1500000", "1.500.000", "1.500.000,50" and "1500,50".
export function parseMoney(value: number | string | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const raw = String(value ?? '').replace(/[^0-9.,-]/g, '')
  if (!raw) return 0
  const grouped = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)
  const normalized = grouped
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateInvoiceTotal(inv: InvoiceRecord) {
  let subtotal = 0
  let tax = 0
  const isNoTax = inv.taxMode === 'no_tax'
  inv.items?.forEach((item) => {
    const q = Number(item.qty) || 0
    const p = parseMoney(item.price)
    const t = Number(item.tax) || 0
    const row = q * p
    subtotal += row
    if (!isNoTax) tax += row * (t / 100)
  })
  return subtotal + (isNoTax ? 0 : tax)
}

export function formatMoney(amount: number, currency = 'IDR') {
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency || 'IDR',
      maximumFractionDigits: 0,
    }).format(amount)
  } catch {
    return `${currency || 'IDR'} ${Math.round(amount).toLocaleString('id-ID')}`
  }
}

export function isQuotation(inv: InvoiceRecord) {
  return inv.docType?.toLowerCase() === 'quotation'
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonicalize((value as Record<string, unknown>)[key])]),
    )
  }
  return value
}

export function invoiceListSignature(invoices: InvoiceRecord[]): string {
  const normalized = invoices.map((inv) => {
    const { updatedAt: _updatedAt, createdAt: _createdAt, ...rest } = inv as InvoiceRecord & { createdAt?: string }
    return canonicalize(rest)
  })
  return JSON.stringify(normalized)
}
