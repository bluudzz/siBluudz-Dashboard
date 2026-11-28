import { createElement } from 'react'
import { AlertTriangle, Check, Clock, Eye, RefreshCw } from 'lucide-react'
import { isSubNode } from '../../../shared/workflow-connections'
import { WorkflowDataViewer } from './WorkflowDataViewer'
import { iconForWorkflowNode } from './workflow-node-icons'
import type { NodeResult, RunItem, StudioNode } from './workflow-model'

interface PanelNodeEntry {
  nodeId: string
  label: string
  nodeType?: string
  result?: NodeResult
}

function formatDuration(ms?: number): string {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return '0 ms'
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} dtk`
}

function formatRunTime(startedAt: string): string {
  if (!startedAt) return '—'
  const date = new Date(startedAt.includes('T') ? startedAt : `${startedAt.replace(' ', 'T')}Z`)
  return Number.isNaN(date.getTime()) ? startedAt : date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
}

function runStatusLabel(status: string): string {
  if (status === 'error') return 'Error'
  if (status === 'cancelled') return 'Dihentikan'
  if (status === 'waiting_approval') return 'Menunggu persetujuan'
  return 'Selesai'
}

function buildPanelNodes(nodes: StudioNode[], nodeResults: Record<string, NodeResult>): PanelNodeEntry[] {
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const entries: PanelNodeEntry[] = []
  const seen = new Set<string>()

  for (const result of Object.values(nodeResults)) {
    const graphNode = nodeById.get(result.nodeId)
    entries.push({
      nodeId: result.nodeId,
      label: String(graphNode?.data?.label || result.label || result.nodeId),
      nodeType: graphNode?.type,
      result,
    })
    seen.add(result.nodeId)
  }

  const remaining = nodes
    .filter(node => !seen.has(node.id) && !isSubNode(node.type))
    .slice()
    .sort((a, b) => (a.position.x - b.position.x) || (a.position.y - b.position.y))

  for (const node of remaining) {
    entries.push({
      nodeId: node.id,
      label: String(node.data?.label || node.type || node.id),
      nodeType: node.type,
      result: undefined,
    })
  }

  return entries
}

function StatusGlyph({ status }: { status?: string }) {
  if (status === 'error') return <AlertTriangle size={13} />
  if (status === 'waiting') return <Clock size={13} />
  if (status === 'success' || status === 'simulated' || status === 'pinned') return <Check size={13} />
  return <span className="wf-history-node-dot" aria-hidden="true" />
}

export function WorkflowHistoryPanel({
  runs,
  runsLoading,
  nodes,
  viewedRunId,
  viewedNodeId,
  onRefresh,
  onSelectRun,
  onSelectNode,
  onRestoreRun,
  triggerTypeLabel,
  liveStatusText,
}: {
  runs: RunItem[]
  runsLoading: boolean
  nodes: StudioNode[]
  viewedRunId: string
  viewedNodeId: string
  onRefresh: () => void
  onSelectRun: (run: RunItem) => void
  onSelectNode: (nodeId: string) => void
  onRestoreRun: (run: RunItem) => void
  triggerTypeLabel: (type: string) => string
  liveStatusText: (status: string) => string
}) {
  const viewedRun = runs.find(run => run.id === viewedRunId) || runs[0]
  const viewedResults = viewedRun?.result?.nodeResults || {}
  const panelNodes = viewedRun ? buildPanelNodes(nodes, viewedResults) : []
  const activeEntry = panelNodes.find(entry => entry.nodeId === viewedNodeId) || panelNodes[0]
  const activeResult = activeEntry?.result

  return (
    <div className="wf-executions">
      <header>
        <div>
          <h2>Riwayat Pengujian</h2>
          <p className="wf-muted">Pilih mulai uji di kiri, klik node di panel atas untuk melihat hasil atau error, lalu klik Show uji untuk mengembalikannya ke kanvas workflow.</p>
        </div>
        <button type="button" disabled={runsLoading} onClick={onRefresh}>
          <RefreshCw size={14} />
          Muat ulang
        </button>
      </header>

      {runsLoading ? (
        <p role="status">Memuat riwayat…</p>
      ) : !runs.length ? (
        <div className="wf-empty-history">
          <h3>Belum ada eksekusi</h3>
          <p>Klik Jalankan alur di editor untuk merekam input dan output setiap node.</p>
        </div>
      ) : (
        <div className="wf-history-grid">
          <div className="wf-run-list" aria-label="Daftar mulai uji">
            {runs.map(item => {
              const resultsList = Object.values(item.result?.nodeResults || {})
              const errorCount = resultsList.filter(r => r.status === 'error').length
              const active = viewedRun?.id === item.id
              return (
                <article key={item.id} className={`wf-run-card${active ? ' is-active' : ''}`}>
                  <button
                    type="button"
                    className="wf-run-select"
                    aria-pressed={active}
                    onClick={() => onSelectRun(item)}
                  >
                    <strong>
                      <span className={`wf-history-status status-${item.status}`}>{runStatusLabel(item.status)}</span>
                      {' · '}
                      {triggerTypeLabel(item.trigger_type)}
                    </strong>
                    <span>{formatRunTime(item.started_at)}</span>
                    <span>
                      {resultsList.length} node dikerjakan
                      {errorCount > 0 ? ` · ${errorCount} error` : ''}
                    </span>
                  </button>
                  <div className="wf-run-card-actions">
                    <button
                      type="button"
                      className="wf-run-show-btn"
                      onClick={() => onRestoreRun(item)}
                      title="Kembalikan hasil pengujian ini ke kanvas workflow"
                    >
                      <Eye size={13} />
                      Show uji
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <section className="wf-run-detail" aria-label="Detail hasil mulai uji">
            {viewedRun && (
              <>
                <header className="wf-run-detail-header">
                  <div>
                    <h3>Detail pengujian</h3>
                    <p className="wf-muted">
                      {formatRunTime(viewedRun.started_at)} · {triggerTypeLabel(viewedRun.trigger_type)}
                    </p>
                  </div>
                  <div className="wf-run-detail-actions">
                    <span className={`wf-history-status status-${viewedRun.status}`}>
                      {runStatusLabel(viewedRun.status)}
                    </span>
                    <button
                      type="button"
                      className="wf-run-show-btn"
                      onClick={() => onRestoreRun(viewedRun)}
                      title="Kembalikan hasil pengujian ini ke kanvas workflow"
                    >
                      <Eye size={13} />
                      Show uji ke Workflow
                    </button>
                  </div>
                </header>

                {panelNodes.length > 0 && (
                  <div className="wf-history-node-panel" role="tablist" aria-label="Panel node workflow">
                    {panelNodes.map(entry => {
                      const status = entry.result?.status || 'unrun'
                      const selected = activeEntry?.nodeId === entry.nodeId
                      return (
                        <button
                          key={entry.nodeId}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          className={`wf-history-node-tab status-${status}${selected ? ' is-selected' : ''}`}
                          onClick={() => onSelectNode(entry.nodeId)}
                        >
                          <span className="wf-history-node-tab-icon">
                            {createElement(iconForWorkflowNode(entry.nodeType), { size: 15 })}
                          </span>
                          <span className="wf-history-node-tab-copy">
                            <strong>{entry.label}</strong>
                            <span>
                              <StatusGlyph status={entry.result?.status} />
                              {entry.result
                                ? `${liveStatusText(entry.result.status)} · ${formatDuration(entry.result.durationMs)}`
                                : 'Tidak dijalankan'}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {!panelNodes.length ? (
                  <p className="wf-muted">Pengujian ini belum memiliki rincian node yang tersimpan.</p>
                ) : !activeEntry ? null : !activeResult ? (
                  <div className="wf-history-unrun">
                    <strong>{activeEntry.label}</strong>
                    <p className="wf-muted">
                      Node ini tidak dijalankan pada pengujian ini (alur berhenti pada langkah sebelumnya atau berada di cabang lain).
                    </p>
                  </div>
                ) : (
                  <div className="wf-history-node-body">
                    <div className="wf-history-node-head">
                      <div>
                        <h4>{activeEntry.label}</h4>
                        <p className="wf-history-node-meta">
                          <span className={`wf-history-status status-${activeResult.status}`}>
                            {liveStatusText(activeResult.status)}
                          </span>
                          <span> · {formatDuration(activeResult.durationMs)} · {activeResult.output.length} hasil</span>
                        </p>
                      </div>
                    </div>

                    {(activeResult.error || activeResult.status === 'error') && (
                      <div role="alert" className="wf-history-error-box">
                        <AlertTriangle size={16} />
                        <div>
                          <strong>Error pada node &ldquo;{activeEntry.label}&rdquo;</strong>
                          <p>{activeResult.error || 'Terjadi kesalahan saat menjalankan langkah ini.'}</p>
                        </div>
                      </div>
                    )}

                    {activeResult.message && <p className="wf-inline-note">{activeResult.message}</p>}

                    <div className="wf-history-output">
                      <h4>Hasil kerja node</h4>
                      {activeResult.output.length > 0 ? (
                        <WorkflowDataViewer
                          key={`${viewedRun.id}-${activeEntry.nodeId}`}
                          items={activeResult.output}
                          nodeType={activeEntry.nodeType}
                        />
                      ) : (
                        <p className="wf-muted">
                          {activeResult.status === 'error'
                            ? 'Node berhenti karena error sebelum menghasilkan output.'
                            : 'Langkah selesai tanpa data output.'}
                        </p>
                      )}
                    </div>

                    <details
                      className="wf-history-input"
                      key={`${viewedRun.id}-${activeEntry.nodeId}-in`}
                      open={Boolean(activeResult.error && activeResult.input.length)}
                    >
                      <summary>
                        Bahan masuk <span>{activeResult.input.length} item</span>
                      </summary>
                      {activeResult.input.length ? (
                        <WorkflowDataViewer items={activeResult.input} />
                      ) : (
                        <p className="wf-muted">Langkah ini dimulai tanpa bahan masuk.</p>
                      )}
                    </details>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
