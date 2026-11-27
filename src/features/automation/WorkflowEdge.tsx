import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react'
import { Plus, X } from 'lucide-react'

export interface WorkflowEdgeData extends Record<string, unknown> {
  isAi?: boolean
  flowState?: 'idle' | 'running' | 'success' | 'error'
  branchLabel?: string
  hovered?: boolean
  busy?: boolean
  onHoverChange?: (edgeId: string | null) => void
  onInsert?: (edgeId: string) => void
  onDelete?: (edgeId: string) => void
}

export type StudioEdge = Edge<WorkflowEdgeData>

export function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
  data,
}: EdgeProps<StudioEdge>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.38,
  })

  const flowState = data?.flowState || 'idle'
  const isAi = Boolean(data?.isAi)
  const branchLabel = typeof data?.branchLabel === 'string' ? data.branchLabel : ''
  const showActions = !data?.busy && (Boolean(selected) || Boolean(data?.hovered))
  const edgeClassName = [
    'wf-edge-path',
    isAi ? 'is-ai' : '',
    `is-${flowState}`,
    selected ? 'is-selected' : '',
    data?.hovered ? 'is-hovered' : '',
  ].filter(Boolean).join(' ')

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        interactionWidth={26}
        className={edgeClassName}
        style={{
          ...style,
          strokeDasharray: isAi ? '6 5' : style?.strokeDasharray,
        }}
      />
      {(branchLabel || showActions) && (
        <EdgeLabelRenderer>
          <div
            className="wf-edge-overlay nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            onMouseEnter={() => data?.onHoverChange?.(id)}
            onMouseLeave={() => data?.onHoverChange?.(null)}
          >
            {showActions ? (
              <div className="wf-edge-actions">
                {!isAi && (
                  <button
                    type="button"
                    className="wf-edge-btn wf-edge-btn-add"
                    aria-label="Sisipkan node di koneksi ini"
                    title="Sisipkan node"
                    onClick={event => {
                      event.stopPropagation()
                      data?.onInsert?.(id)
                    }}
                  >
                    <Plus size={12} />
                  </button>
                )}
                <button
                  type="button"
                  className="wf-edge-btn wf-edge-btn-del"
                  aria-label="Putuskan koneksi"
                  title="Putuskan koneksi"
                  onClick={event => {
                    event.stopPropagation()
                    data?.onDelete?.(id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <span className={`wf-edge-branch is-${flowState}`}>{branchLabel}</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
