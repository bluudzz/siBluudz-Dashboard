import * as React from 'react'
import { ArrowUpRight, Check, ChevronDown, Copy, Download, History, ImagePlus, RefreshCw, Search, Send, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useUser } from '@/context/UserContext'
import './ai-generator.css'

interface ModelCatalogEntry {
  id: string
  owner?: string
  contextWindow?: number
  maxOutput?: number
  vision?: boolean
  tools?: boolean
  reasoning?: boolean
  imageOutput?: boolean
}

interface AiStatus {
  configured: boolean
  model: string
  baseUrl: string
  tier: 'free' | 'pro'
  role: 'admin' | 'user'
  dailyLimit: number
  usageToday: number
  remaining: number
  isUnlimited: boolean
  availableModels?: string[]
  catalog?: ModelCatalogEntry[]
  syncedAt?: string
  imageModel?: string
}

export interface ReframedData {
  crescendo: string[]
  policy_puppetry: string
  cognitive_reframing: string
  prefill_prompt: string
}

type GeneratorMode =
  | 'prompt_reframer'
  | 'product_swap'
  | 'prompt_builder'
  | 'image_prompt'
  | 'video_prompt'
  | 'prompt_checker'
  | 'prompt_optimizer'
  | 'humanizer'
  | 'website_prompt'
  | 'invoice_items'
  | 'proposal_structure'
  | 'follow_up_message'

const generatorTools: { mode: GeneratorMode; title: string; description: string; tag?: string }[] = [
  {
    mode: 'prompt_reframer',
    title: 'Prompt Reframer (Agent)',
    description: '4 arsitektur prompt teknis otomatis khusus untuk Autonomous Hermes Agent.',
    tag: 'Hermes Engine',
  },
  {
    mode: 'product_swap',
    title: 'Ganti Produk di Foto',
    description: 'Unggah foto referensi + foto produk Anda, AI mengganti produknya.',
    tag: 'Image Edit',
  },
  { mode: 'prompt_builder', title: 'Prompt Generator', description: 'Ubah ide menjadi prompt terstruktur untuk AI.' },
  { mode: 'image_prompt', title: 'Image Prompt', description: 'Rancang prompt visual untuk generator gambar.' },
  { mode: 'video_prompt', title: 'Video Prompt', description: 'Tulis arahan adegan dan gerakan kamera.' },
  { mode: 'prompt_checker', title: 'Prompt Checker', description: 'Evaluasi kualitas dan temukan bagian yang kurang.' },
  { mode: 'prompt_optimizer', title: 'Prompt Optimizer', description: 'Perjelas dan tingkatkan prompt yang sudah ada.' },
  { mode: 'humanizer', title: 'AI Humanizer', description: 'Buat teks lebih natural tanpa mengubah makna.' },
  { mode: 'website_prompt', title: 'Website / Coding Prompt', description: 'Susun spesifikasi untuk AI coding assistant.' },
  { mode: 'invoice_items', title: 'Item Invoice', description: 'Rinci jasa menjadi item dan estimasi biaya.' },
  { mode: 'proposal_structure', title: 'Proposal Kerja', description: 'Susun outline proposal dan scope pekerjaan.' },
  { mode: 'follow_up_message', title: 'Follow-up Klien', description: 'Buat pesan WhatsApp atau email profesional.' },
]

const OWNER_LABELS: Record<string, string> = {
  ag: 'Antigravity',
  ds: 'DeepSeek',
  oc: 'OpenCode',
  mmf: 'MiMo',
  combo: 'Combo',
  colab: 'Colab',
}

function getModelProvider(modelName: string, owner?: string): string {
  const key = (owner || modelName.split('/')[0] || '').toLowerCase()
  if (OWNER_LABELS[key]) return OWNER_LABELS[key]

  const lower = modelName.toLowerCase()
  if (lower.includes('claude') || lower.includes('anthropic')) return 'Anthropic'
  if (lower.includes('gpt') || lower.includes('oss')) return 'OpenAI'
  if (lower.includes('gemini') || lower.includes('google')) return 'Google'
  if (lower.includes('deepseek')) return 'DeepSeek'
  if (lower.includes('mimo')) return 'MiMo'
  if (lower.includes('glm')) return 'Zhipu'
  if (lower.includes('llama') || lower.includes('meta')) return 'Meta'
  if (lower.includes('qwen')) return 'Alibaba'
  if (lower.includes('spark') || lower.includes('muse')) return 'Muse'
  return '9router'
}

