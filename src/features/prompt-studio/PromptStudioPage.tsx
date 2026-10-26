import { useState } from 'react'
import { ArrowRight, Copy, Download } from 'lucide-react'
import { buildArchitectPrompt, buildExecutorPrompt, initialBrief } from './prompt-builder'
import type { DesignBrief } from './prompt-builder'
import './prompt-studio.css'

export function PromptStudioPage() {
  const [brief, setBrief] = useState<DesignBrief>(initialBrief)
  const [plan, setPlan] = useState('')
  const [stage, setStage] = useState<'architect' | 'executor'>('architect')
  const [notice, setNotice] = useState('')
  const [output, setOutput] = useState('')
  const [snapshot, setSnapshot] = useState('')
  const current = JSON.stringify({ brief, plan: stage === 'executor' ? plan : '', stage })
  const stale = Boolean(output && snapshot !== current)
  const ready = Boolean(brief.request.trim() && (stage === 'architect' || plan.trim()))
  const update = (field: keyof DesignBrief, value: string) => setBrief(prev => ({ ...prev, [field]: value }))
  const generate = () => {
    setOutput(stage === 'architect' ? buildArchitectPrompt(brief) : buildExecutorPrompt(brief, plan))
    setSnapshot(current)
    setNotice('Prompt siap. Salin dan kirim ke model pilihanmu.')
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(output); setNotice('Prompt berhasil disalin.') }
    catch { setNotice('Clipboard tidak tersedia. Pilih teks pada hasil lalu salin secara manual.') }
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([output], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `prompt-${stage === 'architect' ? 'perancang' : 'pelaksana'}.md`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Prompt diunduh sebagai Markdown.')
  }
  return (
    <div className="prompt-studio">
      <header className="ps-heading">
        <div><h1>Prompt Studio</h1><p>Desain diputuskan AI pintar. Implementasi dikerjakan AI hemat.</p></div>
        <span className="ps-local">Tanpa kuota API</span>
      </header>
      <ol className="ps-flow" aria-label="Alur kerja">
        <li><strong>Tulis keinginan</strong><span>Tujuan dan konteks proyek</span></li>
        <li><strong>Rancang bersama AI pintar</strong><span>Salin prompt, dapatkan spesifikasi</span></li>
        <li><strong>Serahkan ke AI hemat</strong><span>Tempel rancangan, siapkan instruksi</span></li>
      </ol>
      <div className="ps-workspace">
        <form className="ps-brief" onSubmit={event => { event.preventDefault(); generate() }}>
          <h2>Brief perubahan</h2>
          <label htmlFor="ps-project">Nama proyek</label>
          <input id="ps-project" value={brief.project} maxLength={200} onChange={e => update('project', e.target.value)} />
          <label htmlFor="ps-request">Apa yang ingin kamu ubah? <span>Wajib</span></label>
          <textarea id="ps-request" required rows={5} maxLength={12000} value={brief.request} onChange={e => update('request', e.target.value)} placeholder="Contoh: Rapikan dashboard saya. Prioritaskan aplikasi favorit, sederhanakan sidebar, dan buat tampilan mobile lebih nyaman." />
          <div className="ps-fields">
            <div><label htmlFor="ps-scope">Cakupan</label><select id="ps-scope" value={brief.scope} onChange={e => update('scope', e.target.value)}><option>Tampilan dan struktur navigasi</option><option>Tampilan saja</option><option>Struktur navigasi saja</option><option>Halaman atau komponen tertentu</option></select></div>
            <div><label htmlFor="ps-detail">Rincian instruksi</label><select id="ps-detail" value={brief.detail} onChange={e => update('detail', e.target.value)}><option>Ringkas</option><option>Seimbang</option><option>Sangat detail</option></select></div>
          </div>
          <details className="ps-context"><summary>Konteks & batasan <span>Opsional, agar lebih tepat</span></summary>
            <label htmlFor="ps-context">Stack, halaman, dan masalah saat ini</label><textarea id="ps-context" rows={3} maxLength={16000} value={brief.context} onChange={e => update('context', e.target.value)} placeholder="Misalnya: React, Tailwind, sidebar terlalu padat. Tempel struktur file atau penjelasan halaman terkait." />
            <label htmlFor="ps-reference">Referensi tampilan</label><textarea id="ps-reference" rows={2} maxLength={4000} value={brief.references} onChange={e => update('references', e.target.value)} placeholder="Link referensi atau deskripsi gaya, warna, dan layout yang kamu suka." />
            <label htmlFor="ps-constraints">Yang harus dipertahankan</label><textarea id="ps-constraints" rows={2} maxLength={4000} value={brief.constraints} onChange={e => update('constraints', e.target.value)} placeholder="Misalnya: warna merek, fungsi invoice, login, dan API yang sudah berjalan." />
          </details>
          <button className="ps-primary" disabled={!ready} type="submit">{stage === 'architect' ? 'Buat prompt perancang' : 'Buat prompt pelaksana'}<ArrowRight size={16} /></button>
          <p className="ps-help">Prompt dirakit di browser, bukan hasil analisis AI. Lampirkan kode atau screenshot saat mengirim ke AI perancang. Salin atau unduh hasil sebelum berpindah halaman; isian tidak disimpan.</p>
        </form>
        <section className="ps-result" aria-label="Hasil prompt">
          <div className="ps-tabs" role="tablist" aria-label="Tujuan prompt" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const target = event.key === 'Home' ? 'architect' : event.key === 'End' ? 'executor' : stage === 'architect' ? 'executor' : 'architect'
            setStage(target); setOutput(''); setNotice('')
            document.getElementById(`ps-tab-${target}`)?.focus()
          }}>
            <button type="button" id="ps-tab-architect" role="tab" aria-selected={stage === 'architect'} aria-controls="ps-panel" onClick={() => { setStage('architect'); setOutput(''); setNotice('') }}>AI perancang</button>
            <button type="button" id="ps-tab-executor" role="tab" aria-selected={stage === 'executor'} aria-controls="ps-panel" onClick={() => { setStage('executor'); setOutput(''); setNotice('') }}>AI pelaksana</button>
          </div>
          <div id="ps-panel" role="tabpanel" aria-labelledby={`ps-tab-${stage}`}>
            {stage === 'executor' && <div className="ps-plan"><label htmlFor="ps-plan">Tempel rancangan dari AI pintar</label><p>Gunakan blok prompt implementasi final yang lengkap, termasuk spesifikasi dan kriteria selesai.</p><textarea id="ps-plan" rows={7} maxLength={60000} value={plan} onChange={e => setPlan(e.target.value)} placeholder="Tempel hasil AI perancang di sini…" /></div>}
            <div className="ps-result-heading"><h2>{stage === 'architect' ? 'Prompt untuk AI pintar' : 'Prompt untuk AI hemat'}</h2><div className="ps-actions"><button type="button" disabled={!output || stale} onClick={copy}><Copy size={15} />Salin</button><button type="button" disabled={!output || stale} onClick={download} aria-label="Unduh prompt Markdown"><Download size={16} /></button></div></div>
            {stale && <p className="ps-warning" role="status">Isian berubah. Buat ulang prompt agar sesuai dengan brief terbaru.</p>}
            {output ? <textarea className="ps-output" aria-label="Prompt yang dihasilkan" readOnly value={output} spellCheck={false} /> : <div className="ps-empty"><h3>{stage === 'architect' ? 'Mulai dari keinginanmu.' : 'Rancangan siap dikerjakan.'}</h3><p>{stage === 'architect' ? 'Isi brief, lalu buat prompt. AI pintar akan diarahkan untuk menganalisis proyek, menentukan desain, dan menyusun instruksi implementasi.' : 'Tempel hasil dari AI pintar, lalu buat prompt pelaksana. Keputusan desain akan disertakan bersama brief dan aturan pengerjaan.'}</p><ul><li>Struktur halaman dan navigasi</li><li>Detail visual dan perilaku responsif</li><li>Tugas per komponen dan checklist pengujian</li></ul></div>}
            <p className="ps-notice" role="status" aria-live="polite">{notice}</p>
          </div>
        </section>
      </div>
    </div>
  )
}
