import * as React from 'react'
import { ArrowLeft, ExternalLink, Printer, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { InvoiceRecord } from '@/types/invoice'
import { calculateInvoiceTotal, formatMoney, isQuotation, parseMoney } from './invoice-utils'

export type InvoiceFilter = 'all' | 'invoice' | 'quotation'

interface InvoicesListPageProps {
  invoices: InvoiceRecord[]
  searchQuery: string
  filterType: InvoiceFilter
  selectedId: string | null
  onSelect: (invoiceId: string | null) => void
  onOpenInvoiceEditor?: (invoiceId?: string) => void
}

export function InvoicesListPage({
  invoices,
  searchQuery,
  filterType,
  selectedId,
  onSelect,
  onOpenInvoiceEditor,
}: InvoicesListPageProps) {
  const filteredInvoices = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return invoices.filter((inv) => {
      if (filterType === 'invoice' && isQuotation(inv)) return false
      if (filterType === 'quotation' && !isQuotation(inv)) return false
      if (!q) return true
      return Boolean(
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.to?.company?.toLowerCase().includes(q) ||
        inv.to?.name?.toLowerCase().includes(q) ||
        inv.subject?.toLowerCase().includes(q) ||
        inv.from?.company?.toLowerCase().includes(q)
      )
    })
  }, [invoices, filterType, searchQuery])

  const selectedInvoice = filteredInvoices.find((inv) => inv.id === selectedId) || null

  return (
    <div className={`iv-split${selectedInvoice ? ' has-detail' : ''}`}>
      <section className="iv-list" aria-label="Daftar dokumen">
        <div className="iv-sheet-heading">
          <h2>Daftar dokumen</h2>
          <span>{filteredInvoices.length} dari {invoices.length}</span>
        </div>

        {filteredInvoices.length === 0 ? (
          <p className="iv-empty">
            {invoices.length === 0
              ? 'Belum ada dokumen. Buat invoice atau quotation baru dari Invoice Builder.'
              : 'Tidak ada dokumen yang cocok dengan pencarian atau filter.'}
          </p>
        ) : (
          <div className="iv-rows">
            {filteredInvoices.map((inv) => {
              const quotation = isQuotation(inv)
              return (
                <button
                  key={inv.id}
                  type="button"
                  data-invoice-id={inv.id}
                  className={`iv-row${inv.id === selectedId ? ' is-selected' : ''}`}
                  aria-current={inv.id === selectedId ? 'true' : undefined}
                  onClick={() => onSelect(inv.id === selectedId ? null : inv.id)}
                >
                  <span className="iv-row-top">
                    <span className="iv-row-number">{inv.invoiceNumber || 'Draft'}</span>
                    <span className={`iv-tag${quotation ? ' is-quotation' : ''}`}>
                      {quotation ? 'Quotation' : 'Invoice'}
                    </span>
                    <span className="iv-row-total">{formatMoney(calculateInvoiceTotal(inv), inv.currency)}</span>
                  </span>
                  <span className="iv-row-bottom">
                    <span className="iv-row-client">{[inv.to?.company, inv.to?.name].filter(Boolean).join(' | ') || 'Tanpa klien'}</span>
                    <span className="iv-row-date">{inv.issueDate || '—'}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="iv-detail" aria-label="Detail dokumen">
        {!selectedInvoice ? (
          <div className="iv-detail-empty">
            <h4>Pilih dokumen untuk melihat rinciannya.</h4>
            <p>Detail klien, item layanan, dan nominal muncul di sini tanpa meninggalkan daftar.</p>
            <dl>
              <div><dt>Ringkas</dt><dd>Satu klik pada baris dokumen membuka pratinjau di panel ini.</dd></div>
              <div><dt>Edit</dt><dd>Buka di Builder meneruskan dokumen yang sama ke editor invoice.</dd></div>
              <div><dt>Cetak</dt><dd>Hanya panel detail yang masuk ke hasil cetak.</dd></div>
            </dl>
          </div>
        ) : (
          <>
            <div className="iv-detail-head">
              <div>
                <h3>
                  {selectedInvoice.invoiceNumber || 'Draft'}
                  <span className={`iv-tag${isQuotation(selectedInvoice) ? ' is-quotation' : ''}`}>
                    {isQuotation(selectedInvoice) ? 'Quotation' : 'Invoice'}
                  </span>
                </h3>
                <p>
                  Terbit {selectedInvoice.issueDate || '—'}
                  {selectedInvoice.dueDate ? ` · Jatuh tempo ${selectedInvoice.dueDate}` : ''}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="Tutup detail" onClick={() => onSelect(null)}>
                <X size={16} />
              </Button>
            </div>

            <div className="iv-detail-body">
              <div className="iv-parties">
                <div>
                  <p className="iv-label">Pengirim</p>
                  <p className="iv-strong">{selectedInvoice.from?.company || 'Bluudz Creative'}</p>
                  <p className="iv-muted">{selectedInvoice.from?.name}</p>
                  <p className="iv-muted">{[selectedInvoice.from?.phone, selectedInvoice.from?.email].filter(Boolean).join(' · ')}</p>
                  <p className="iv-muted">{selectedInvoice.from?.address}</p>
                </div>
                <div>
                  <p className="iv-label">Penerima</p>
                  <p className="iv-strong">{selectedInvoice.to?.company || selectedInvoice.to?.name || 'Tanpa klien'}</p>
                  <p className="iv-muted">{selectedInvoice.to?.name}</p>
                  <p className="iv-muted">{[selectedInvoice.to?.phone, selectedInvoice.to?.email].filter(Boolean).join(' · ')}</p>
                  <p className="iv-muted">{selectedInvoice.to?.address}</p>
                </div>
              </div>

              {selectedInvoice.subject && (
                <div>
                  <p className="iv-label">Perihal</p>
                  <p className="iv-strong">{selectedInvoice.subject}</p>
                </div>
              )}

              <div>
                <p className="iv-label">Rincian item</p>
                <div className="iv-items">
                  <table>
                    <thead>
                      <tr>
                        <th>Layanan</th>
                        <th className="is-center">Qty</th>
                        <th className="is-right">Harga</th>
                        <th className="is-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedInvoice.items?.map((it, idx) => {
                        const q = Number(it.qty) || 0
                        const p = parseMoney(it.price)
                        return (
                          <tr key={it.id || idx}>
                            <td>
                              <span className="iv-strong">{it.name}</span>
                              {it.description && <span className="iv-item-desc">{it.description}</span>}
                            </td>
                            <td className="is-center">{q}</td>
                            <td className="is-right">{formatMoney(p, selectedInvoice.currency)}</td>
                            <td className="is-right iv-strong">{formatMoney(q * p, selectedInvoice.currency)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="iv-total">
                <span>Total nominal</span>
                <strong>{formatMoney(calculateInvoiceTotal(selectedInvoice), selectedInvoice.currency)}</strong>
              </div>

              {selectedInvoice.paymentNotes && (
                <div>
                  <p className="iv-label">Catatan &amp; pembayaran</p>
                  <div className="iv-notes" dangerouslySetInnerHTML={{ __html: selectedInvoice.paymentNotes }} />
                </div>
              )}
            </div>

            <div className="iv-detail-foot">
              <Button variant="ghost" size="sm" className="iv-back" onClick={() => onSelect(null)}>
                <ArrowLeft size={15} />
                Kembali
              </Button>
              <span className="iv-foot-spacer" />
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer size={15} />
                Cetak
              </Button>
              {onOpenInvoiceEditor && (
                <Button size="sm" onClick={() => onOpenInvoiceEditor(selectedInvoice.id)}>
                  <ExternalLink size={15} />
                  Buka di Builder
                </Button>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
