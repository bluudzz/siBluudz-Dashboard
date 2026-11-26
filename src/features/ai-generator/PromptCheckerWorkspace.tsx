import * as React from 'react'
import {
  AlertTriangle,
  ArrowUpLeft,
  Check,
  Circle,
  ClipboardCheck,
  Copy,
  RefreshCw,
  Send,
} from 'lucide-react'
import {
  PROMPT_CHECKER_FOCUSES,
  PROMPT_CHECKER_GOALS,
  analyzePromptLocally,
} from '../../../shared/prompt-checker.js'
import type { PromptEvaluation } from '../../../shared/prompt-checker.js'
import './prompt-checker.css'

const EXAMPLE_PROMPT =
  'Sebagai senior product designer, evaluasi draft halaman checkout toko online kami yang sering ditinggalkan pembeli di langkah pembayaran. Buat daftar 5 perbaikan prioritas dalam format tabel (Masalah, Dampak, Solusi UI), hindari saran generik tanpa contoh konkret.'

interface PromptCheckerWorkspaceProps {
  promptInput: string
  onPromptChange: (value: string) => void
  extraCriteria: string
  onExtraCriteriaChange: (value: string) => void
  goal: string
  onGoalChange: (goal: string) => void
  focuses: string[]
  onToggleFocus: (focusId: string) => void
  generatedOutput: string
  onGeneratedOutputChange: (value: string) => void
  evaluation: PromptEvaluation | null
  evaluatedSourcePrompt: string
  currentActiveModel: string
  generating: boolean
  ready: boolean
  disabledReason: string
  generationError: string
  pane: 'input' | 'result'
  onGenerate: () => void
  onClear: () => void
  onApplyImproved: (nextPrompt: string) => void
  copiedKey: string | null
  onCopy: (key: string, text: string) => void
}

function getScoreTone(score: number): 'good' | 'mid' | 'low' {
  if (score >= 80) return 'good'
  if (score >= 60) return 'mid'
  return 'low'
}

function getScoreTierLabel(score: number): string {
  if (score >= 80) return 'Kuat'
  if (score >= 60) return 'Cukup baik'
  return 'Perlu penajaman'
}

const SEVERITY_LABELS: Record<'high' | 'medium' | 'low', string> = {
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Ringan',
}

