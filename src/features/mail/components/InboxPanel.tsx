import { ArrowLeft, Inbox, RefreshCw, X } from 'lucide-react'
import type { MailAccount, MailMessage, MailMessageDetail } from '../types'
import { formatDate, formatListDate } from '../utils'

interface InboxPanelProps {
  selectedAccount: MailAccount | undefined
  isOutlookGraph: boolean
  query: string
  messages: MailMessage[]
  totalMessages: number
  selectedMessage: MailMessageDetail | null
  loadingInbox: boolean
  onOpenMessage: (uid: number | string) => void
  onCloseMessage: () => void
}

export function InboxPanel({
  selectedAccount,
  isOutlookGraph,
  query,
  messages,
  totalMessages,
  selectedMessage,
  loadingInbox,
  onOpenMessage,
  onCloseMessage,
}: InboxPanelProps) {
  return (
    <div className={`em-split${selectedMessage ? ' has-detail' : ''}`}>
      <section className="em-list" aria-label="Daftar email">
        <div className="em-sheet-heading">
          <h2>Inbox</h2>
          <span>
            {selectedAccount ? `${messages.length} dari ${totalMessages}` : '—'}
          </span>
        </div>
        <p className="em-list-sub">
          {selectedAccount
            ? `${selectedAccount.email}${isOutlookGraph ? ' · Graph API' : ''}`
            : 'Belum ada akun dipilih'}
        </p>

        {!selectedAccount ? (
          <div className="em-empty-stack">
            <Inbox size={18} />
            <p>Pilih akun di rail kiri untuk membaca inbox.</p>
          </div>
        ) : loadingInbox ? (
          <p className="em-empty"><RefreshCw size={13} className="animate-spin" /> Mengambil pesan…</p>
        ) : totalMessages === 0 ? (
          <div className="em-empty-stack">
            <Inbox size={18} />
            <p>Inbox kosong atau tidak ada email terbaru.</p>
          </div>
        ) : messages.length === 0 ? (
          <p className="em-empty">Tidak ada email yang cocok dengan “{query}”.</p>
        ) : (
          <div className="em-rows">
            {messages.map((message) => {
              const sender = Array.isArray(message.from) ? message.from[0] : null
              return (
                <button
                  key={String(message.uid)}
                  type="button"
                  data-uid={String(message.uid)}
                  className={`em-row${message.unread ? ' is-unread' : ''}`}
                  onClick={() => void onOpenMessage(message.uid)}
                >
                  <span className="em-row-top">
                    {message.unread && <span className="em-dot" aria-label="Belum dibaca" />}
                    <span className="em-row-subject">{message.subject || '(Tanpa subjek)'}</span>
                    <span className="em-row-date">{formatListDate(message.date)}</span>
                  </span>
                  <span className="em-row-from">
                    {sender?.name ? `${sender.name} · ` : ''}{sender?.address || 'Pengirim tidak diketahui'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      <section className="em-reader" aria-label="Isi email">
        {!selectedMessage ? (
          <div className="em-reader-empty">
            <h4>Pilih email untuk membaca isinya.</h4>
            <p>Isi pesan tampil di sini sebagai teks bersih, tanpa memuat HTML atau gambar dari pengirim.</p>
          </div>
        ) : (
          <>
            <div className="em-reader-head">
              <div>
                <h3>{selectedMessage.subject || '(Tanpa subjek)'}</h3>
                <p className="em-reader-from">{selectedMessage.from}</p>
                <p className="em-reader-date">{formatDate(selectedMessage.date)}</p>
              </div>
              <button type="button" className="em-icon-button" aria-label="Tutup email" onClick={onCloseMessage}>
                <X size={16} />
              </button>
            </div>
            <div className="em-reader-body">
              <pre>{selectedMessage.text || '(Email ini tidak memiliki isi teks yang dapat ditampilkan.)'}</pre>
            </div>
            <div className="em-reader-foot">
              <button type="button" className="em-text-button" onClick={onCloseMessage}>
                <ArrowLeft size={15} />
                Kembali ke daftar
              </button>
              <span className="em-muted">Teks bersih, tanpa HTML.</span>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
