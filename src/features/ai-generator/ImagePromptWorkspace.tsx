import * as React from 'react'
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import {
  IMAGE_PROMPT_LANGUAGES,
  IMAGE_PROMPT_LIGHTING,
  IMAGE_PROMPT_RATIOS,
  IMAGE_PROMPT_STARTERS,
  IMAGE_PROMPT_STYLES,
  IMAGE_PROMPT_TARGETS,
  estimateImagePromptMetrics,
  formatImagePromptText,
} from '../../../shared/image-prompt.js'
import type { ImagePromptSpec } from '../../../shared/image-prompt.js'
import './image-prompt.css'

interface ImagePromptWorkspaceProps {
  promptInput: string
  onPromptChange: (value: string) => void
  details: string
  onDetailsChange: (value: string) => void
  target: string
  onTargetChange: (value: string) => void
  style: string
  onStyleChange: (value: string) => void
  ratio: string
  onRatioChange: (value: string) => void
  lighting: string
  onLightingChange: (value: string) => void
  language: string
  onLanguageChange: (value: string) => void
  generatedOutput: string
  onGeneratedOutputChange: (value: string) => void
  spec: ImagePromptSpec | null
  currentActiveModel: string
  generating: boolean
  ready: boolean
  disabledReason: string
  generationError: string
  pane: 'input' | 'result'
  onGenerate: () => void
  onClear: () => void
  onAuditInChecker: (promptText: string) => void
  copiedKey: string | null
  onCopy: (key: string, text: string) => void
}