// Dipakai hanya bila 9router tidak dapat dihubungi dan cache DB kosong.
const FALLBACK_NINEROUTER_MODELS = [
  'ag/gemini-3.8-flash',
  'ag/gemini-3.1-pro-high',
  'ag/claude-sonnet-5-5',
  'ag/claude-opus-5-5',
  'ag/gpt-oss-120b-medium',
  'ds/deepseek-v4-flash',
  'ds/deepseek-v4-pro',
  'ds/deepseek-reasoner',
  'oc/glm-5.3-flash-free',
  'muse-spark',
]

export function AiGeneratorPage() {
  const { profile } = useUser()
  const [aiStatus, setAiStatus] = React.useState<AiStatus | null>(null)
  const [statusLoading, setStatusLoading] = React.useState(true)
  const [statusError, setStatusError] = React.useState('')

  const [mode, setMode] = React.useState<GeneratorMode>('prompt_builder')
  const [inputsByMode, setInputsByMode] = React.useState<Record<string, string>>({})
  const [outputsByMode, setOutputsByMode] = React.useState<Record<string, string>>({})
  const [reframedByMode, setReframedByMode] = React.useState<Record<string, ReframedData | null>>({})

  const promptInput = inputsByMode[mode] || ''
  const setPromptInput = React.useCallback((val: string) => {
    setInputsByMode((prev) => ({ ...prev, [mode]: val }))
  }, [mode])

  const generatedOutput = outputsByMode[mode] || ''
  const setGeneratedOutput = React.useCallback((val: string) => {
    setOutputsByMode((prev) => ({ ...prev, [mode]: val }))
  }, [mode])

  const reframedData = reframedByMode[mode] || null
  const setReframedData = React.useCallback((val: ReframedData | null) => {
    setReframedByMode((prev) => ({ ...prev, [mode]: val }))
  }, [mode])

  const [selectedModel, setSelectedModel] = React.useState<string>(() => {
    try {
      return localStorage.getItem('sibluudz_ai_model') || ''
    } catch {
      return ''
    }
  })
  const [customModels, setCustomModels] = React.useState<string[]>([])
  const [modelsLoading, setModelsLoading] = React.useState(false)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false)
  const [modelCategory, setModelCategory] = React.useState<string>('all')
  const [modelSearch, setModelSearch] = React.useState('')

  const [generating, setGenerating] = React.useState(false)
  const [generationError, setGenerationError] = React.useState('')
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [viewMode, setViewMode] = React.useState<'architectural' | 'raw'>('architectural')
  const [toolSearch, setToolSearch] = React.useState('')
  const historyDialogRef = React.useRef<HTMLDialogElement>(null)

  const [sceneImage, setSceneImage] = React.useState('')
  const [productImage, setProductImage] = React.useState('')
  const [imageResult, setImageResult] = React.useState('')

  // History state
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [historyList, setHistoryList] = React.useState<{ id: string; type: string; model: string; prompt: string; result: string; createdAt: string }[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyError, setHistoryError] = React.useState('')

  const dropdownRef = React.useRef<HTMLDivElement>(null)
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const dialog = historyDialogRef.current
    if (isHistoryOpen && dialog && !dialog.open) dialog.showModal()
    if (!isHistoryOpen && dialog?.open) dialog.close()
  }, [isHistoryOpen])

  const selectTool = (nextMode: GeneratorMode) => {
    if (generating) return
    setMode(nextMode)
    setGenerationError('')
    setCopiedKey(null)
  }

  // Auto-resize textarea to fit content smoothly
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 110), 320)}px`
    }
  }, [promptInput])

  // Close dropdown when clicked outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false)
      }
    }
    if (isModelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isModelDropdownOpen])

  const [modelCatalog, setModelCatalog] = React.useState<ModelCatalogEntry[]>([])

  const fetchStatus = React.useCallback(async () => {
    setStatusLoading(true)
    setStatusError('')
    try {
      const res = await fetch('/api/ai/status', { credentials: 'same-origin' })
      if (!res.ok) {
        throw new Error(`Gagal mengambil status AI (${res.status})`)
      }
      const data: AiStatus = await res.json()
      setAiStatus(data)
      if (Array.isArray(data.availableModels) && data.availableModels.length > 0) {
        setCustomModels(data.availableModels)
      }
      if (Array.isArray(data.catalog)) setModelCatalog(data.catalog)
      setSelectedModel((prev) => {
        if (prev) return prev
        const saved = (() => { try { return localStorage.getItem('sibluudz_ai_model') } catch { return null } })()
        return saved || data.model || 'gpt-4o-mini'
      })
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Gagal memuat status AI')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const res = await fetch('/api/ai/history', { credentials: 'same-origin' })
      if (!res.ok) throw new Error('Riwayat gagal dimuat. Coba lagi.')
      const data = await res.json()
      if (Array.isArray(data?.history)) {
        setHistoryList(data.history)
      }
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Riwayat gagal dimuat.')
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const handleDeleteHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(`/api/ai/history/${id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) throw new Error('Riwayat gagal dihapus. Coba lagi.')
      setHistoryList((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Riwayat gagal dihapus.')
    }
  }

  const handleClearHistory = async () => {
    if (!window.confirm('Hapus seluruh riwayat generasi AI Anda?')) return
    try {
      const res = await fetch('/api/ai/history', { method: 'DELETE', credentials: 'same-origin' })
      if (!res.ok) throw new Error('Riwayat gagal dibersihkan. Coba lagi.')
      setHistoryList([])
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Riwayat gagal dibersihkan.')
    }
  }

  const fetchModelsFromApi = async () => {
    setModelsLoading(true)
    try {
      const res = await fetch('/api/ai/models', { credentials: 'same-origin' })
      const data = await res.json()
      if (Array.isArray(data.models) && data.models.length > 0) {
        setCustomModels(data.models)
        if (!selectedModel && data.defaultModel) {
          setSelectedModel(data.defaultModel)
        }
      }
      if (Array.isArray(data.catalog)) setModelCatalog(data.catalog)
      if (data.error) console.warn('Sinkron model 9router:', data.error)
    } catch (e) {
      console.warn('Gagal memuat model dari 9router:', e)
    } finally {
      setModelsLoading(false)
    }
  }

  React.useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleGenerate = async () => {
    if (generating || statusLoading || isQuotaDepleted || !aiStatus?.configured) return
    if (mode === 'product_swap') {
      if (!isQuotaDepleted && aiStatus?.configured) await handleImageEdit()
      return
    }
    if (!promptInput.trim()) return

    const activeModelToUse = selectedModel || aiStatus?.model || 'gpt-4o-mini'

    setGenerating(true)
    setGenerationError('')
    setGeneratedOutput('')
    setReframedData(null)

    const contextPayload = {
      profile: {
        company: profile.company,
        name: profile.name,
      },
      preferences: { model: activeModelToUse },
    }

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: promptInput,
          type: mode,
          model: activeModelToUse,
          context: contextPayload,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Generasi gagal (${res.status})`)
      }

      setGeneratedOutput(data.result)

      if (data.reframed) {
        setReframedData(data.reframed)
        setViewMode('architectural')
      } else if (mode === 'prompt_reframer') {
        try {
          const jsonMatch = (data.result || '').match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            setReframedData(JSON.parse(jsonMatch[0]))
            setViewMode('architectural')
          }
        } catch {
          setReframedData(null)
        }
      } else {
        setReframedData(null)
      }

      if (data.usage && aiStatus) {
        setAiStatus((prev) =>
          prev
            ? {
                ...prev,
                usageToday: data.usage.usageToday,
                remaining: data.usage.remaining,
                dailyLimit: data.usage.dailyLimit,
              }
            : null
        )
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memanggil 9router.')
    } finally {
      setGenerating(false)
    }
  }

  const pickImage = (file: File | undefined, setter: (value: string) => void) => {
    if (!file) return
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setGenerationError('Format gambar harus PNG, JPG, atau WEBP.')
      return
    }
    if (file.size > 6 * 1024 * 1024) {
      setGenerationError('Ukuran gambar maksimal 6 MB.')
      return
    }
    setGenerationError('')
    const reader = new FileReader()
    reader.onload = () => setter(String(reader.result || ''))
    reader.onerror = () => setGenerationError('Gagal membaca gambar. Pilih ulang file Anda.')
    reader.readAsDataURL(file)
  }

  const handleImageEdit = async () => {
    if (!sceneImage || !productImage) return
    setGenerating(true)
    setGenerationError('')
    setImageResult('')
    try {
      const res = await fetch('/api/ai/image-edit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneImage,
          productImage,
          instructions: promptInput,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Gagal memproses gambar (${res.status})`)
      setImageResult(data.image)
      if (data.usage && aiStatus) {
        setAiStatus((prev) => prev ? { ...prev, ...data.usage } : null)
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Gagal memproses penggantian produk.')
    } finally {
      setGenerating(false)
    }
  }

  const usagePercent = aiStatus && !aiStatus.isUnlimited && aiStatus.dailyLimit > 0
    ? Math.min(100, Math.round((aiStatus.usageToday / aiStatus.dailyLimit) * 100))
    : 0

  const isQuotaDepleted = Boolean(aiStatus && !aiStatus.isUnlimited && aiStatus.remaining <= 0)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (promptInput.trim() && !generating && !isQuotaDepleted && aiStatus?.configured) {
        handleGenerate()
      }
    }
  }

  const allNineRouterModels = React.useMemo(() => {
    const list = new Set<string>()
    if (aiStatus?.model) list.add(aiStatus.model)
    if (Array.isArray(aiStatus?.availableModels)) {
      aiStatus.availableModels.forEach((m) => list.add(m))
    }
    customModels.forEach((m) => list.add(m))
    if (list.size === 0) {
      FALLBACK_NINEROUTER_MODELS.forEach((m) => list.add(m))
    }
    return Array.from(list)
  }, [aiStatus, customModels])

  const filteredNineRouterModels = React.useMemo(() => {
    return allNineRouterModels.filter((modelName) => {
      const catalogEntry = modelCatalog.find((c) => c.id === modelName)
      const provider = getModelProvider(modelName, catalogEntry?.owner)
      const matchesCategory =
        modelCategory === 'all' ||
        provider.toLowerCase() === modelCategory.toLowerCase()
      const matchesSearch =
        modelName.toLowerCase().includes(modelSearch.toLowerCase()) ||
        provider.toLowerCase().includes(modelSearch.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [allNineRouterModels, modelCategory, modelSearch, modelCatalog])

  const currentActiveModel = selectedModel || aiStatus?.model || 'gpt-4o-mini'

  const activeTool = generatorTools.find((tool) => tool.mode === mode)!
  const toolGroups = [
    { title: 'Prompt & konten', modes: ['prompt_builder', 'prompt_optimizer', 'prompt_checker', 'humanizer', 'prompt_reframer'] },
    { title: 'Visual & development', modes: ['product_swap', 'image_prompt', 'video_prompt', 'website_prompt'] },
    { title: 'Bisnis & klien', modes: ['invoice_items', 'proposal_structure', 'follow_up_message'] },
  ]
  const examples: Partial<Record<GeneratorMode, string>> = {
    prompt_builder: 'Buat prompt untuk merancang identitas visual toko kopi lokal. Sertakan konteks, tugas, batasan, dan format hasil.',
    prompt_optimizer: 'Perbaiki prompt ini agar tujuan, konteks, dan format hasilnya jelas: buat konten Instagram untuk bisnis kopi.',
    prompt_checker: 'Evaluasi prompt berikut: Buat website bisnis. Jelaskan bagian yang belum spesifik dan saran perbaikannya.',
    humanizer: 'Tulis ulang teks berikut dengan nada hangat dan profesional tanpa mengubah makna: Terima kasih atas kepercayaan Anda kepada layanan kami.',
    image_prompt: 'Foto produk kopi kemasan di meja kayu, cahaya pagi dari samping, latar sederhana, komposisi vertikal untuk katalog.',
    video_prompt: 'Video produk kopi 15 detik: detail kemasan, proses seduh, dan sajian akhir. Jelaskan adegan, pencahayaan, dan gerak kamera.',
    website_prompt: 'Susun spesifikasi website portofolio fotografer: galeri, detail proyek, formulir kontak, desain responsif, dan aksesibilitas.',
    invoice_items: 'Rinci pekerjaan website company profile menjadi item invoice: desain UI, development 5 halaman, formulir kontak, dan deployment. Mata uang IDR.',
    proposal_structure: 'Susun proposal website company profile untuk UMKM: latar belakang, tujuan, scope, deliverable, timeline, dan ketentuan revisi.',
    follow_up_message: 'Buat follow-up WhatsApp yang sopan untuk klien yang belum merespons proposal website selama 3 hari. Singkat, tanpa mendesak.',
  }
  const ready = Boolean(aiStatus?.configured && !statusLoading && !isQuotaDepleted && !generating && (mode === 'product_swap' ? sceneImage && productImage : promptInput.trim()))
  const resultText = mode === 'product_swap' ? '' : generatedOutput

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setGenerationError('Gagal menyalin. Pilih teks hasil lalu salin secara manual.')
    }
  }

  return (
    <div className="ai-workspace">
      <header className="ai-page-header">
        <div><h1>AI Generator</h1><p>Ruang kerja siBluudz untuk mengolah ide menjadi hasil siap pakai.</p></div>
        <div className="ai-header-actions">
          <Button variant="outline" size="sm" data-testid="history" onClick={() => { setIsHistoryOpen(true); fetchHistory() }}><History size={16} />Riwayat</Button>
          <Button variant="ghost" size="icon" aria-label="Perbarui status AI" onClick={fetchStatus} disabled={statusLoading}><RefreshCw size={16} className={statusLoading ? 'animate-spin' : ''} /></Button>
        </div>
      </header>

      <div className="ai-connection-bar" role="status">
        <span className="ai-connection"><span className={`ai-status-dot ${aiStatus?.configured ? 'is-connected' : ''}`} />{statusLoading ? 'Memeriksa koneksi…' : statusError ? 'Status tidak tersedia' : aiStatus?.configured ? '9router siap digunakan' : '9router belum dikonfigurasi'}</span>
        <span>{aiStatus ? `${aiStatus.role === 'admin' ? 'Admin' : aiStatus.tier === 'pro' ? 'Pro' : 'Free'} · ${aiStatus.usageToday} digunakan hari ini` : 'Pemakaian —'}</span>
        <span className="ai-quota">{aiStatus ? aiStatus.isUnlimited ? 'Tanpa batas harian' : `${aiStatus.remaining} dari ${aiStatus.dailyLimit} permintaan tersisa` : 'Kuota —'}{aiStatus && !aiStatus.isUnlimited && <progress aria-label="Pemakaian kuota harian" value={usagePercent} max={100} />}</span>
      </div>
      {statusError && <div className="ai-notice" role="alert">{statusError} <button onClick={fetchStatus}>Coba lagi</button></div>}
      {aiStatus && !aiStatus.configured && <div className="ai-notice" role="alert">{profile.role === 'admin' ? 'Atur API Key 9router di Pengaturan untuk mulai membuat konten.' : 'Hubungi administrator untuk mengaktifkan koneksi AI.'}</div>}
      {isQuotaDepleted && <div className="ai-notice" role="alert">Kuota harian habis. Coba kembali setelah kuota direset atau hubungi administrator.</div>}

      <div className="ai-studio">
        <aside className="ai-tool-nav" aria-label="Pilihan tool AI">
          <div className="ai-nav-heading"><h2>Tool AI</h2><span>{generatorTools.length} tersedia</span></div>
          <label className="ai-search"><Search size={15} /><input aria-label="Cari tool AI" placeholder="Cari tool…" value={toolSearch} onChange={(e) => setToolSearch(e.target.value)} /></label>
          <div className="ai-tool-groups">
            {toolGroups.map((group) => {
              const tools = group.modes.flatMap((toolMode) => generatorTools.filter((tool) => tool.mode === toolMode && `${tool.title} ${tool.description}`.toLowerCase().includes(toolSearch.toLowerCase())))
              return tools.length > 0 && <div className="ai-tool-group" key={group.title}><h3>{group.title}</h3>{tools.map((tool) => <button key={tool.mode} data-mode={tool.mode} className={mode === tool.mode ? 'is-selected' : ''} aria-pressed={mode === tool.mode} disabled={generating} onClick={() => selectTool(tool.mode)}><span>{tool.title.replace(' (Agent)', '')}</span>{mode === tool.mode && <ArrowUpRight size={14} />}</button>)}</div>
            })}
            {!generatorTools.some((tool) => `${tool.title} ${tool.description}`.toLowerCase().includes(toolSearch.toLowerCase())) && <p className="ai-muted">Tool tidak ditemukan. Coba kata lain.</p>}
          </div>
          <p className="ai-nav-note">Draf tiap tool tetap tersimpan selama halaman ini terbuka.</p>
        </aside>

        <div className="ai-work-sheet">
          <div className="ai-tool-heading"><div><h2>{activeTool.title}</h2><p>{activeTool.description}</p></div><span className="ai-muted">{mode === 'product_swap' ? 'Editor gambar' : 'Editor teks'}</span></div>
          <div className="ai-editor-grid">
            <section className="ai-compose" aria-labelledby="ai-instruction-title">
              <div className="ai-section-heading"><h3 id="ai-instruction-title">Instruksi</h3><button className="ai-text-button" disabled={generating || !promptInput} onClick={() => { setPromptInput(''); setGenerationError('') }}>Kosongkan</button></div>
              {mode !== 'product_swap' ? <div className="ai-model-picker" ref={dropdownRef}>
                <label id="ai-model-label">Model AI</label>
                <button className="ai-model-trigger" aria-labelledby="ai-model-label ai-model-value" aria-expanded={isModelDropdownOpen} aria-controls="ai-model-options" disabled={generating} onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}><span id="ai-model-value">{currentActiveModel}</span><ChevronDown size={16} /></button>
                {isModelDropdownOpen && <div className="ai-model-menu" id="ai-model-options" onKeyDown={(e) => { if (e.key === 'Escape') setIsModelDropdownOpen(false) }}>
                  <label className="ai-search"><Search size={15} /><input autoFocus aria-label="Cari model AI" placeholder="Cari model atau provider…" value={modelSearch} onChange={(e) => setModelSearch(e.target.value)} /></label>
                  <div className="ai-model-filters"><select aria-label="Filter provider" value={modelCategory} onChange={(e) => setModelCategory(e.target.value)}><option value="all">Semua provider</option>{Array.from(new Set(allNineRouterModels.map((name) => getModelProvider(name, modelCatalog.find((item) => item.id === name)?.owner)))).sort().map((provider) => <option key={provider}>{provider}</option>)}</select><button aria-label="Sinkronkan katalog model" disabled={modelsLoading} onClick={fetchModelsFromApi}><RefreshCw size={15} className={modelsLoading ? 'animate-spin' : ''} /></button></div>
                  <div className="ai-model-list">{filteredNineRouterModels.map((name) => <button key={name} aria-pressed={currentActiveModel === name} onClick={() => { setSelectedModel(name); try { localStorage.setItem('sibluudz_ai_model', name) } catch { /* Storage can be unavailable in private sessions. */ } setIsModelDropdownOpen(false) }}><span>{name}</span>{currentActiveModel === name && <Check size={15} />}</button>)}{!filteredNineRouterModels.length && <p className="ai-muted">Model tidak ditemukan.</p>}</div>
                </div>}
              </div> : <div className="ai-image-inputs">{([{ label: 'Foto referensi', value: sceneImage, setter: setSceneImage }, { label: 'Foto produk', value: productImage, setter: setProductImage }]).map(({ label, value, setter }) => <div className="ai-upload" key={label}><label><span>{label}</span>{value ? <img src={value} alt={label} /> : <span className="ai-upload-placeholder"><ImagePlus size={24} />Pilih gambar</span>}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={generating} onChange={(e) => { pickImage(e.target.files?.[0], setter); e.target.value = '' }} /></label>{value && <button aria-label={`Hapus ${label.toLowerCase()}`} disabled={generating} onClick={() => setter('')}><X size={14} /></button>}</div>)}<p className="ai-muted">PNG, JPG, WEBP · maksimal 6 MB per gambar.</p></div>}
              <label className="ai-prompt-label" htmlFor="ai-prompt">{mode === 'product_swap' ? 'Arahan tambahan (opsional)' : 'Apa yang ingin dibuat?'}</label>
              <textarea id="ai-prompt" ref={textareaRef} value={promptInput} onChange={(e) => setPromptInput(e.target.value)} onKeyDown={handleKeyDown} disabled={generating} placeholder={mode === 'product_swap' ? 'Jelaskan posisi produk, pencahayaan, atau detail yang ingin dipertahankan…' : 'Tulis tujuan, konteks, detail penting, dan format hasil yang diinginkan…'} />
              {examples[mode] && <button className="ai-example" disabled={generating} onClick={() => { setPromptInput(examples[mode]!); textareaRef.current?.focus() }}><span>Gunakan contoh instruksi<ArrowUpRight size={14} /></span><span>{examples[mode]}</span></button>}
              <div className="ai-compose-footer"><span className="ai-muted">{promptInput.length.toLocaleString('id-ID')} karakter · Ctrl / ⌘ + Enter</span><Button data-testid="generate" onClick={handleGenerate} disabled={!ready}>{generating ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}{generating ? 'Memproses…' : mode === 'product_swap' ? 'Ganti produk' : 'Buat hasil'}</Button></div>
              {!generating && !ready && <p className="ai-disabled-reason">{statusLoading ? 'Menunggu status koneksi.' : !aiStatus?.configured ? 'Koneksi AI belum siap.' : isQuotaDepleted ? 'Kuota harian sudah habis.' : mode === 'product_swap' ? 'Unggah kedua gambar untuk melanjutkan.' : 'Isi instruksi untuk mulai membuat hasil.'}</p>}
              {generationError && <div className="ai-notice" role="alert">{generationError}</div>}
            </section>

            <section className="ai-results" aria-labelledby="ai-results-title" aria-busy={generating}>
              <div className="ai-section-heading"><h3 id="ai-results-title">Hasil</h3>{resultText && <button className="ai-text-button" onClick={() => copyText('result', resultText)}>{copiedKey === 'result' ? <Check size={14} /> : <Copy size={14} />}{copiedKey === 'result' ? 'Disalin' : 'Salin hasil'}</button>}</div>
              {generating ? <div className="ai-result-loading" role="status"><RefreshCw size={20} className="animate-spin" /><h4>AI sedang mengolah instruksi</h4><p>Hasil akan muncul di sini. Waktu proses bergantung pada model yang dipilih.</p></div>
                : mode === 'product_swap' ? imageResult ? <div className="ai-image-result"><img src={imageResult} alt="Hasil penggantian produk" /><a href={imageResult} download="produk-ai.png"><Download size={16} />Unduh gambar</a><a href={imageResult} target="_blank" rel="noreferrer">Buka ukuran penuh<ArrowUpRight size={14} /></a></div> : <div className="ai-empty-result"><div className="ai-empty-heading"><h4>Foto produk, dalam suasana baru.</h4><p>Unggah foto referensi dan produk. Hasil penggantian akan muncul di sini.</p></div><dl><div><dt>Referensi</dt><dd>Menentukan latar dan komposisi.</dd></div><div><dt>Produk</dt><dd>Objek yang akan ditempatkan.</dd></div><div><dt>Arahan</dt><dd>Detail posisi dan tampilan akhir.</dd></div></dl></div>
                : resultText ? <>
                  {reframedData && <div className="ai-result-tabs"><button aria-pressed={viewMode === 'architectural'} onClick={() => setViewMode('architectural')}>Terstruktur</button><button aria-pressed={viewMode === 'raw'} onClick={() => setViewMode('raw')}>Teks asli</button></div>}
                  {reframedData && viewMode === 'architectural' ? <div className="ai-structured-result">{[{ title: 'Crescendo Chain', text: reframedData.crescendo?.join('\n\n') || '' }, { title: 'Policy Puppetry', text: reframedData.policy_puppetry }, { title: 'Cognitive Reframing', text: reframedData.cognitive_reframing }, { title: 'Completion & Prefill', text: reframedData.prefill_prompt }].map((item) => <details key={item.title} open><summary>{item.title}</summary><p>{item.text}</p><button className="ai-text-button" onClick={() => copyText(item.title, item.text)}>{copiedKey === item.title ? <Check size={14} /> : <Copy size={14} />}Salin bagian</button></details>)}</div> : <><label className="ai-muted" htmlFor="ai-result">Bisa diedit sebelum disalin.</label><textarea id="ai-result" className="ai-result-text" value={resultText} onChange={(e) => setGeneratedOutput(e.target.value)} spellCheck={false} /></>}
                </> : <div className="ai-empty-result"><div className="ai-empty-heading"><span className="ai-result-mark" aria-hidden="true">Aa</span><h4>Ide masuk. Hasil siap dipakai.</h4><p>Pilih tool, tulis instruksi, lalu buat hasil. Ruang ini tetap terbuka untuk membaca dan menyunting.</p></div><dl><div><dt>Lebih terarah</dt><dd>Sebutkan tujuan dan audiens.</dd></div><div><dt>Lebih relevan</dt><dd>Tambahkan konteks pekerjaan.</dd></div><div><dt>Siap digunakan</dt><dd>Tentukan format hasil akhir.</dd></div></dl></div>}
              <p className="ai-result-note">Periksa kembali fakta, angka, dan detail sebelum menggunakan hasil AI.</p>
            </section>
          </div>
        </div>
      </div>

      <dialog ref={historyDialogRef} className="ai-history-dialog" aria-labelledby="ai-history-title" onCancel={() => setIsHistoryOpen(false)} onClose={() => setIsHistoryOpen(false)}>
        <div className="ai-section-heading"><div><h2 id="ai-history-title">Riwayat generasi</h2><p className="ai-muted">{historyList.length} hasil tersimpan</p></div><button className="ai-icon-button" aria-label="Tutup riwayat" onClick={() => setIsHistoryOpen(false)}><X size={18} /></button></div>
        {historyError && <div className="ai-notice" role="alert">{historyError} <button onClick={fetchHistory}>Coba lagi</button></div>}
        {historyList.length > 0 && <button className="ai-text-button" onClick={handleClearHistory}><Trash2 size={14} />Hapus semua riwayat</button>}
        <div className="ai-history-list">{historyLoading ? <p role="status">Memuat riwayat…</p> : !historyList.length ? <p className="ai-muted">Belum ada riwayat. Hasil generasi akan tersimpan di sini.</p> : historyList.map((item) => <article key={item.id}><div className="ai-history-meta"><span>{generatorTools.find((tool) => tool.mode === item.type)?.title || item.type}</span><span>{item.createdAt}</span></div><h3>{item.prompt}</h3><p>{item.result}</p><div className="ai-history-actions"><span title={item.model}>{item.model}</span><button className="ai-text-button" data-testid="restore-history" disabled={generating} onClick={() => { const target = generatorTools.find((tool) => tool.mode === item.type)?.mode; if (!target) return; selectTool(target); setInputsByMode((prev) => ({ ...prev, [target]: item.prompt })); setOutputsByMode((prev) => ({ ...prev, [target]: item.result })); setReframedByMode((prev) => ({ ...prev, [target]: null })); setIsHistoryOpen(false) }}>Gunakan kembali<ArrowUpRight size={14} /></button><button className="ai-icon-button" aria-label="Hapus riwayat ini" onClick={(e) => handleDeleteHistory(item.id, e)}><Trash2 size={15} /></button></div></article>)}</div>
      </dialog>
    </div>
  )
}
