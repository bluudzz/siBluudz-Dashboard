import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Send, Trash2, Check } from 'lucide-react'

type Channel = { id: string; label: string; channelType: 'telegram' | 'discord' | 'webhook'; chatId: string }

async function channelRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch('/api/workflow-channels' + path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(body.error || `Gagal mengakses channel notifikasi (${response.status}).`)
  return body as T
}

export function NotificationChannelSettings({ value, busy, onChange }: { value: string; busy: boolean; onChange: (id: string) => void }) {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [label, setLabel] = useState('')
  const [channelType, setChannelType] = useState<'telegram' | 'discord' | 'webhook'>('telegram')
  const [chatId, setChatId] = useState('')
  const [secret, setSecret] = useState('')

  useEffect(() => {
    let cancelled = false
    channelRequest<{ channels: Channel[] }>('')
      .then(body => {
        if (cancelled) return
        setChannels(body.channels)
        setAdding(!body.channels.length)
        if (!value && body.channels.length === 1) onChange(body.channels[0].id)
      })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat channel.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const selected = channels.find(c => c.id === value)

  const add = async (event: FormEvent) => {
    event.preventDefault()
    if (working || busy) return
    setWorking(true); setError(''); setNotice('')
    try {
      const { channel } = await channelRequest<{ channel: Channel }>('', {
        method: 'POST',
        body: JSON.stringify({ label, channelType, chatId, secret }),
      })
      setChannels(prev => [channel, ...prev])
      onChange(channel.id)
      setLabel(''); setChatId(''); setSecret(''); setAdding(false)
      setNotice(`Channel "${channel.label}" tersimpan.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan channel.')
    } finally {
      setWorking(false)
    }
  }

  const test = async () => {
    if (!value || working || busy) return
    setWorking(true); setError(''); setNotice('')
    try {
      const res = await channelRequest<{ message: string }>(`/${value}/test`, { method: 'POST' })
      setNotice(res.message || 'Pesan tes terkirim.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tes notifikasi gagal.')
    } finally {
      setWorking(false)
    }
  }

  const remove = async () => {
    if (!value) return
    if (!confirmRemove) { setConfirmRemove(true); return }
    setWorking(true); setError(''); setNotice('')
    try {
      await channelRequest(`/${value}`, { method: 'DELETE' })
      setChannels(prev => prev.filter(c => c.id !== value))
      onChange('')
      setConfirmRemove(false)
      setNotice('Channel dihapus.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menghapus channel.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="wf-instagram-accounts wf-instagram-connection">
      <div className="wf-ig-heading">
        <strong>Channel Notifikasi</strong>
        <button type="button" disabled={busy || working || loading} onClick={() => setAdding(v => !v)}>
          <Plus size={13} />{adding ? 'Tutup' : 'Tambah channel'}
        </button>
      </div>
      <label className="wf-field">
        <span className="sr-only">Pilih channel notifikasi</span>
        <select aria-label="Pilih channel notifikasi" disabled={busy || working || loading} value={value} onChange={e => { onChange(e.target.value); setConfirmRemove(false); setNotice('') }}>
          <option value="">{loading ? 'Memuat channel…' : 'Pilih channel…'}</option>
          {channels.map(c => (
            <option key={c.id} value={c.id}>{c.label} · {c.channelType.toUpperCase()}</option>
          ))}
        </select>
      </label>
      {selected && !adding && (
        <div className="wf-ig-account-tools">
          <span>{selected.channelType === 'telegram' ? `Chat ${selected.chatId}` : selected.channelType.toUpperCase()}</span>
          <button type="button" disabled={busy || working} title="Kirim pesan tes" aria-label="Kirim pesan tes" onClick={() => void test()}>
            <Send size={13} />
          </button>
          <button type="button" disabled={busy || working} title={confirmRemove ? 'Klik lagi untuk hapus' : 'Hapus channel'} aria-label={confirmRemove ? 'Konfirmasi hapus channel' : 'Hapus channel'} onClick={() => void remove()}>
            {confirmRemove ? <Check size={14} /> : <Trash2 size={14} />}
          </button>
        </div>
      )}
      {adding && (
        <form className="wf-ig-connect-form" onSubmit={e => void add(e)}>
          <label className="wf-field">
            <span>Jenis channel</span>
            <select value={channelType} disabled={busy || working} onChange={e => setChannelType(e.target.value as 'telegram' | 'discord' | 'webhook')}>
              <option value="telegram">Telegram Bot</option>
              <option value="discord">Discord Webhook</option>
              <option value="webhook">Webhook HTTPS Kustom</option>
            </select>
          </label>
          <label className="wf-field">
            <span>Nama channel</span>
            <input required value={label} disabled={busy || working} onChange={e => setLabel(e.target.value)} placeholder="Contoh: Telegram Tim IG" maxLength={80} />
          </label>
          {channelType === 'telegram' && (
            <label className="wf-field">
              <span>Chat ID Telegram</span>
              <input required value={chatId} disabled={busy || working} onChange={e => setChatId(e.target.value)} placeholder="Contoh: -1001234567890 atau @channel" />
            </label>
          )}
          <label className="wf-field">
            <span>{channelType === 'telegram' ? 'Bot Token Telegram' : 'URL Webhook HTTPS'}</span>
            <input required type="password" autoComplete="off" value={secret} disabled={busy || working} onChange={e => setSecret(e.target.value)} placeholder={channelType === 'telegram' ? '123456:ABCdef...' : 'https://discord.com/api/webhooks/...'} />
          </label>
          <button type="submit" className="wf-primary" disabled={busy || working || !label.trim() || !secret.trim() || (channelType === 'telegram' && !chatId.trim())}>
            {working ? 'Menyimpan…' : 'Simpan channel'}
          </button>
        </form>
      )}
      {notice && <p className="wf-muted" role="status">{notice}</p>}
      {error && <p className="wf-error" role="alert">{error}</p>}
    </section>
  )
}
