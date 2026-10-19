import * as React from 'react'
import {
  FileText,
  Search,
  ExternalLink,
  PlusCircle,
  Eye,
  CheckCircle2,
  Clock,
  TrendingUp,
  Receipt,
  Printer
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import type { InvoiceRecord } from '@/types/invoice'
import { useUser } from '@/context/UserContext'

interface InvoicesListPageProps {
  onOpenInvoiceEditor?: (invoiceId?: string) => void
}

export function InvoicesListPage({ onOpenInvoiceEditor }: InvoicesListPageProps) {
  const { invoices } = useUser()
  const [searchQuery, setSearchQuery] = React.useState('')
  const [filterType, setFilterType] = React.useState<'all' | 'invoice' | 'quotation'>('all')
  const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRecord | null>(null)

  const calculateTotal = (inv: InvoiceRecord) => {
    let subtotal = 0
    let tax = 0
    const isNoTax = inv.taxMode === 'no_tax'
    inv.items?.forEach((item) => {
      const q = Number(item.qty) || 0
      const p = Number(String(item.price || 0).replace(/[^0-9.-]+/g, '')) || 0
      const t = Number(item.tax) || 0
      const row = q * p
      subtotal += row
      if (!isNoTax) {
        tax += row * (t / 100)
      }
    })
    return subtotal + (isNoTax ? 0 : tax)
  }

  const formatCurrency = (amount: number, currency = 'IDR') => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: currency === 'IDR' ? 'IDR' : currency,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const filteredInvoices = React.useMemo(() => {
    return invoices.filter((inv) => {
      // Type filter
      if (filterType === 'invoice' && inv.docType?.toLowerCase() === 'quotation') return false
      if (filterType === 'quotation' && inv.docType?.toLowerCase() !== 'quotation') return false

      // Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const matchNum = inv.invoiceNumber?.toLowerCase().includes(q)
        const matchClient = (inv.to?.company?.toLowerCase().includes(q) || inv.to?.name?.toLowerCase().includes(q))
        const matchSubj = inv.subject?.toLowerCase().includes(q)
        const matchSender = inv.from?.company?.toLowerCase().includes(q)
        if (!matchNum && !matchClient && !matchSubj && !matchSender) return false
      }

      return true
    })
  }, [invoices, filterType, searchQuery])

  // Statistics
  const totalNominal = invoices.reduce((acc, inv) => acc + calculateTotal(inv), 0)
  const totalCount = invoices.length
  const quotationCount = invoices.filter((i) => i.docType?.toLowerCase() === 'quotation').length
  const invoiceCount = totalCount - quotationCount

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Action */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl flex items-center gap-2">
            <Receipt className="h-7 w-7 text-primary" />
            Daftar Tagihan & Invoice
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Data tersinkronisasi otomatis dari profil Google Chrome Johan Utama & Invoice Builder.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenInvoiceEditor && (
            <Button
              onClick={() => onOpenInvoiceEditor()}
              className="gap-2 shadow-md shadow-primary/20"
            >
              <PlusCircle className="h-4 w-4" />
              Buka Invoice Builder
            </Button>
          )}
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Dokumen</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{totalCount} Dokumen</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Nilai Tagihan</p>
              <h3 className="text-xl font-bold text-emerald-500 mt-0.5">{formatCurrency(totalNominal)}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Invoice Tagihan</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{invoiceCount} Dokumen</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-gradient-to-br from-card to-card/50">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Quotation Penawaran</p>
              <h3 className="text-xl font-bold text-foreground mt-0.5">{quotationCount} Dokumen</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor invoice, klien (Paragon, Schema EO), atau perihal..."
            className="pl-9 bg-card"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('all')}
          >
            Semua ({totalCount})
          </Button>
          <Button
            variant={filterType === 'invoice' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('invoice')}
          >
            Invoice ({invoiceCount})
          </Button>
          <Button
            variant={filterType === 'quotation' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterType('quotation')}
          >
            Quotation ({quotationCount})
          </Button>
        </div>
      </div>

      {/* Table Data Card */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-xs font-semibold border-b border-border">
                <tr>
                  <th className="px-4 py-3.5">No. Dokumen</th>
                  <th className="px-4 py-3.5">Jenis</th>
                  <th className="px-4 py-3.5">Klien / Tujuan</th>
                  <th className="px-4 py-3.5">Perihal / Layanan</th>
                  <th className="px-4 py-3.5">Tanggal</th>
                  <th className="px-4 py-3.5 text-right">Total Nominal</th>
                  <th className="px-4 py-3.5 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      Tidak ada invoice yang sesuai dengan pencarian Anda.
                    </td>
                  </tr>
                ) : (
                  filteredInvoices.map((inv) => {
                    const total = calculateTotal(inv)
                    const isQuotation = inv.docType?.toLowerCase() === 'quotation'
                    const client = inv.to?.company || inv.to?.name || 'Tanpa Klien'
                    const firstItem = inv.items?.[0]?.name || '-'

                    return (
                      <tr
                        key={inv.id || inv.invoiceNumber}
                        className="hover:bg-muted/30 transition-colors group cursor-pointer"
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        <td className="px-4 py-3.5 font-mono font-bold text-foreground">
                          {inv.invoiceNumber || 'Draft'}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant={isQuotation ? 'warning' : 'default'} className="font-medium text-xs">
                            {isQuotation ? 'Quotation' : 'Invoice'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-foreground">
                          <div className="flex flex-col">
                            <span className="font-semibold">{client}</span>
                            {inv.to?.name && inv.to?.company && (
                              <span className="text-xs text-muted-foreground">{inv.to.name}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground max-w-xs truncate">
                          {inv.subject || firstItem}
                        </td>
                        <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap">
                          {inv.issueDate || '-'}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-foreground text-right whitespace-nowrap">
                          {formatCurrency(total, inv.currency)}
                        </td>
                        <td className="px-4 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-xs gap-1"
                              onClick={() => setSelectedInvoice(inv)}
                              title="Lihat Detail"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Lihat
                            </Button>
                            {onOpenInvoiceEditor && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs gap-1"
                                onClick={() => onOpenInvoiceEditor(inv.id)}
                                title="Buka di Invoice Builder"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal / Preview Detail Invoice */}
      {selectedInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setSelectedInvoice(null)}
        >
          <div
            className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-foreground">
                    Dokumen #{selectedInvoice.invoiceNumber}
                  </h3>
                  <Badge variant={selectedInvoice.docType === 'quotation' ? 'warning' : 'default'}>
                    {selectedInvoice.docType === 'quotation' ? 'Quotation Letter' : 'Invoice'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Tanggal Terbit: {selectedInvoice.issueDate} {selectedInvoice.dueDate && `• Jatuh Tempo: ${selectedInvoice.dueDate}`}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedInvoice(null)}
                className="h-8 w-8 p-0"
              >
                ✕
              </Button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-sm">
              {/* Parties */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-muted/40 border border-border/50">
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Pengirim (Dari):</p>
                  <p className="font-bold text-foreground mt-1">{selectedInvoice.from?.company || 'Bluudz Creative'}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.from?.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.from?.phone} • {selectedInvoice.from?.email}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.from?.address}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Penerima (Klien):</p>
                  <p className="font-bold text-foreground mt-1">{selectedInvoice.to?.company || selectedInvoice.to?.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.to?.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.to?.phone} • {selectedInvoice.to?.email}</p>
                  <p className="text-xs text-muted-foreground">{selectedInvoice.to?.address}</p>
                </div>
              </div>

              {/* Subject */}
              {selectedInvoice.subject && (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Perihal:</p>
                  <p className="font-medium text-foreground mt-1">{selectedInvoice.subject}</p>
                </div>
              )}

              {/* Items List */}
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground mb-2">Rincian Item & Layanan:</p>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-2.5 text-left">Nama Layanan</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-right">Harga Satuan</th>
                        <th className="p-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {selectedInvoice.items?.map((it, idx) => {
                        const q = Number(it.qty) || 1
                        const p = Number(String(it.price || 0).replace(/[^0-9.-]+/g, '')) || 0
                        return (
                          <tr key={idx}>
                            <td className="p-2.5">
                              <p className="font-medium text-foreground">{it.name}</p>
                              {it.description && (
                                <p className="text-muted-foreground text-[11px] whitespace-pre-line mt-0.5">{it.description}</p>
                              )}
                            </td>
                            <td className="p-2.5 text-center">{q}</td>
                            <td className="p-2.5 text-right">{formatCurrency(p, selectedInvoice.currency)}</td>
                            <td className="p-2.5 text-right font-semibold">{formatCurrency(q * p, selectedInvoice.currency)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Total Summary */}
              <div className="flex justify-end pt-2 border-t border-border">
                <div className="w-64 space-y-1 text-right">
                  <div className="flex justify-between text-muted-foreground text-xs">
                    <span>Total Nominal:</span>
                    <span className="font-bold text-foreground text-base">
                      {formatCurrency(calculateTotal(selectedInvoice), selectedInvoice.currency)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Payment Notes */}
              {selectedInvoice.paymentNotes && (
                <div className="p-3.5 rounded-lg bg-muted/20 border border-border text-xs">
                  <p className="font-semibold text-foreground mb-1">Catatan & Rekening Pembayaran:</p>
                  <div
                    className="text-muted-foreground whitespace-pre-line"
                    dangerouslySetInnerHTML={{ __html: selectedInvoice.paymentNotes }}
                  />
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border bg-muted/20 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedInvoice(null)}>
                Tutup
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.print()
                }}
                className="gap-1.5"
              >
                <Printer className="h-4 w-4" />
                Cetak
              </Button>
              {onOpenInvoiceEditor && (
                <Button
                  size="sm"
                  onClick={() => {
                    const id = selectedInvoice.id
                    setSelectedInvoice(null)
                    onOpenInvoiceEditor(id)
                  }}
                  className="gap-1.5"
                >
                  <ExternalLink className="h-4 w-4" />
                  Buka di Invoice Builder
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
