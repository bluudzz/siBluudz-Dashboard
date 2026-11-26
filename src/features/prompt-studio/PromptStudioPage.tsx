import * as React from 'react'
import {
  Check,
  ClipboardPaste,
  Copy,
  Download,
  Layers,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import {
  PROMPT_STUDIO_DETAILS,
  PROMPT_STUDIO_SCOPES,
  PROMPT_STUDIO_TEMPLATES,
  buildArchitectPrompt,
  buildExecutorPrompt,
  estimatePromptMetrics,
  initialBrief,
  parseStudioPromptSections,
} from './prompt-builder'
import type { DesignBrief } from './prompt-builder'
import './prompt-studio.css'

const DRAFT_STORAGE_KEY = 'sibluudz_prompt_studio_draft_v1'

interface StoredDraft {
  brief: DesignBrief
  plan: string
  stage: 'architect' | 'executor'
}

function loadDraft(): StoredDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return { brief: initialBrief, plan: '', stage: 'architect' }
    const parsed = JSON.parse(raw) as Partial<StoredDraft>
    const stage = parsed.stage === 'executor' ? 'executor' : 'architect'
    const plan = typeof parsed.plan === 'string' ? parsed.plan : ''
    const rawBrief: Partial<DesignBrief> =
      parsed.brief && typeof parsed.brief === 'object' ? parsed.brief : {}
    return {
      brief: {
        project: typeof rawBrief.project === 'string' ? rawBrief.project : initialBrief.project,
        request: typeof rawBrief.request === 'string' ? rawBrief.request : '',
        context: typeof rawBrief.context === 'string' ? rawBrief.context : '',
        references: typeof rawBrief.references === 'string' ? rawBrief.references : '',
        constraints: typeof rawBrief.constraints === 'string' ? rawBrief.constraints : '',
        scope:
          typeof rawBrief.scope === 'string' && rawBrief.scope.trim()
            ? rawBrief.scope
            : initialBrief.scope,
        detail:
          typeof rawBrief.detail === 'string' && rawBrief.detail.trim()
            ? rawBrief.detail
            : initialBrief.detail,
      },
      plan,
      stage,
    }
  } catch {
    return { brief: initialBrief, plan: '', stage: 'architect' }
  }
}

interface PromptStudioPageProps {
  embedded?: boolean
  pane?: 'input' | 'result'
  onAuditInChecker?: (promptText: string) => void
}

