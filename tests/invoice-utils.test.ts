import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateInvoiceTotal, formatMoney, isQuotation, parseMoney } from '../src/features/invoices/invoice-utils.ts'

const base = { id: 'a', invoiceNumber: 'INV-1', docType: 'invoice', issueDate: '2026-01-01', items: [] }

test('calculateInvoiceTotal sums qty * price and applies tax unless no_tax', () => {
  const items = [
    { id: '1', name: 'Video', qty: 2, price: '1.500.000', tax: 10 },
    { id: '2', name: 'Foto', qty: '1', price: 400000, tax: 10 },
  ]
  assert.equal(calculateInvoiceTotal({ ...base, items }), 3_740_000)
  assert.equal(calculateInvoiceTotal({ ...base, taxMode: 'no_tax', items }), 3_400_000)
  assert.equal(calculateInvoiceTotal({ ...base, items: [] }), 0)
})

test('parseMoney understands grouped and decimal separators', () => {
  assert.equal(parseMoney('1.500.000'), 1_500_000)
  assert.equal(parseMoney('Rp 1.500.000,50'), 1_500_000.5)
  assert.equal(parseMoney(400000), 400_000)
  assert.equal(parseMoney(''), 0)
})

test('formatMoney falls back for unknown currency codes', () => {
  assert.match(formatMoney(1234567), /1\.234\.567/)
  assert.match(formatMoney(10, 'NOT_A_CODE'), /NOT_A_CODE 10/)
})

test('isQuotation is case-insensitive', () => {
  assert.equal(isQuotation({ ...base, docType: 'quotation' }), true)
  assert.equal(isQuotation({ ...base, docType: 'Quotation' }), true)
  assert.equal(isQuotation({ ...base, docType: 'invoice' }), false)
})
