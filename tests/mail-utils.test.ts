import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterMessages, formatListDate, providerLabel } from '../src/features/mail/utils.ts'

const messages = [
  { uid: 1, subject: 'Konfirmasi pembayaran', from: [{ name: 'Paragon', address: 'billing@paragon.test' }], date: null, unread: true, snippet: 'bukti transfer' },
  { uid: 2, subject: 'Revisi konsep', from: [{ name: 'Schema EO', address: 'rina@schema.test' }], date: null, unread: false },
]

test('filterMessages matches subject, sender name, address, and snippet', () => {
  assert.equal(filterMessages(messages, '').length, 2)
  assert.equal(filterMessages(messages, '   ').length, 2)
  assert.deepEqual(filterMessages(messages, 'paragon').map((m) => m.uid), [1])
  assert.deepEqual(filterMessages(messages, 'BUKTI').map((m) => m.uid), [1])
  assert.deepEqual(filterMessages(messages, 'rina@schema').map((m) => m.uid), [2])
  assert.equal(filterMessages(messages, 'tidak-ada').length, 0)
})

test('providerLabel normalises provider identifiers', () => {
  assert.equal(providerLabel('outlook_graph'), 'Graph OAuth')
  assert.equal(providerLabel('gmail_api'), 'Gmail API')
  assert.equal(providerLabel('imap'), 'IMAP')
  assert.equal(providerLabel(undefined), 'IMAP')
})

test('formatListDate degrades gracefully for missing or invalid dates', () => {
  assert.equal(formatListDate(null), '—')
  assert.equal(formatListDate('bukan tanggal'), '—')
  assert.match(formatListDate(new Date().toISOString()), /^\d{2}\.\d{2}$/)
  assert.match(formatListDate('2025-01-02T10:00:00Z'), /2025/)
})