export function PromptStudioPage({
  embedded = false,
  pane = 'input',
  onAuditInChecker,
}: PromptStudioPageProps = {}) {
  const initialDraft = React.useMemo(() => loadDraft(), [])
  const [brief, setBrief] = React.useState<DesignBrief>(initialDraft.brief)
  const [plan, setPlan] = React.useState<string>(initialDraft.plan)
  const [stage, setStage] = React.useState<'architect' | 'executor'>(initialDraft.stage)
  const [previewMode, setPreviewMode] = React.useState<'structured' | 'raw'>('structured')
  const [notice, setNotice] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ brief, plan, stage }))
    } catch {
      /* Ignore storage quota or private-mode errors */
    }
  }, [brief, plan, stage])

  const update = (field: keyof DesignBrief, value: string) => {
    setBrief((prev) => ({ ...prev, [field]: value }))
    setNotice('')
  }

  const liveOutput = React.useMemo(
    () => (stage === 'architect' ? buildArchitectPrompt(brief) : buildExecutorPrompt(brief, plan)),
    [stage, brief, plan]
  )

  const outputMetrics = React.useMemo(() => estimatePromptMetrics(liveOutput), [liveOutput])
  const planMetrics = React.useMemo(() => estimatePromptMetrics(plan), [plan])
  const sections = React.useMemo(() => parseStudioPromptSections(liveOutput), [liveOutput])

  const hasRequest = Boolean(brief.request.trim())
  const hasPlan = Boolean(plan.trim())
  const filledOptionalCount = [brief.context, brief.references, brief.constraints].filter((v) =>
    v.trim()
  ).length

  const applyTemplate = (templateId: string) => {
    const tpl = PROMPT_STUDIO_TEMPLATES.find((item) => item.id === templateId)
    if (!tpl) return
    setBrief((prev) => ({
      ...prev,
      ...tpl.brief,
    }))
    setNotice(`Template "${tpl.label}" diterapkan ke brief.`)
  }

  const resetDraft = () => {
    setBrief(initialBrief)
    setPlan('')
    setStage('architect')
    setNotice('Draf brief dikosongkan.')
  }

  const pasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setNotice('Browser tidak mengizinkan baca clipboard otomatis. Tempel manual dengan Ctrl+V.')
        return
      }
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        setNotice('Clipboard kosong.')
        return
      }
      setPlan(text)
      setNotice('Rancangan ditempel dari clipboard.')
    } catch {
      setNotice('Gagal membaca clipboard. Tempel manual di kotak rancangan.')
    }
  }

  const copy = async () => {
    if (!liveOutput) return
    try {
      await navigator.clipboard.writeText(liveOutput)
      setCopied(true)
      setNotice('Prompt berhasil disalin.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setNotice('Clipboard tidak tersedia. Buka Teks mentah lalu salin secara manual.')
    }
  }

  const download = () => {
    if (!liveOutput) return
    const url = URL.createObjectURL(new Blob([liveOutput], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `prompt-${stage === 'architect' ? 'perancang' : 'pelaksana'}.md`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setNotice('Prompt diunduh sebagai Markdown.')
  }

  return (
    <div className={`prompt-studio ${embedded ? 'is-embedded' : 'is-standalone'}`}>
      {!embedded && (
        <header className="ps-heading">
          <div>
            <h1>Prompt Studio</h1>
            <p>Desain diputuskan AI pintar. Implementasi dikerjakan AI hemat.</p>
          </div>
          <span className="ps-local">Tanpa kuota API</span>
        </header>
      )}

      <div
        className="ps-stepper"
        role="tablist"
        aria-label="Tahap kerja Prompt Studio"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const target =
            event.key === 'Home'
              ? 'architect'
              : event.key === 'End'
              ? 'executor'
              : stage === 'architect'
              ? 'executor'
              : 'architect'
          setStage(target)
          setNotice('')
          document.getElementById(`ps-tab-${target}`)?.focus()
        }}
      >
        <button
          type="button"
          id="ps-tab-architect"
          role="tab"
          aria-selected={stage === 'architect'}
          aria-controls="ps-panel"
          className="ps-step-btn"
          onClick={() => {
            setStage('architect')
            setNotice('')
          }}
        >
          <span className={`ps-step-badge ${hasRequest ? 'is-done' : ''}`}>
            {hasRequest ? <Check size={13} aria-hidden="true" /> : '1'}
          </span>
          <span className="ps-step-copy">
            <strong>Tahap 1: AI perancang</strong>
            <span>Susun brief untuk AI pintar</span>
          </span>
        </button>

        <button
          type="button"
          id="ps-tab-executor"
          role="tab"
          aria-selected={stage === 'executor'}
          aria-controls="ps-panel"
          className="ps-step-btn"
          onClick={() => {
            setStage('executor')
            setNotice('')
          }}
        >
          <span className={`ps-step-badge ${hasPlan ? 'is-done' : ''}`}>
            {hasPlan ? <Check size={13} aria-hidden="true" /> : '2'}
          </span>
          <span className="ps-step-copy">
            <strong>Tahap 2: AI pelaksana</strong>
            <span>Tempel rancangan untuk AI hemat</span>
          </span>
        </button>
      </div>

      <div id="ps-panel" role="tabpanel" aria-labelledby={`ps-tab-${stage}`} className="ps-workbench" data-pane={pane}>
        <section className="ps-input-col" aria-label={stage === 'architect' ? 'Brief perubahan' : 'Rancangan AI perancang'}>
          {stage === 'architect' ? (
            <>
              <div className="ps-input-body">
                <div className="ps-col-head">
                  <h2>Brief perubahan</h2>
                  <button
                    type="button"
                    className="ps-text-btn"
                    disabled={!hasRequest && !filledOptionalCount && !hasPlan}
                    onClick={resetDraft}
                  >
                    <RotateCcw size={13} aria-hidden="true" />
                    <span>Reset brief</span>
                  </button>
                </div>

                <div className="ps-template-bar">
                  <span className="ps-sublabel">Mulai cepat</span>
                  <div className="ps-template-list">
                    {PROMPT_STUDIO_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        className="ps-template-btn"
                        onClick={() => applyTemplate(tpl.id)}
                      >
                        {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ps-two-col">
                  <div className="ps-field">
                    <label htmlFor="ps-project">Nama proyek</label>
                    <input
                      id="ps-project"
                      value={brief.project}
                      maxLength={200}
                      onChange={(e) => update('project', e.target.value)}
                    />
                  </div>
                  <div className="ps-field">
                    <label htmlFor="ps-scope">Cakupan</label>
                    <select
                      id="ps-scope"
                      value={brief.scope}
                      onChange={(e) => update('scope', e.target.value)}
                    >
                      {PROMPT_STUDIO_SCOPES.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="ps-field">
                  <span className="ps-field-label" id="ps-detail-label">
                    Rincian instruksi
                  </span>
                  <div className="ps-detail-segments" role="group" aria-labelledby="ps-detail-label">
                    {PROMPT_STUDIO_DETAILS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        aria-pressed={brief.detail === item}
                        onClick={() => update('detail', item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="ps-field ps-field-grow">
                  <label htmlFor="ps-request">
                    Apa yang ingin kamu ubah? <span>Wajib</span>
                  </label>
                  <textarea
                    id="ps-request"
                    required
                    maxLength={12000}
                    value={brief.request}
                    onChange={(e) => update('request', e.target.value)}
                    placeholder="Contoh: Rapikan dashboard saya. Prioritaskan aplikasi favorit, sederhanakan sidebar, dan buat tampilan mobile lebih nyaman."
                  />
                </div>

                <details className="ps-context-box">
                  <summary>
                    <span>Konteks, referensi &amp; batasan</span>
                    <span className={`ps-context-pill ${filledOptionalCount > 0 ? 'is-filled' : ''}`}>
                      {filledOptionalCount > 0 ? `${filledOptionalCount}/3 terisi` : 'Opsional'}
                    </span>
                  </summary>
                  <div className="ps-context-fields">
                    <div className="ps-field">
                      <label htmlFor="ps-context">Stack, halaman, dan masalah saat ini</label>
                      <textarea
                        id="ps-context"
                        rows={2}
                        maxLength={16000}
                        value={brief.context}
                        onChange={(e) => update('context', e.target.value)}
                        placeholder="Misalnya: React, Tailwind, sidebar terlalu padat."
                      />
                    </div>
                    <div className="ps-field">
                      <label htmlFor="ps-reference">Referensi tampilan</label>
                      <textarea
                        id="ps-reference"
                        rows={2}
                        maxLength={4000}
                        value={brief.references}
                        onChange={(e) => update('references', e.target.value)}
                        placeholder="Deskripsi gaya, warna, dan layout yang kamu suka."
                      />
                    </div>
                    <div className="ps-field">
                      <label htmlFor="ps-constraints">Yang harus dipertahankan</label>
                      <textarea
                        id="ps-constraints"
                        rows={2}
                        maxLength={4000}
                        value={brief.constraints}
                        onChange={(e) => update('constraints', e.target.value)}
                        placeholder="Misalnya: warna merek, fungsi invoice, login, dan API yang berjalan."
                      />
                    </div>
                  </div>
                </details>
              </div>

              <div className="ps-dock">
                <div className="ps-dock-status">
                  <span className="ps-checks-inline">
                    {[
                      { label: 'Brief', ok: hasRequest },
                      { label: 'Konteks', ok: Boolean(brief.context.trim()) },
                      { label: 'Batasan', ok: Boolean(brief.constraints.trim()) },
                    ].map((item) => (
                      <span key={item.label} className={item.ok ? 'is-ok' : ''}>
                        {item.ok && <Check size={12} aria-hidden="true" />}
                        {item.label}
                      </span>
                    ))}
                  </span>
                  <span className="ps-autosave-note">Draf tersimpan otomatis di browser</span>
                </div>

                <button
                  type="button"
                  className="ps-primary-btn"
                  disabled={!hasRequest}
                  onClick={() => {
                    setStage('executor')
                    setNotice('')
                  }}
                >
                  Lanjut ke Tahap 2
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="ps-input-body">
                <div className="ps-col-head">
                  <h2>Rancangan dari AI pintar</h2>
                  <div className="ps-head-links">
                    <button type="button" className="ps-text-btn" onClick={() => void pasteFromClipboard()}>
                      <ClipboardPaste size={13} aria-hidden="true" />
                      <span>Tempel clipboard</span>
                    </button>
                    <button
                      type="button"
                      className="ps-text-btn"
                      disabled={!hasPlan}
                      onClick={() => {
                        setPlan('')
                        setNotice('')
                      }}
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                <div className="ps-brief-recap">
                  <div className="ps-recap-head">
                    <strong>
                      {brief.project.trim() || 'Proyek saya'} · {brief.scope}
                    </strong>
                    <button type="button" className="ps-text-btn" onClick={() => setStage('architect')}>
                      Ubah brief
                    </button>
                  </div>
                  <p className={hasRequest ? '' : 'is-missing'}>
                    {hasRequest
                      ? brief.request.trim()
                      : 'Brief perubahan belum diisi. Kembali ke Tahap 1 untuk mengisi permintaan.'}
                  </p>
                </div>

                <div className="ps-field ps-field-grow">
                  <label htmlFor="ps-plan">Tempel hasil rancangan lengkap dari AI perancang</label>
                  <textarea
                    id="ps-plan"
                    className="ps-plan-editor"
                    maxLength={60000}
                    value={plan}
                    onChange={(e) => {
                      setPlan(e.target.value)
                      setNotice('')
                    }}
                    placeholder="Tempel spesifikasi desain, daftar file, dan kriteria selesai dari AI pintar di sini..."
                  />
                </div>
              </div>

              <div className="ps-dock">
                <div className="ps-dock-status">
                  <span className="ps-metrics-text">
                    {planMetrics.words.toLocaleString('id-ID')} kata · ~
                    {planMetrics.approxTokens.toLocaleString('id-ID')} token rancangan
                  </span>
                  <span className="ps-autosave-note">Draf tersimpan otomatis di browser</span>
                </div>

                <button
                  type="button"
                  className="ps-secondary-btn"
                  onClick={() => {
                    setStage('architect')
                    setNotice('')
                  }}
                >
                  Kembali ke Brief
                </button>
              </div>
            </>
          )}
        </section>

        <section className="ps-output-col" aria-label="Hasil prompt">
          <div className="ps-output-head">
            <h2>{stage === 'architect' ? 'Prompt untuk AI pintar' : 'Prompt untuk AI hemat'}</h2>
            <div className="ps-output-controls">
              {liveOutput && (
                <div className="ps-view-segmented" role="group" aria-label="Mode pratinjau prompt">
                  <button
                    type="button"
                    aria-pressed={previewMode === 'structured'}
                    onClick={() => setPreviewMode('structured')}
                  >
                    Terstruktur
                  </button>
                  <button
                    type="button"
                    aria-pressed={previewMode === 'raw'}
                    onClick={() => setPreviewMode('raw')}
                  >
                    Teks mentah
                  </button>
                </div>
              )}

              <button
                type="button"
                className="ps-copy-primary"
                disabled={!liveOutput}
                onClick={() => void copy()}
              >
                {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                <span>{copied ? 'Disalin' : 'Salin prompt'}</span>
              </button>

              <button
                type="button"
                className="ps-icon-btn"
                disabled={!liveOutput}
                onClick={download}
                aria-label="Unduh prompt Markdown"
                title="Unduh Markdown (.md)"
              >
                <Download size={15} aria-hidden="true" />
              </button>

              {onAuditInChecker && liveOutput && (
                <button
                  type="button"
                  className="ps-audit-btn"
                  onClick={() => onAuditInChecker(liveOutput)}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Audit di Checker</span>
                </button>
              )}
            </div>
          </div>

          <div className="ps-output-body">
            {liveOutput ? (
              previewMode === 'structured' ? (
                <div className="ps-sections-list">
                  {sections.map((section) => (
                    <article key={section.heading} className="ps-section-card">
                      <h3>{section.heading}</h3>
                      <pre>{section.body}</pre>
                    </article>
                  ))}
                </div>
              ) : (
                <textarea
                  className="ps-raw-output"
                  aria-label="Prompt yang dihasilkan"
                  readOnly
                  value={liveOutput}
                  spellCheck={false}
                />
              )
            ) : (
              <div className="ps-empty-state">
                <div className="ps-empty-icon">
                  <Layers size={22} aria-hidden="true" />
                </div>
                <h3>
                  {stage === 'architect'
                    ? 'Prompt dirakit otomatis saat kamu mengetik'
                    : 'Siap menyusun instruksi untuk AI hemat'}
                </h3>
                <p>
                  {stage === 'architect'
                    ? 'Isi apa yang ingin diubah atau pilih salah satu template mulai cepat di panel kiri. Hasil langsung muncul di sini dalam 0 ms.'
                    : 'Tempel rancangan lengkap dari AI perancang di panel kiri agar dirakit menjadi instruksi eksekusi bertahap.'}
                </p>
                <ul className="ps-empty-list">
                  <li>Struktur halaman, navigasi, dan hierarki informasi</li>
                  <li>Spesifikasi visual konkret serta perilaku responsif</li>
                  <li>Langkah implementasi bertahap dan checklist uji coba</li>
                </ul>
                <div className="ps-empty-cta">
                  {stage === 'architect' ? (
                    <button
                      type="button"
                      className="ps-secondary-btn"
                      onClick={() => applyTemplate('redesign')}
                    >
                      Coba template Redesign Tampilan
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="ps-secondary-btn"
                      onClick={() => void pasteFromClipboard()}
                    >
                      <ClipboardPaste size={14} aria-hidden="true" />
                      <span>Tempel dari clipboard</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="ps-output-foot">
            <span className="ps-metrics-text">
              {liveOutput
                ? `${outputMetrics.words.toLocaleString('id-ID')} kata · ~${outputMetrics.approxTokens.toLocaleString('id-ID')} token · Dirakit lokal di browser`
                : 'Dirakit lokal di browser · Tanpa kuota API'}
            </span>
            <span className="ps-notice-text" role="status" aria-live="polite">
              {notice}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}