export function PromptCheckerWorkspace({
  promptInput,
  onPromptChange,
  extraCriteria,
  onExtraCriteriaChange,
  goal,
  onGoalChange,
  focuses,
  onToggleFocus,
  generatedOutput,
  onGeneratedOutputChange,
  evaluation,
  evaluatedSourcePrompt,
  currentActiveModel,
  generating,
  ready,
  disabledReason,
  generationError,
  pane,
  onGenerate,
  onClear,
  onApplyImproved,
  copiedKey,
  onCopy,
}: PromptCheckerWorkspaceProps) {
  const [view, setView] = React.useState<'report' | 'compare' | 'raw'>('report')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const localAudit = React.useMemo(() => analyzePromptLocally(promptInput), [promptInput])
  const sourceAudit = React.useMemo(
    () => analyzePromptLocally(evaluatedSourcePrompt || promptInput),
    [evaluatedSourcePrompt, promptInput]
  )
  const improvedAudit = React.useMemo(
    () => analyzePromptLocally(evaluation?.improved_prompt || ''),
    [evaluation?.improved_prompt]
  )

  const activeView: 'report' | 'compare' | 'raw' = evaluation ? view : 'raw'
  const copyPayload =
    evaluation && activeView !== 'raw' && evaluation.improved_prompt
      ? evaluation.improved_prompt
      : generatedOutput

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (ready) onGenerate()
    }
  }

  return (
    <div className="pc-workbench" data-pane={pane}>
      <section className="pc-compose" aria-labelledby="pc-input-title">
        <div className="pc-compose-body">
          <div className="ag-section-heading">
            <h2 id="pc-input-title">Prompt yang dievaluasi</h2>
            <div className="pc-heading-actions">
              <button
                type="button"
                className="ag-text-btn"
                disabled={generating}
                onClick={() => {
                  onPromptChange(EXAMPLE_PROMPT)
                  textareaRef.current?.focus()
                }}
              >
                Isi contoh
              </button>
              <button
                type="button"
                className="ag-text-btn"
                disabled={generating || (!promptInput && !extraCriteria)}
                onClick={onClear}
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div className="pc-control-row">
            <span className="pc-control-label" id="pc-goal-label">
              Tujuan
            </span>
            <div className="pc-goal-group" role="group" aria-labelledby="pc-goal-label">
              {PROMPT_CHECKER_GOALS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={goal === item.id}
                  disabled={generating}
                  title={item.guidance}
                  onClick={() => onGoalChange(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <label className="sr-only" htmlFor="ai-prompt">
            Prompt yang akan dievaluasi
          </label>
          <textarea
            id="ai-prompt"
            ref={textareaRef}
            className="pc-prompt-editor"
            value={promptInput}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={generating}
            placeholder="Tempel atau tulis prompt lengkap yang ingin diaudit..."
          />

          <div className="pc-local-checks" aria-label="Pemeriksaan kelengkapan lokal">
            {localAudit.checks.map((item) => (
              <span
                key={item.id}
                className={`pc-local-check ${item.passed ? 'is-pass' : 'is-missing'}`}
              >
                {item.passed ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Circle size={12} aria-hidden="true" />
                )}
                <span>{item.label}</span>
              </span>
            ))}
          </div>

          <div className="pc-focus-block">
            <span className="pc-control-label" id="pc-focus-label">
              Fokus audit
            </span>
            <div className="pc-focus-group" role="group" aria-labelledby="pc-focus-label">
              {PROMPT_CHECKER_FOCUSES.map((item) => {
                const active = focuses.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    disabled={generating}
                    onClick={() => onToggleFocus(item.id)}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          <details className="ag-context-field">
            <summary>
              <span>Kriteria tambahan</span>
              <span className={extraCriteria.trim() ? 'ag-context-state is-filled' : 'ag-context-state'}>
                {extraCriteria.trim() ? 'Terisi' : 'Opsional'}
              </span>
            </summary>
            <label className="sr-only" htmlFor="ai-context">
              Kriteria penilaian tambahan
            </label>
            <textarea
              id="ai-context"
              rows={2}
              maxLength={8000}
              value={extraCriteria}
              onChange={(event) => onExtraCriteriaChange(event.target.value)}
              disabled={generating}
              placeholder="Misalnya: wajib cocok untuk model coding, atau output maksimal 300 kata."
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
              {localAudit.words.toLocaleString('id-ID')} kata · ~
              {localAudit.approxTokens.toLocaleString('id-ID')} token · {localAudit.passedCount}/
              {localAudit.totalChecks} elemen
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
            <span>{generating ? 'Memproses...' : 'Evaluasi prompt'}</span>
          </button>
        </div>
      </section>

      <section className="pc-output" aria-labelledby="ai-results-title" aria-busy={generating}>
        <div className="ag-section-heading">
          <h2 id="ai-results-title">Laporan audit</h2>
          <div className="ag-output-actions">
            {evaluation && generatedOutput && (
              <div className="ag-segmented" role="group" aria-label="Tampilan laporan audit">
                <button
                  type="button"
                  aria-pressed={activeView === 'report'}
                  onClick={() => setView('report')}
                >
                  Laporan
                </button>
                <button
                  type="button"
                  aria-pressed={activeView === 'compare'}
                  onClick={() => setView('compare')}
                >
                  Bandingkan
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
              <button
                type="button"
                className="ag-copy-btn"
                onClick={() => onCopy('result', copyPayload)}
              >
                {copiedKey === 'result' ? (
                  <Check size={14} aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
                <span>{copiedKey === 'result' ? 'Disalin' : 'Salin hasil'}</span>
              </button>
            )}
          </div>
        </div>

        <div className="ag-output-canvas">
          {generating ? (
            <div className="ag-result-loading" role="status">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
              <h3>Mengaudit prompt dengan {currentActiveModel}</h3>
              <p>Menilai kejelasan, spesifisitas, batasan, serta menyusun versi perbaikan siap salin.</p>
            </div>
          ) : evaluation && activeView === 'report' ? (
            <div className="pc-report">
              <div className="pc-score-card">
                <div className="pc-score-head">
                  <div className="pc-score-overall">
                    <span className="pc-score-value">{evaluation.overall}</span>
                    <span className="pc-score-denom">/100</span>
                    <span className={`pc-score-tier is-${getScoreTone(evaluation.overall)}`}>
                      {getScoreTierLabel(evaluation.overall)}
                    </span>
                  </div>
                  {evaluation.summary && <p className="pc-score-summary">{evaluation.summary}</p>}
                </div>

                <div className="pc-metric-bars">
                  {(
                    [
                      { key: 'clarity', label: 'Kejelasan', value: evaluation.scores.clarity },
                      { key: 'specificity', label: 'Spesifisitas', value: evaluation.scores.specificity },
                      { key: 'constraints', label: 'Batasan', value: evaluation.scores.constraints },
                    ] as const
                  ).map((metric) => {
                    const tone = getScoreTone(metric.value)
                    return (
                      <div key={metric.key} className="pc-metric-row">
                        <div className="pc-metric-meta">
                          <span>{metric.label}</span>
                          <span>{metric.value}/100</span>
                        </div>
                        <div className="pc-metric-track" aria-hidden="true">
                          <div
                            className={`pc-metric-fill is-${tone}`}
                            style={{ width: `${metric.value}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {evaluation.improved_prompt && (
                <div className="pc-improved-card">
                  <div className="pc-card-header">
                    <h3>Versi prompt yang disarankan</h3>
                    <div className="pc-card-actions">
                      <button
                        type="button"
                        className="ag-copy-btn"
                        onClick={() => onCopy('improved', evaluation.improved_prompt)}
                      >
                        {copiedKey === 'improved' ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                        <span>{copiedKey === 'improved' ? 'Disalin' : 'Salin prompt'}</span>
                      </button>
                      <button
                        type="button"
                        className="pc-apply-btn"
                        onClick={() => onApplyImproved(evaluation.improved_prompt)}
                      >
                        <ArrowUpLeft size={14} aria-hidden="true" />
                        <span>Pakai &amp; evaluasi ulang</span>
                      </button>
                    </div>
                  </div>
                  <pre className="pc-improved-body">{evaluation.improved_prompt}</pre>
                </div>
              )}

              {(evaluation.issues.length > 0 || evaluation.recommendations.length > 0) && (
                <div className="pc-findings-card">
                  <h3>Celah &amp; rekomendasi</h3>
                  {evaluation.issues.length > 0 && (
                    <ul className="pc-issues-list">
                      {evaluation.issues.map((issue, idx) => (
                        <li key={`${issue.title}-${idx}`} className="pc-issue-item">
                          <div className="pc-issue-top">
                            <strong>{issue.title}</strong>
                            <span className={`pc-severity is-${issue.severity}`}>
                              {SEVERITY_LABELS[issue.severity]}
                            </span>
                          </div>
                          {issue.detail && <p>{issue.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {evaluation.recommendations.length > 0 && (
                    <ul className="pc-rec-list">
                      {evaluation.recommendations.map((rec, idx) => (
                        <li key={`${rec}-${idx}`}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {evaluation.strengths.length > 0 && (
                <div className="pc-strengths-card">
                  <h3>Bagian yang sudah kuat</h3>
                  <ul className="pc-strengths-list">
                    {evaluation.strengths.map((item, idx) => (
                      <li key={`${item}-${idx}`}>
                        <Check size={14} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : evaluation && activeView === 'compare' ? (
            <div className="pc-compare">
              <div className="pc-compare-col">
                <div className="pc-compare-head">
                  <h3>Prompt asli</h3>
                  <span>
                    {sourceAudit.words} kata · ~{sourceAudit.approxTokens} token
                  </span>
                </div>
                <pre className="pc-compare-body">{evaluatedSourcePrompt || promptInput}</pre>
              </div>
              <div className="pc-compare-col is-improved">
                <div className="pc-compare-head">
                  <h3>Versi perbaikan</h3>
                  <span>
                    {improvedAudit.words} kata · ~{improvedAudit.approxTokens} token
                  </span>
                </div>
                <pre className="pc-compare-body">{evaluation.improved_prompt}</pre>
                <div className="pc-compare-actions">
                  <button
                    type="button"
                    className="ag-copy-btn"
                    onClick={() => onCopy('compare-improved', evaluation.improved_prompt)}
                  >
                    {copiedKey === 'compare-improved' ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'compare-improved' ? 'Disalin' : 'Salin prompt'}</span>
                  </button>
                  <button
                    type="button"
                    className="pc-apply-btn"
                    onClick={() => onApplyImproved(evaluation.improved_prompt)}
                  >
                    <ArrowUpLeft size={14} aria-hidden="true" />
                    <span>Pakai versi ini</span>
                  </button>
                </div>
              </div>
            </div>
          ) : generatedOutput ? (
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
          ) : (
            <div className="pc-empty-blueprint">
              <div className="pc-blueprint-scores" aria-label="Pratinjau metrik audit">
                {['Kejelasan', 'Spesifisitas', 'Batasan'].map((label) => (
                  <div key={label} className="pc-blueprint-metric">
                    <span>{label}</span>
                    <strong>-</strong>
                  </div>
                ))}
              </div>
              <div className="pc-blueprint-card">
                <div className="ag-empty-icon">
                  <ClipboardCheck size={22} aria-hidden="true" />
                </div>
                <div className="ag-empty-heading">
                  <h3>Siap mengaudit prompt Anda</h3>
                  <p>
                    Tempel prompt di editor kiri, pilih tujuan dan fokus audit, lalu jalankan Evaluasi
                    prompt untuk mendapat laporan terstruktur.
                  </p>
                </div>
                <ul className="ag-result-checklist">
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Skor 0-100 untuk kejelasan, spesifisitas, dan batasan</span>
                  </li>
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Daftar celah instruksi serta rekomendasi perbaikan</span>
                  </li>
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Versi prompt siap salin dan perbandingan sebelum vs sesudah</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <p className="ag-result-note">
          Periksa kembali fakta, angka, dan detail sebelum menggunakan hasil AI.
        </p>
      </section>
    </div>
  )
}
