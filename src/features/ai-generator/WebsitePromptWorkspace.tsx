import * as React from 'react'
import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  Download,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react'
import {
  WEBSITE_ASSISTANTS,
  WEBSITE_PROJECT_TYPES,
  WEBSITE_PROMPT_STARTERS,
  WEBSITE_QUALITY_STANDARDS,
  WEBSITE_STACK_OPTIONS,
  estimateWebsitePromptMetrics,
  formatWebsiteSpecMarkdown,
} from '../../../shared/website-prompt.js'
import type { WebsiteSpec } from '../../../shared/website-prompt.js'
import './website-prompt.css'

interface WebsitePromptWorkspaceProps {
  promptInput: string
  onPromptChange: (value: string) => void
  constraints: string
  onConstraintsChange: (value: string) => void
  projectType: string
  onProjectTypeChange: (value: string) => void
  assistant: string
  onAssistantChange: (value: string) => void
  stack: string[]
  onToggleStack: (item: string) => void
  onSetStack: (items: string[]) => void
  standards: string[]
  onToggleStandard: (id: string) => void
  generatedOutput: string
  onGeneratedOutputChange: (value: string) => void
  spec: WebsiteSpec | null
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

export function WebsitePromptWorkspace({
  promptInput,
  onPromptChange,
  constraints,
  onConstraintsChange,
  projectType,
  onProjectTypeChange,
  assistant,
  onAssistantChange,
  stack,
  onToggleStack,
  onSetStack,
  standards,
  onToggleStandard,
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
}: WebsitePromptWorkspaceProps) {
  const [view, setView] = React.useState<'spec' | 'execution' | 'raw'>('spec')
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  const metrics = React.useMemo(() => estimateWebsitePromptMetrics(promptInput), [promptInput])
  const execMetrics = React.useMemo(
    () => estimateWebsitePromptMetrics(spec?.execution_prompt || ''),
    [spec?.execution_prompt]
  )

  const activeView: 'spec' | 'execution' | 'raw' = spec ? view : 'raw'
  const copyPayload =
    spec && activeView !== 'raw' && spec.execution_prompt ? spec.execution_prompt : generatedOutput

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
      event.preventDefault()
      if (ready) onGenerate()
    }
  }

  const applyStarter = (starterId: string) => {
    const starter = WEBSITE_PROMPT_STARTERS.find((item) => item.id === starterId)
    if (!starter) return
    onProjectTypeChange(starter.projectType)
    onSetStack(starter.stack)
    onPromptChange(starter.prompt)
    onConstraintsChange(starter.constraints)
    textareaRef.current?.focus()
  }

  const downloadSpec = () => {
    const content = spec ? formatWebsiteSpecMarkdown(spec) : generatedOutput
    if (!content) return
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'SPEC.md'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="wp-workbench" data-pane={pane}>
      <section className="wp-compose" aria-labelledby="wp-input-title">
        <div className="wp-compose-body">
          <div className="ag-section-heading">
            <h2 id="wp-input-title">Brief website / fitur</h2>
            <button
              type="button"
              className="ag-text-btn"
              disabled={generating || (!promptInput && !constraints)}
              onClick={onClear}
            >
              Kosongkan
            </button>
          </div>

          <div className="wp-starter-block">
            <span className="wp-control-label">Mulai cepat</span>
            <div className="wp-starter-list">
              {WEBSITE_PROMPT_STARTERS.map((item) => (
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

          <div className="wp-config-row">
            <div className="wp-config-type">
              <span className="wp-control-label" id="wp-type-label">
                Jenis proyek
              </span>
              <div className="wp-type-group" role="group" aria-labelledby="wp-type-label">
                {WEBSITE_PROJECT_TYPES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={projectType === item.id}
                    disabled={generating}
                    title={item.guidance}
                    onClick={() => onProjectTypeChange(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="wp-config-assistant">
              <label className="wp-control-label" htmlFor="wp-assistant">
                Target assistant
              </label>
              <select
                id="wp-assistant"
                value={assistant}
                disabled={generating}
                onChange={(event) => onAssistantChange(event.target.value)}
              >
                {WEBSITE_ASSISTANTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="sr-only" htmlFor="ai-prompt">
            Website atau fitur yang ingin dibuat
          </label>
          <textarea
            id="ai-prompt"
            ref={textareaRef}
            className="wp-prompt-editor"
            value={promptInput}
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={generating}
            placeholder="Jelaskan halaman, fitur utama, struktur data, dan alur pengguna yang kamu inginkan..."
          />

          <div className="wp-chip-section">
            <span className="wp-control-label" id="wp-stack-label">
              Tech stack
            </span>
            <div className="wp-chip-group" role="group" aria-labelledby="wp-stack-label">
              {WEBSITE_STACK_OPTIONS.map((item) => {
                const active = stack.includes(item)
                return (
                  <button
                    key={item}
                    type="button"
                    aria-pressed={active}
                    disabled={generating}
                    onClick={() => onToggleStack(item)}
                  >
                    {item}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="wp-chip-section">
            <span className="wp-control-label" id="wp-std-label">
              Standar kualitas
            </span>
            <div className="wp-chip-group" role="group" aria-labelledby="wp-std-label">
              {WEBSITE_QUALITY_STANDARDS.map((item) => {
                const active = standards.includes(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    disabled={generating}
                    onClick={() => onToggleStandard(item.id)}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>

          <details className="ag-context-field">
            <summary>
              <span>Batasan &amp; konteks repo</span>
              <span className={constraints.trim() ? 'ag-context-state is-filled' : 'ag-context-state'}>
                {constraints.trim() ? 'Terisi' : 'Opsional'}
              </span>
            </summary>
            <label className="sr-only" htmlFor="ai-context">
              Batasan &amp; konteks repo
            </label>
            <textarea
              id="ai-context"
              rows={2}
              maxLength={8000}
              value={constraints}
              onChange={(event) => onConstraintsChange(event.target.value)}
              disabled={generating}
              placeholder="Misalnya: pertahankan struktur auth dan komponen UI yang sudah ada di src/components/ui."
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
              {metrics.words.toLocaleString('id-ID')} kata · ~
              {metrics.approxTokens.toLocaleString('id-ID')} token · {stack.length} stack
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
            <span>{generating ? 'Memproses...' : 'Susun spesifikasi'}</span>
          </button>
        </div>
      </section>

      <section className="wp-output" aria-labelledby="ai-results-title" aria-busy={generating}>
        <div className="ag-section-heading">
          <h2 id="ai-results-title">Spesifikasi coding</h2>
          <div className="ag-output-actions">
            {spec && generatedOutput && (
              <div className="ag-segmented" role="group" aria-label="Tampilan spesifikasi coding">
                <button
                  type="button"
                  aria-pressed={activeView === 'spec'}
                  onClick={() => setView('spec')}
                >
                  Spesifikasi
                </button>
                <button
                  type="button"
                  aria-pressed={activeView === 'execution'}
                  onClick={() => setView('execution')}
                >
                  Prompt eksekusi
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
                  className="ag-copy-btn"
                  onClick={() => onCopy('result', copyPayload)}
                >
                  {copiedKey === 'result' ? (
                    <Check size={14} aria-hidden="true" />
                  ) : (
                    <Copy size={14} aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'result' ? 'Disalin' : 'Salin'}</span>
                </button>
                <button
                  type="button"
                  className="ag-icon-btn"
                  onClick={downloadSpec}
                  aria-label="Unduh spesifikasi SPEC.md"
                  title="Unduh SPEC.md"
                >
                  <Download size={15} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="ag-output-canvas">
          {generating ? (
            <div className="ag-result-loading" role="status">
              <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
              <h3>Menyusun spesifikasi dengan {currentActiveModel}</h3>
              <p>Merancang peta file, komponen, alur pengguna, kriteria selesai, dan prompt eksekusi.</p>
            </div>
          ) : spec && activeView === 'spec' ? (
            <div className="wp-spec-stack">
              <article className="wp-spec-card">
                <h3>{spec.title}</h3>
                {spec.summary && <p className="wp-spec-summary">{spec.summary}</p>}
                {spec.stack.length > 0 && (
                  <div className="wp-stack-tags">
                    {spec.stack.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                )}
              </article>

              {spec.execution_prompt && (
                <article className="wp-spec-card is-execution">
                  <div className="wp-card-head">
                    <h3>Prompt eksekusi siap tempel</h3>
                    <div className="wp-card-actions">
                      <button
                        type="button"
                        className="ag-copy-btn"
                        onClick={() => onCopy('exec', spec.execution_prompt)}
                      >
                        {copiedKey === 'exec' ? (
                          <Check size={14} aria-hidden="true" />
                        ) : (
                          <Copy size={14} aria-hidden="true" />
                        )}
                        <span>{copiedKey === 'exec' ? 'Disalin' : 'Salin prompt'}</span>
                      </button>
                      <button
                        type="button"
                        className="wp-audit-btn"
                        onClick={() => onAuditInChecker(spec.execution_prompt)}
                      >
                        <ShieldCheck size={14} aria-hidden="true" />
                        <span>Audit di Checker</span>
                      </button>
                    </div>
                  </div>
                  <pre className="wp-exec-pre">{spec.execution_prompt}</pre>
                </article>
              )}

              {spec.files.length > 0 && (
                <article className="wp-spec-card">
                  <h3>Peta file &amp; struktur</h3>
                  <ul className="wp-file-list">
                    {spec.files.map((file, idx) => (
                      <li key={`${file.path}-${idx}`}>
                        <code className="wp-file-path">{file.path}</code>
                        {file.purpose && <span>{file.purpose}</span>}
                      </li>
                    ))}
                  </ul>
                </article>
              )}

              {(spec.components.length > 0 ||
                spec.user_flows.length > 0 ||
                spec.states.empty ||
                spec.states.loading ||
                spec.states.error) && (
                <article className="wp-spec-card">
                  <h3>Komponen, alur &amp; kondisi UI</h3>
                  {spec.components.length > 0 && (
                    <ul className="wp-comp-list">
                      {spec.components.map((comp, idx) => (
                        <li key={`${comp.name}-${idx}`}>
                          <strong>{comp.name}</strong>
                          {comp.responsibility && <span>{comp.responsibility}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {spec.user_flows.length > 0 && (
                    <ol className="wp-flow-list">
                      {spec.user_flows.map((flow, idx) => (
                        <li key={`${flow}-${idx}`}>{flow}</li>
                      ))}
                    </ol>
                  )}
                  {(spec.states.empty || spec.states.loading || spec.states.error) && (
                    <dl className="wp-states-grid">
                      {spec.states.empty && (
                        <div>
                          <dt>Kosong</dt>
                          <dd>{spec.states.empty}</dd>
                        </div>
                      )}
                      {spec.states.loading && (
                        <div>
                          <dt>Memuat</dt>
                          <dd>{spec.states.loading}</dd>
                        </div>
                      )}
                      {spec.states.error && (
                        <div>
                          <dt>Error</dt>
                          <dd>{spec.states.error}</dd>
                        </div>
                      )}
                    </dl>
                  )}
                </article>
              )}

              {spec.acceptance_criteria.length > 0 && (
                <article className="wp-spec-card">
                  <h3>Kriteria selesai</h3>
                  <ul className="wp-criteria-list">
                    {spec.acceptance_criteria.map((item, idx) => (
                      <li key={`${item}-${idx}`}>
                        <Check size={14} aria-hidden="true" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              )}
            </div>
          ) : spec && activeView === 'execution' ? (
            <div className="wp-exec-focused">
              <div className="wp-exec-bar">
                <span>
                  {execMetrics.words.toLocaleString('id-ID')} kata · ~
                  {execMetrics.approxTokens.toLocaleString('id-ID')} token prompt eksekusi
                </span>
                <div className="wp-card-actions">
                  <button
                    type="button"
                    className="ag-copy-btn"
                    onClick={() => onCopy('exec-tab', spec.execution_prompt)}
                  >
                    {copiedKey === 'exec-tab' ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'exec-tab' ? 'Disalin' : 'Salin prompt'}</span>
                  </button>
                  <button
                    type="button"
                    className="wp-audit-btn"
                    onClick={() => onAuditInChecker(spec.execution_prompt)}
                  >
                    <ShieldCheck size={14} aria-hidden="true" />
                    <span>Audit di Checker</span>
                  </button>
                </div>
              </div>
              <textarea
                aria-label="Prompt eksekusi siap tempel"
                className="ag-result-text"
                readOnly
                value={spec.execution_prompt}
                spellCheck={false}
              />
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
            <div className="wp-empty-blueprint">
              <div className="wp-blueprint-grid" aria-label="Pratinjau output spesifikasi">
                {['Peta file & stack', 'Komponen & alur', 'Prompt eksekusi'].map((label) => (
                  <div key={label} className="wp-blueprint-slot">
                    <span>{label}</span>
                    <strong>-</strong>
                  </div>
                ))}
              </div>
              <div className="wp-blueprint-card">
                <div className="ag-empty-icon">
                  <Code2 size={22} aria-hidden="true" />
                </div>
                <div className="ag-empty-heading">
                  <h3>Siap menyusun spesifikasi teknis</h3>
                  <p>
                    Pilih jenis proyek, tech stack, dan standar kualitas di panel kiri, lalu tekan
                    Susun spesifikasi untuk menghasilkan rancangan coding terstruktur.
                  </p>
                </div>
                <ul className="ag-result-checklist">
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Peta file, komponen UI, alur pengguna, dan state kosong/loading/error</span>
                  </li>
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Kriteria selesai terukur dan file SPEC.md siap unduh</span>
                  </li>
                  <li>
                    <Check size={14} aria-hidden="true" />
                    <span>Prompt eksekusi mandiri siap ditempel ke coding assistant</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        <p className="ag-result-note">
          Periksa kembali path file, dependensi, dan batasan proyek sebelum menjalankan kode dari AI.
        </p>
      </section>
    </div>
  )
}
