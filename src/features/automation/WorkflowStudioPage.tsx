import React from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  TriggerNode,
  RadarNode,
  AiGenNode,
  AiAgentNode,
  PublisherNode,
  CodeNode,
  GenericNode,
} from './CustomNodes'
import { NodeSettingsPanel } from './NodeSettingsPanel'
import {
  Play,
  Save,
  Clock,
  Radar,
  Sparkles,
  Send,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Plus,
  Trash2,
  Bot,
  Code,
  FolderGit2,
  X,
} from 'lucide-react'

const nodeTypes = {
  trigger: TriggerNode,
  radar: RadarNode,
  aiGenerator: AiGenNode,
  aiAgent: AiAgentNode,
  publisher: PublisherNode,
  code: CodeNode,
  generic: GenericNode,
}

interface WorkflowItem {
  id: string
  name: string
  description?: string
  is_active?: number
  updated_at?: string
}

export function WorkflowStudioPage() {
  const [workflows, setWorkflows] = React.useState<WorkflowItem[]>([])
  const [workflowId, setWorkflowId] = React.useState<string>('')
  const [workflowName, setWorkflowName] = React.useState<string>('')
  const [nodes, setNodes] = React.useState<Node[]>([])
  const [edges, setEdges] = React.useState<Edge[]>([])
  const [selectedNode, setSelectedNode] = React.useState<Node | null>(null)

  const [isSaving, setIsSaving] = React.useState(false)
  const [isRunning, setIsRunning] = React.useState(false)
  const [runLogs, setRunLogs] = React.useState<any[]>([])
  const [activeTab, setActiveTab] = React.useState<'canvas' | 'logs'>('canvas')

  // Project selector & creation modal states
  const [dropdownOpen, setDropdownOpen] = React.useState(false)
  const [newModalOpen, setNewModalOpen] = React.useState(false)
  const [newProjectName, setNewProjectName] = React.useState('')
  const [newProjectDesc, setNewProjectDesc] = React.useState('')
  const [newProjectTemplate, setNewProjectTemplate] = React.useState('ig-autopost')

  // Load a specific workflow's nodes & edges
  const loadWorkflowDetail = React.useCallback(async (id: string) => {
    try {
      const detailRes = await fetch(`/api/workflows/${id}`)
      const detail = await detailRes.json()
      if (detail.workflow) {
        setWorkflowId(detail.workflow.id)
        setWorkflowName(detail.workflow.name)
        setNodes(detail.workflow.nodes || [])
        setEdges(detail.workflow.edges || [])
        setSelectedNode(null)
      }
    } catch (err) {
      console.error('Failed to load workflow detail:', err)
    }
  }, [])

  // Load list of all workflows
  const fetchWorkflows = React.useCallback(async (selectId?: string) => {
    try {
      const res = await fetch('/api/workflows')
      const data = await res.json()
      if (Array.isArray(data.workflows)) {
        setWorkflows(data.workflows)
        const targetId = selectId || data.workflows[0]?.id
        if (targetId) {
          await loadWorkflowDetail(targetId)
        }
      }
    } catch (err) {
      console.error('Failed to load workflows list:', err)
    }
  }, [loadWorkflowDetail])

  React.useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  const onNodesChange = React.useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  )

  const onEdgesChange = React.useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  )

  const onConnect = React.useCallback(
    (connection: Connection) => setEdges((eds) => addEdge({ ...connection, animated: true }, eds)),
    []
  )

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }

  const updateNodeData = (id: string, newData: any) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          const updated = { ...n, data: newData }
          setSelectedNode(updated)
          return updated
        }
        return n
      })
    )
  }

  const deleteNode = (id: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    setSelectedNode(null)
  }

  const addNode = (type: 'trigger' | 'aiAgent' | 'radar' | 'aiGenerator' | 'code' | 'publisher') => {
    const id = `${type}-${Date.now().toString().slice(-4)}`
    const defaultConfigs: Record<string, any> = {
      trigger: {
        label: 'Schedule Trigger',
        interval: 'Setiap Hari 10:00',
        cron: '0 10 * * *',
      },
      aiAgent: {
        label: 'Autonomous AI Agent',
        role: 'Research & Analyst',
        aiModel: 'claude-sonnet-5-5',
        aiPrompt: 'Analisis tren game terkini dan susun strategi konten yang actionable.',
      },
      radar: {
        label: 'Roblox Trend Radar',
        targetGames: ['Blox Fruits', 'Fisch', 'GAG2'],
        strategy: 'pilar_edukasi_pemula',
      },
      aiGenerator: {
        label: 'Visual & Caption AI',
        aiModel: 'gemini-3.7-flash-high',
        aspectRatio: '4:5 (1080x1350)',
        qualityControl: true,
      },
      code: {
        label: 'Custom Script Action',
        scriptName: 'main_auto_pipeline.py',
      },
      publisher: {
        label: 'Instagram Publisher',
        targetAccount: '@bluudzstore',
        format: 'carousel',
      },
    }

    const newNode: Node = {
      id,
      type,
      position: { x: 300 + Math.random() * 120, y: 150 + Math.random() * 80 },
      data: defaultConfigs[type] || { label: 'Action Node' },
    }

    setNodes((nds) => [...nds, newNode])
    setSelectedNode(newNode)
  }

  const saveWorkflow = async () => {
    if (!workflowId) return
    setIsSaving(true)
    try {
      await fetch(`/api/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflowName,
          nodes,
          edges,
        }),
      })
      const res = await fetch('/api/workflows')
      const data = await res.json()
      if (Array.isArray(data.workflows)) setWorkflows(data.workflows)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim()) return
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          description: newProjectDesc.trim(),
          template: newProjectTemplate,
        }),
      })
      const created = await res.json()
      setNewModalOpen(false)
      setNewProjectName('')
      setNewProjectDesc('')
      await fetchWorkflows(created.id)
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const handleDeleteProject = async (id: string, name: string) => {
    if (!confirm(`Hapus project bot "${name}"? Tindakan ini tidak dapat dibatalkan.`)) return
    try {
      await fetch(`/api/workflows/${id}`, { method: 'DELETE' })
      const remaining = workflows.filter((w) => w.id !== id)
      setWorkflows(remaining)
      if (remaining.length > 0) {
        await loadWorkflowDetail(remaining[0].id)
      } else {
        setWorkflowId('')
        setWorkflowName('')
        setNodes([])
        setEdges([])
      }
    } catch (err) {
      console.error('Failed to delete workflow:', err)
    }
  }

  const triggerRun = async () => {
    if (!workflowId) return
    setIsRunning(true)
    setActiveTab('logs')
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.logs) {
        setRunLogs(data.logs)
      }
    } catch (err) {
      console.error('Run failed:', err)
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-background text-foreground">
      {/* Top Action & Project Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-card/70 px-6 py-2.5 backdrop-blur-md">
        {/* Project Selector Dropdown */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl border border-border/80 bg-background/80 px-3 py-1.5 text-left shadow-sm hover:border-primary/50 transition-all"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FolderGit2 className="h-4 w-4" />
              </div>
              <div className="max-w-[200px] truncate sm:max-w-[260px]">
                <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Bot Project
                </div>
                <div className="truncate text-xs font-bold text-foreground">
                  {workflowName || 'Pilih Project'}
                </div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-1" />
            </button>

            {dropdownOpen && (
              <div className="absolute top-full left-0 z-50 mt-1.5 w-72 rounded-xl border border-border/80 bg-card/95 p-1.5 shadow-2xl backdrop-blur-lg">
                <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Daftar Project Bot ({workflows.length})
                </div>

                <div className="max-h-56 overflow-y-auto space-y-0.5">
                  {workflows.map((w) => (
                    <div
                      key={w.id}
                      className={`group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        w.id === workflowId
                          ? 'bg-primary/15 text-primary font-semibold'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <button
                        onClick={() => {
                          loadWorkflowDetail(w.id)
                          setDropdownOpen(false)
                        }}
                        className="flex-1 truncate text-left"
                      >
                        {w.name}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteProject(w.id, w.name)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive"
                        title="Hapus Project"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="border-t border-border/50 pt-1 mt-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false)
                      setNewModalOpen(true)
                    }}
                    className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    + Buat Project Bot Baru
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Node Toolbar & Execution Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Node Adders */}
          <div className="hidden lg:flex items-center gap-1 border-r border-border/70 pr-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('trigger')}
              className="gap-1 text-xs h-8"
              title="Tambah Trigger Schedule"
            >
              <Clock className="h-3 w-3 text-amber-500" />
              + Trigger
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('aiAgent')}
              className="gap-1 text-xs h-8"
              title="Tambah Autonomous AI Agent"
            >
              <Bot className="h-3 w-3 text-indigo-500" />
              + AI Agent
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('radar')}
              className="gap-1 text-xs h-8"
              title="Tambah Trend Radar"
            >
              <Radar className="h-3 w-3 text-sky-500" />
              + Radar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('aiGenerator')}
              className="gap-1 text-xs h-8"
              title="Tambah Visual & Copy AI"
            >
              <Sparkles className="h-3 w-3 text-purple-500" />
              + AI Gen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('code')}
              className="gap-1 text-xs h-8"
              title="Tambah Python Script Node"
            >
              <Code className="h-3 w-3 text-cyan-500" />
              + Script
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addNode('publisher')}
              className="gap-1 text-xs h-8"
              title="Tambah Publisher Instagram"
            >
              <Send className="h-3 w-3 text-emerald-500" />
              + Publish
            </Button>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center rounded-lg border border-border/60 bg-muted/30 p-0.5">
            <button
              onClick={() => setActiveTab('canvas')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                activeTab === 'canvas'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Canvas ({nodes.length})
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
                activeTab === 'logs'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Console ({runLogs.length})
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={saveWorkflow}
            disabled={isSaving}
            className="gap-1.5 text-xs h-8"
          >
            <Save className="h-3.5 w-3.5" />
            {isSaving ? 'Menyimpan...' : 'Simpan'}
          </Button>

          <Button
            size="sm"
            onClick={triggerRun}
            disabled={isRunning}
            className="gap-1.5 bg-primary text-xs text-primary-foreground shadow-md h-8"
          >
            <Play className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            {isRunning ? 'Menjalankan...' : 'Test Run'}
          </Button>
        </div>
      </div>

      {/* Main Workspace Area */}
      <div className="relative flex-1 overflow-hidden">
        {activeTab === 'canvas' ? (
          <div className="h-full w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              className="bg-dot-grid"
            >
              <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              <Controls className="!bg-card !border-border !text-foreground shadow-md" />
            </ReactFlow>

            {/* Right-hand side node config panel */}
            <NodeSettingsPanel
              node={selectedNode}
              onUpdate={updateNodeData}
              onDelete={deleteNode}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Riwayat & Status Eksekusi Terakhir
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Log setiap node, model AI yang dipanggil, serta hasil eksekusi.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRunLogs([])}
                  className="gap-1 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Clear Console
                </Button>
              </div>

              {runLogs.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <Play className="h-6 w-6 ml-0.5" />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Belum ada eksekusi pipeline aktif
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    Klik tombol "Test Run" di atas untuk menjalankan setiap node dan model AI secara berurutan.
                  </p>
                </Card>
              ) : (
                <div className="space-y-2 font-mono text-xs">
                  {runLogs.map((log, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 rounded-lg border p-3 ${
                        log.status === 'success'
                          ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400'
                          : log.status === 'warning'
                          ? 'border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400'
                          : 'border-border/70 bg-card text-foreground'
                      }`}
                    >
                      {log.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 text-amber-500 mt-0.5" />
                      )}
                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold uppercase tracking-wider text-[10px] opacity-75">
                            [{log.step}]
                          </span>
                          <span className="text-[10px] text-muted-foreground">{log.time}</span>
                        </div>
                        <p className="text-xs leading-relaxed">{log.message}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal: Buat Project Bot Baru */}
      {newModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <Card className="w-full max-w-md border-border/80 bg-card p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" />
                </div>
                <h2 className="text-base font-bold text-foreground">Buat Project Bot Baru</h2>
              </div>
              <button
                onClick={() => setNewModalOpen(false)}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4 pt-4 text-xs">
              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Nama Project Bot</label>
                <Input
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="cth: Telegram Auto-Reply Bot, Price Monitor..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Deskripsi (Opsional)</label>
                <Input
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  placeholder="Tujuan atau alur bot ini..."
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="font-semibold text-foreground">Template Awal</label>
                <select
                  value={newProjectTemplate}
                  onChange={(e) => setNewProjectTemplate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs text-foreground"
                >
                  <option value="ig-autopost">Pipeline Auto-Post Instagram (Radar + Visual + Publish)</option>
                  <option value="ai-researcher">Multi-Agent AI Researcher (Analyst + Copywriter)</option>
                  <option value="blank">Kanvas Kosong (Blank Workflow)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewModalOpen(false)}
                  className="text-xs"
                >
                  Batal
                </Button>
                <Button type="submit" size="sm" className="bg-primary text-xs text-primary-foreground">
                  Buat Project
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
