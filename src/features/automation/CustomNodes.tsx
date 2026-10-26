import { Handle, Position } from '@xyflow/react'
import { Clock, Radar, Sparkles, Send, Settings, Bot, Code, type LucideIcon } from 'lucide-react'

interface CustomNodeProps {
  data: {
    label: string
    aiEnabled?: boolean
    aiModel?: string
    model?: string
    [key: string]: any
  }
  selected?: boolean
}

function BaseNode({
  title,
  subtitle,
  icon: Icon,
  color,
  aiModel,
  hasTarget = true,
  hasSource = true,
  selected = false,
}: {
  title: string
  subtitle: string
  icon: LucideIcon
  color: string
  aiModel?: string
  hasTarget?: boolean
  hasSource?: boolean
  selected?: boolean
}) {
  return (
    <div
      className={`relative min-w-[230px] max-w-[280px] rounded-xl border-2 bg-card p-3 shadow-lg transition-all ${
        selected ? 'border-primary ring-2 ring-primary/30' : 'border-border/80 hover:border-primary/50'
      }`}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !bg-muted-foreground hover:!bg-primary"
        />
      )}

      <div className="flex items-start gap-2.5">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 overflow-hidden text-left">
          <div className="truncate text-xs font-bold text-foreground">{title}</div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>

          {/* AI Model Badge */}
          {aiModel && (
            <div className="mt-1.5 flex items-center gap-1 rounded bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-purple-600 dark:text-purple-400">
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{aiModel.replace(/^customendpoint\/9Router-Tencent\//, '')}</span>
            </div>
          )}
        </div>
      </div>

      {hasSource && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !bg-muted-foreground hover:!bg-primary"
        />
      )}
    </div>
  )
}

export function TriggerNode({ data, selected }: CustomNodeProps) {
  const model = data.aiEnabled ? data.aiModel : undefined
  return (
    <BaseNode
      title={data.label || 'Schedule Trigger'}
      subtitle={data.interval || 'Setiap Hari 10:00'}
      icon={Clock}
      color="bg-amber-500/15 text-amber-500"
      aiModel={model}
      hasTarget={false}
      hasSource={true}
      selected={selected}
    />
  )
}

export function RadarNode({ data, selected }: CustomNodeProps) {
  const gamesCount = Array.isArray(data.targetGames) ? data.targetGames.length : 1
  const model = data.aiEnabled ? (data.aiModel || 'deepseek-reasoner') : undefined
  return (
    <BaseNode
      title={data.label || 'Trend Radar'}
      subtitle={`${gamesCount} Game Terpantau`}
      icon={Radar}
      color="bg-sky-500/15 text-sky-500"
      aiModel={model}
      selected={selected}
    />
  )
}

export function AiGenNode({ data, selected }: CustomNodeProps) {
  const model = data.model || data.aiModel || 'gemini-3.7-flash-high'
  return (
    <BaseNode
      title={data.label || 'AI Visual & Copy'}
      subtitle={data.aspectRatio || '4:5 (1080x1350)'}
      icon={Sparkles}
      color="bg-purple-500/15 text-purple-500"
      aiModel={model}
      selected={selected}
    />
  )
}

export function AiAgentNode({ data, selected }: CustomNodeProps) {
  const model = data.aiModel || data.model || 'claude-sonnet-5-5'
  return (
    <BaseNode
      title={data.label || 'Autonomous AI Agent'}
      subtitle={data.role || 'Content Strategist'}
      icon={Bot}
      color="bg-indigo-500/15 text-indigo-500"
      aiModel={model}
      selected={selected}
    />
  )
}

export function PublisherNode({ data, selected }: CustomNodeProps) {
  const model = data.aiEnabled ? data.aiModel : undefined
  return (
    <BaseNode
      title={data.label || 'Instagram Publisher'}
      subtitle={data.targetAccount || '@bluudzstore'}
      icon={Send}
      color="bg-emerald-500/15 text-emerald-500"
      aiModel={model}
      hasSource={false}
      selected={selected}
    />
  )
}

export function CodeNode({ data, selected }: CustomNodeProps) {
  const model = data.aiEnabled ? data.aiModel : undefined
  return (
    <BaseNode
      title={data.label || 'Custom Script / Python'}
      subtitle={data.scriptName || 'main_auto_pipeline.py'}
      icon={Code}
      color="bg-cyan-500/15 text-cyan-500"
      aiModel={model}
      selected={selected}
    />
  )
}

export function GenericNode({ data, selected }: CustomNodeProps) {
  const model = data.aiEnabled ? data.aiModel : undefined
  return (
    <BaseNode
      title={data.label || 'Action Node'}
      subtitle="Custom Task"
      icon={Settings}
      color="bg-slate-500/15 text-slate-500"
      aiModel={model}
      selected={selected}
    />
  )
}