export function ImagePromptWorkspace({
  promptInput,
  onPromptChange,
  details,
  onDetailsChange,
  target,
  onTargetChange,
  style,
  onStyleChange,
  ratio,
  onRatioChange,
  lighting,
  onLightingChange,
  language,
  onLanguageChange,
  generatedOutput,
  onGeneratedOutputChange,
  spec,
  currentActiveModel,
  generating,
  ready,
  disabledReason,
  generationError,
  pane,
  onGenerate,
  onClear,
  onAuditInChecker,
  copiedKey,
  onCopy,
}: ImagePromptWorkspaceProps) {
  const [view, setView] = React.useState<'prompt' | 'breakdown' | 'raw'>('prompt')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const metrics = React.useMemo(() => estimateImagePromptMetrics(promptInput), [promptInput])
  const mainMetrics = React.useMemo(
    () => estimateImagePromptMetrics(spec?.main_prompt || ''),
    [spec?.main_prompt]
  )

  const activeView: 'prompt' | 'breakdown' | 'raw' = spec ? view : 'raw'
  const copyPayload =
    spec && activeView !== 'raw' && spec.main_prompt ? spec.main_prompt : generatedOutput

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (ready) onGenerate()
    }
  }

  const applyStarter = (starterId: string) => {
    const starter = IMAGE_PROMPT_STARTERS.find((item) => item.id === starterId)
    if (!starter) return
    onStyleChange(starter.style)
    onRatioChange(starter.ratio)
    onLightingChange(starter.lighting)
    onPromptChange(starter.prompt)
    onDetailsChange(starter.details)
    textareaRef.current?.focus()
  }

  const downloadPromptText = () => {
    const content = spec ? formatImagePromptText(spec) : generatedOutput
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'prompt-visual.txt'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="ip-workbench" data-pane={pane}>
      <section className="ip-compose" aria-labelledby="ip-input-title">
        <div className="ip-compose-body">
          <div className="ag-section-heading">
            <h2 id="ip-input-title">Brief visual</h2>
            <button
              type="button"
              className="ag-text-btn"
              disabled={generating || (!promptInput && !details)}
              onClick={onClear}
            >
              Kosongkan
            </button>
          </div>

          <div className="ip-starter-block">
            <span className="ip-control-label">Mulai cepat</span>
            <div className="ip-starter-list">
              {IMAGE_PROMPT_STARTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={generating}
                  onClick={() => applyStarter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ip-select-row">
            <div className="ip-select-field">
              <label className="ip-control-label" htmlFor="ip-target">
                Target model gambar
              </label>
              <select
                id="ip-target"
                value={target}
                disabled={generating}
                onChange={(event) => onTargetChange(event.target.value)}
              >
                {IMAGE_PROMPT_TARGETS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="ip-select-field">
              <label className="ip-control-label" htmlFor="ip-language">
                Bahasa output prompt
              </label>
              <select
                id="ip-language"
                value={language}
                disabled={generating}
                onChange={(event) => onLanguageChange(event.target.value)}
              >
                {IMAGE_PROMPT_LANGUAGES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="sr-only" htmlFor="ai-prompt">
            Ide gambar yang ingin dibuat
          </label>
          <textarea
            id="ai-prompt"
            ref={textareaRef}
            className="ip-prompt-editor"
            value={promptInput}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={generating}
            placeholder="Jelaskan subjek utama, bahan/tekstur, penataan objek, latar, dan nuansa gambar..."
          />

          <div className="ip-chip-section">
            <span className="ip-control-label" id="ip-style-label">
              Gaya visual
            </span>
            <div className="ip-chip-group" role="group" aria-labelledby="ip-style-label">
              {IMAGE_PROMPT_STYLES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={style === item.id}
                  disabled={generating}
                  title={item.guidance}
                  onClick={() => onStyleChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ip-select-row">
            <div className="ip-select-field">
              <span className="ip-control-label" id="ip-ratio-label">
                Rasio aspek
              </span>
              <div className="ip-ratio-group" role="group" aria-labelledby="ip-ratio-label">
                {IMAGE_PROMPT_RATIOS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={ratio === item}
                    disabled={generating}
                    onClick={() => onRatioChange(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="ip-select-field">
              <label className="ip-control-label" htmlFor="ip-lighting">
                Pencahayaan
              </label>
              <select
                id="ip-lighting"
                value={lighting}
                disabled={generating}
                onChange={(event) => onLightingChange(event.target.value)}
              >
                {IMAGE_PROMPT_LIGHTING.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="ag-context-field">
            <summary>
              <span>Detail tambahan &amp; hal yang dihindari</span>
              <span className={details.trim() ? 'ag-context-state is-filled' : 'ag-context-state'}>
                {details.trim() ? 'Terisi' : 'Opsional'}
              </span>
            </summary>
            <label className="sr-only" htmlFor="ip-details">
              Detail tambahan &amp; hal yang dihindari
            </label>
            <textarea
              id="ip-details"
              rows={3}
              maxLength={4000}
              value={details}
              onChange={(event) => onDetailsChange(event.target.value)}
              disabled={generating}
              placeholder="Misalnya: botol kaca buram label bersih, latar kayu polos, hindari teks acak atau tangan."
            />
          </details>

          {generationError && (
            <div className="ag-alert is-negative" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>{generationError}</span>
            </div>
          )}
        </div>

        <div className="ag-compose-dock">
          <div className="ag-compose-meta">
            <span className="ag-char-count">
              {metrics.chars.toLocaleString('id-ID')} kar · {metrics.words.toLocaleString('id-ID')} kata
            </span>
            {!generating && !ready ? (
              <span className="ag-disabled-reason">{disabledReason}</span>
            ) : (
              <span className="ag-shortcut-hint">Ctrl / Cmd + Enter</span>
            )}
          </div>

          <button
            type="button"
            className="ag-primary-btn"
            data-testid="generate"
            onClick={onGenerate}
            disabled={!ready}
          >
            {generating ? (
              <RefreshCw size={15} className="animate-spin" aria-hidden="true" />
            ) : (
              <Send size={15} aria-hidden="true" />
            )}
            <span>{generating ? 'Menyusun...' : 'Susun prompt visual'}</span>
          </button>
        </div>
      </section>

      <section className="ip-output" aria-labelledby="ip-results-title" aria-busy={generating}>
        <div className="ag-section-heading">
          <h2 id="ip-results-title">Prompt visual siap pakai</h2>
          <div className="ag-output-actions">
            {spec && generatedOutput && (
              <div className="ag-segmented" role="group" aria-label="Tampilan prompt visual">
                <button
                  type="button"
                  aria-pressed={activeView === 'prompt'}
                  onClick={() => setView('prompt')}
                >
                  Prompt siap salin
                </button>
                <button
                  type="button"
                  aria-pressed={activeView === 'breakdown'}
                  onClick={() => setView('breakdown')}
                >
                  Rincian visual
                </button>
                <button
                  type="button"
                  aria-pressed={activeView === 'raw'}
                  onClick={() => setView('raw')}
                >
                  Teks asli
                </button>
              </div>
            )}

            {copyPayload && (
              <>
                <button
                  type="button"
                  className="ip-audit-btn"
                  disabled={generating}
                  onClick={() => onAuditInChecker(copyPayload)}
                >
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span>Audit di Checker</span>
                </button>
                <button
                  type="button"
                  className="ag-icon-btn"
                  aria-label="Unduh prompt (.txt)"
                  title="Unduh prompt (.txt)"
                  onClick={downloadPromptText}
                >
                  <Download size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="ag-copy-btn"
                  onClick={() => onCopy('visual-result', copyPayload)}
                >
                  {copiedKey === 'visual-result' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  <span>
                    {copiedKey === 'visual-result'
                      ? 'Disalin'
                      : spec && activeView !== 'raw'
                      ? 'Salin prompt'
                      : 'Salin hasil'}
                  </span>
                </button>
              </>
            )}
          </div>
        </div>

        <div className="ag-output-canvas">
          {generating ? (
            <div className="ag-result-loading" role="status">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
              <h3>Menyusun prompt visual dengan {currentActiveModel}</h3>
              <p>Merangkai subjek, komposisi, pencahayaan, dan variasi agar siap dipakai di model gambar.</p>
            </div>
          ) : !generatedOutput ? (
            <div className="ip-empty-blueprint">
              <div className="ip-blueprint-card">
                <div className="ag-empty-icon">
                  <ImageIcon size={22} aria-hidden="true" />
                </div>
                <div className="ag-empty-heading">
                  <h3>Prompt teks terstruktur untuk generator gambar</h3>
                  <p>
                    Pilih target model gambar, gaya visual, rasio, dan pencahayaan di panel kiri,
                    lalu klik &ldquo;Susun prompt visual&rdquo;.
                  </p>
                </div>
              </div>
              <div className="ip-blueprint-grid">
                <div className="ip-blueprint-slot">
                  <span>Prompt Utama</span>
                  <strong>Siap salin</strong>
                </div>
                <div className="ip-blueprint-slot">
                  <span>Variasi Angle</span>
                  <strong>2 opsi</strong>
                </div>
                <div className="ip-blueprint-slot">
                  <span>Rincian Cahaya</span>
                  <strong>Terarah</strong>
                </div>
              </div>
            </div>
          ) : activeView === 'raw' || !spec ? (
            <div className="ag-result-editor-wrap">
              <label className="ag-muted" htmlFor="ai-result">
                Bisa diedit langsung sebelum disalin.
              </label>
              <textarea
                id="ai-result"
                className="ag-result-text"
                value={generatedOutput}
                onChange={(event) => onGeneratedOutputChange(event.target.value)}
                spellCheck={false}
              />
            </div>
          ) : activeView === 'prompt' ? (
            <div className="ip-spec-stack">
              <section className="ip-spec-card is-primary">
                <div className="ip-card-head">
                  <div>
                    <h3>{spec.title}</h3>
                    <span className="ip-card-meta">
                      {mainMetrics.words} kata · {mainMetrics.chars} karakter
                    </span>
                  </div>
                  <button
                    type="button"
                    className="ag-text-btn"
                    onClick={() => onCopy('visual-main', spec.main_prompt)}
                  >
                    {copiedKey === 'visual-main' ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'visual-main' ? 'Disalin' : 'Salin prompt utama'}</span>
                  </button>
                </div>
                <pre className="ip-prompt-pre">{spec.main_prompt}</pre>
                {spec.parameters && (
                  <div className="ip-param-bar">
                    <span>Parameter:</span>
                    <code>{spec.parameters}</code>
                  </div>
                )}
              </section>

              {spec.negative_prompt && (
                <section className="ip-spec-card">
                  <div className="ip-card-head">
                    <h3>Hal yang dihindari (Negative Prompt)</h3>
                    <button
                      type="button"
                      className="ag-text-btn"
                      onClick={() => onCopy('visual-neg', spec.negative_prompt)}
                    >
                      {copiedKey === 'visual-neg' ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <Copy size={14} aria-hidden="true" />
                      )}
                      <span>{copiedKey === 'visual-neg' ? 'Disalin' : 'Salin'}</span>
                    </button>
                  </div>
                  <p className="ip-neg-copy">{spec.negative_prompt}</p>
                </section>
              )}

              {spec.variants.length > 0 && (
                <section className="ip-spec-card">
                  <h3>Variasi alternatif</h3>
                  <div className="ip-variant-list">
                    {spec.variants.map((variant, index) => {
                      const key = `visual-var-${index}`
                      return (
                        <article key={variant.label} className="ip-variant-item">
                          <div className="ip-card-head">
                            <strong>{variant.label}</strong>
                            <button
                              type="button"
                              className="ag-text-btn"
                              onClick={() => onCopy(key, variant.prompt)}
                            >
                              {copiedKey === key ? (
                                <Check size={14} aria-hidden="true" />
                              ) : (
                                <Copy size={14} aria-hidden="true" />
                              )}
                              <span>{copiedKey === key ? 'Disalin' : 'Salin variasi'}</span>
                            </button>
                          </div>
                          <p>{variant.prompt}</p>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}
            </div>
          ) : (
            <div className="ip-spec-stack">
              <section className="ip-spec-card">
                <h3>Rincian arah visual</h3>
                <dl className="ip-breakdown-grid">
                  <div>
                    <dt>Subjek &amp; material</dt>
                    <dd>{spec.breakdown.subject || 'Mengikuti prompt utama.'}</dd>
                  </div>
                  <div>
                    <dt>Komposisi &amp; kamera</dt>
                    <dd>{spec.breakdown.composition || 'Mengikuti rasio yang dipilih.'}</dd>
                  </div>
                  <div>
                    <dt>Pencahayaan</dt>
                    <dd>{spec.breakdown.lighting || 'Mengikuti preferensi pencahayaan.'}</dd>
                  </div>
                  <div>
                    <dt>Palet warna</dt>
                    <dd>{spec.breakdown.color_palette || 'Seimbang sesuai suasana.'}</dd>
                  </div>
                </dl>
              </section>

              {spec.tips.length > 0 && (
                <section className="ip-spec-card">
                  <h3>Tips penyempurnaan</h3>
                  <ul className="ip-tip-list">
                    {spec.tips.map((tip) => (
                      <li key={tip}>
                        <Check size={14} aria-hidden="true" />
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </div>

        <p className="ag-result-note">
          Salin prompt di atas ke generator gambar pilihan Anda (misalnya GPT Image, Gemini Image, Flux, atau Midjourney).
        </p>
      </section>
    </div>
  )
}
