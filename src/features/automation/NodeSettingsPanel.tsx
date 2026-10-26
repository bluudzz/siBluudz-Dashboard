import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Trash2, X, Sliders, Sparkles, Bot, Code, Send, Clock, Radar } from 'lucide-react'

interface NodePanelProps {
  node: any | null
  onUpdate: (id: string, updatedData: any) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const POPULAR_AI_MODELS = [
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (Visual & Fast)' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5 (Creative Copy & Hook)' },
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (High Reasoning)' },
  { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner (Deep Logic & Radar)' },
  { id: 'deepseek-v4-flash', name: 'DeepSeek v4 Flash (Speed & Scrape)' },
  { id: 'gpt-5.6-luna', name: 'GPT 5.6 Luna (General Multi-Task)' },
  { id: 'qwen2.5-14b', name: 'Qwen 2.5 14B (Fast Open Weights)' },
]

export function NodeSettingsPanel({ node, onUpdate, onDelete, onClose }: NodePanelProps) {
  if (!node) return null

  const data = node.data || {}

  const handleChange = (key: string, value: any) => {
    onUpdate(node.id, {
      ...data,
      [key]: value,
    })
  }

  const isAiPrimary = node.type === 'aiGenerator' || node.type === 'aiAgent'
  const isAiEnabled = isAiPrimary || Boolean(data.aiEnabled)

  return (
    <Card className="absolute top-4 right-4 z-20 w-84 max-h-[calc(100vh-6rem)] overflow-y-auto border-border/80 bg-card/95 shadow-2xl backdrop-blur-md">
      <CardHeader className="sticky top-0 z-10 flex flex-row items-center justify-between border-b border-border/50 bg-card/95 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <Sliders className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-semibold">Node Settings</CardTitle>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>

      <CardContent className="space-y-4 pt-4 text-xs">
        {/* Label Node */}
        <div className="space-y-1">
          <label className="font-medium text-foreground">Nama Node</label>
          <Input
            value={data.label || ''}
            onChange={(e) => handleChange('label', e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {/* AI Model Section (n8n Style) */}
        <div className="space-y-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-purple-600 dark:text-purple-400">
              <Sparkles className="h-3.5 w-3.5" />
              <span>AI Engine & Model</span>
            </div>
            {!isAiPrimary && (
              <input
                type="checkbox"
                id="ai-toggle"
                checked={isAiEnabled}
                onChange={(e) => handleChange('aiEnabled', e.target.checked)}
                className="rounded border-input text-primary"
              />
            )}
          </div>

          {isAiEnabled && (
            <div className="space-y-2.5 pt-1">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">Pilih Model AI</label>
                <select
                  value={data.aiModel || data.model || 'gemini-3.7-flash-high'}
                  onChange={(e) => {
                    handleChange('aiModel', e.target.value)
                    handleChange('model', e.target.value)
                  }}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  {POPULAR_AI_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="custom">-- Custom Model 9Router --</option>
                </select>
              </div>

              {(data.aiModel === 'custom' || (!POPULAR_AI_MODELS.some(m => m.id === (data.aiModel || data.model)))) && (
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Custom Model Identifier</label>
                  <Input
                    value={data.aiModel || data.model || ''}
                    onChange={(e) => {
                      handleChange('aiModel', e.target.value)
                      handleChange('model', e.target.value)
                    }}
                    placeholder="cth: claude-sonnet-5-5 atau customendpoint/..."
                    className="h-8 font-mono text-xs"
                  />
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Prompt Khusus Node Ini
                </label>
                <textarea
                  value={data.aiPrompt || ''}
                  onChange={(e) => handleChange('aiPrompt', e.target.value)}
                  placeholder="cth: Analisis data tren Roblox di atas dan ekstrak 1 hook kontroversial tanpa spoiler..."
                  rows={3}
                  className="w-full rounded-md border border-input bg-background p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}
        </div>

        {/* Trigger Node Settings */}
        {node.type === 'trigger' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span>Jadwal Trigger</span>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Label Interval</label>
              <Input
                value={data.interval || ''}
                onChange={(e) => handleChange('interval', e.target.value)}
                placeholder="cth: Setiap Hari (10:00 WIB)"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Cron Expression</label>
              <Input
                value={data.cron || ''}
                onChange={(e) => handleChange('cron', e.target.value)}
                placeholder="0 10 * * *"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Radar Node Settings */}
        {node.type === 'radar' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Radar className="h-3.5 w-3.5 text-sky-500" />
              <span>Parameter Radar</span>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Target Games (Pisahkan koma)</label>
              <Input
                value={Array.isArray(data.targetGames) ? data.targetGames.join(', ') : ''}
                onChange={(e) =>
                  handleChange(
                    'targetGames',
                    e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                  )
                }
                placeholder="Blox Fruits, Fisch, GAG2"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Pilar Konten Utama</label>
              <select
                value={data.strategy || 'pilar_edukasi_pemula'}
                onChange={(e) => handleChange('strategy', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="pilar_edukasi_pemula">Edukasi Pemula (40%)</option>
                <option value="pilar_trik_mekanik">Trik & Mekanik Rahasia (35%)</option>
                <option value="pilar_hype_viral">Hype & Viral Update (25%)</option>
              </select>
            </div>
          </div>
        )}

        {/* AI Agent Node Settings */}
        {node.type === 'aiAgent' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Bot className="h-3.5 w-3.5 text-indigo-500" />
              <span>Konfigurasi Autonomous Agent</span>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Peran / Role Agent</label>
              <Input
                value={data.role || ''}
                onChange={(e) => handleChange('role', e.target.value)}
                placeholder="cth: Copywriter TikTok, Riset Market, Data Cleaner"
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {/* AI Visual Gen Settings */}
        {node.type === 'aiGenerator' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="space-y-1">
              <label className="font-medium text-foreground">Format Rasio</label>
              <select
                value={data.aspectRatio || '4:5 (1080x1350)'}
                onChange={(e) => handleChange('aspectRatio', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="4:5 (1080x1350)">Feed Portrait (4:5)</option>
                <option value="1:1 (1080x1080)">Square (1:1)</option>
                <option value="9:16 (1080x1920)">Story / Reel (9:16)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="qc-toggle"
                checked={Boolean(data.qualityControl)}
                onChange={(e) => handleChange('qualityControl', e.target.checked)}
                className="rounded border-input text-primary"
              />
              <label htmlFor="qc-toggle" className="text-xs text-foreground">
                Aktifkan Quality Control Visual (Auto-Reject Bad Output)
              </label>
            </div>
          </div>
        )}

        {/* Code / Script Node Settings */}
        {node.type === 'code' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Code className="h-3.5 w-3.5 text-cyan-500" />
              <span>Script Python / Shell</span>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Path / Nama Script</label>
              <Input
                value={data.scriptName || ''}
                onChange={(e) => handleChange('scriptName', e.target.value)}
                placeholder="cth: main_auto_pipeline.py"
                className="h-8 font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Publisher Settings */}
        {node.type === 'publisher' && (
          <div className="space-y-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Send className="h-3.5 w-3.5 text-emerald-500" />
              <span>Pengaturan Publikasi</span>
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Akun Target</label>
              <Input
                value={data.targetAccount || '@bluudzstore'}
                onChange={(e) => handleChange('targetAccount', e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-foreground">Format Post</label>
              <select
                value={data.format || 'carousel'}
                onChange={(e) => handleChange('format', e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs text-foreground"
              >
                <option value="carousel">Multi-Slide Carousel</option>
                <option value="single">Single Feed Post</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="approval-toggle"
                checked={Boolean(data.requireApproval)}
                onChange={(e) => handleChange('requireApproval', e.target.checked)}
                className="rounded border-input text-primary"
              />
              <label htmlFor="approval-toggle" className="text-xs text-foreground">
                Tahan untuk Review (Manual Approval sebelum Publish)
              </label>
            </div>
          </div>
        )}

        {/* Delete Action */}
        <div className="pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(node.id)}
            className="w-full justify-center gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Hapus Node Ini
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
