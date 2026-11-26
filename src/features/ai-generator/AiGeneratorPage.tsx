import * as React from 'react'
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  ChevronDown,
  History,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useUser } from '@/context/UserContext'
import { PromptStudioPage } from '@/features/prompt-studio/PromptStudioPage'
import { PromptCheckerWorkspace } from './PromptCheckerWorkspace'
import { WebsitePromptWorkspace } from './WebsitePromptWorkspace'
import { ImagePromptWorkspace } from './ImagePromptWorkspace'
import { ProductSwapWorkspace } from './ProductSwapWorkspace'
import type { ProductSwapResult, UploadedPhoto } from './ProductSwapWorkspace'
import { RelightStudio } from './RelightStudio'
import { AiToolIcon, ToolNavigation } from './ToolNavigation'
import { generatorTools } from './tool-catalog'
import type { GeneratorMode } from './tool-catalog'
import { buildCheckerPrompt, parsePromptEvaluation } from '../../../shared/prompt-checker.js'
import type { PromptEvaluation } from '../../../shared/prompt-checker.js'
import { buildWebsitePrompt, parseWebsiteSpec } from '../../../shared/website-prompt.js'
import type { WebsiteSpec } from '../../../shared/website-prompt.js'
import { buildImagePrompt, parseImagePromptSpec } from '../../../shared/image-prompt.js'
import type { ImagePromptSpec } from '../../../shared/image-prompt.js'
import { defaultProductSwapSettings } from '../../../shared/product-swap.js'
import type { ProductSwapResolution, ProductSwapSettings } from '../../../shared/product-swap.js'
import {
  curateTextModels,
  curateImageModels,
  pickPreferredLatestTextModel,
} from '../../../shared/model-catalog.js'
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
  availableImageModels?: string[]
  catalog?: ModelCatalogEntry[]
  syncedAt?: string
  imageModelsSyncedAt?: string
  imageModel?: string
}

const OWNER_LABELS: Record<string, string> = {
  ag: 'Antigravity',
  cx: 'Codex',
  gptweb: 'GPTWeb',
  river: 'River',
  omnirush: 'OmniRush',
  yeta: 'Yeta',
  'muse-image': 'Muse Image',
  ds: 'DeepSeek',
  oc: 'OpenCode',
  mmf: 'MiMo',
  combo: 'Combo',
  colab: 'Colab',
}

function resolveLiveModel(candidate: string, liveList: string[], defaultModel?: string): string {
  if (liveList.length === 0) return candidate || defaultModel || ''
  if (candidate && liveList.includes(candidate)) return candidate
  if (defaultModel && liveList.includes(defaultModel)) return defaultModel
  return liveList[0]
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
  'cx/gpt-6.2-sol',
  'ag/gemini-4-hydrogen',
  'ag/claude-sonnet-5-5',
  'ag/claude-opus-5-5',
  'gptweb/gpt-6-2',
  'river/GLM-5.3',
  'yeta/deepseek-v4.1-flash',
]

export function AiGeneratorPage({ initialMode = 'prompt_checker' }: { initialMode?: GeneratorMode } = {}) {
  const { profile } = useUser()
  const [aiStatus, setAiStatus] = React.useState<AiStatus | null>(null)
  const [statusLoading, setStatusLoading] = React.useState(true)
  const [statusError, setStatusError] = React.useState('')

  const [mode, setMode] = React.useState<GeneratorMode>(initialMode)
  const [contextByMode, setContextByMode] = React.useState<Record<string, string>>({})
  const [studioVisited, setStudioVisited] = React.useState(initialMode === 'prompt_studio')
  const [relightVisited, setRelightVisited] = React.useState(initialMode === 'relight_studio')
  const [inputsByMode, setInputsByMode] = React.useState<Record<string, string>>({})
  const [outputsByMode, setOutputsByMode] = React.useState<Record<string, string>>({})
  const [checkerGoal, setCheckerGoal] = React.useState('general')
  const [checkerFocuses, setCheckerFocuses] = React.useState<string[]>(['clarity', 'output_format'])
  const [checkerEvaluation, setCheckerEvaluation] = React.useState<PromptEvaluation | null>(null)
  const [checkerEvaluatedSource, setCheckerEvaluatedSource] = React.useState('')
  const [websiteProjectType, setWebsiteProjectType] = React.useState('webapp')
  const [websiteAssistant, setWebsiteAssistant] = React.useState('agent')
  const [websiteStack, setWebsiteStack] = React.useState<string[]>([
    'React + Vite',
    'TypeScript',
    'Tailwind CSS',
  ])
  const [websiteStandards, setWebsiteStandards] = React.useState<string[]>([
    'responsive',
    'dual_theme',
  ])
  const [websiteSpec, setWebsiteSpec] = React.useState<WebsiteSpec | null>(null)
  const [imageTarget, setImageTarget] = React.useState('universal')
  const [imageStyle, setImageStyle] = React.useState('product_studio')
  const [imageRatio, setImageRatio] = React.useState('4:5')
  const [imageLighting, setImageLighting] = React.useState('natural_morning')
  const [imageLanguage, setImageLanguage] = React.useState('en')
  const [imagePromptSpec, setImagePromptSpec] = React.useState<ImagePromptSpec | null>(null)

  const promptInput = inputsByMode[mode] || ''
  const setPromptInput = React.useCallback(
    (val: string) => {
      setInputsByMode((prev) => ({ ...prev, [mode]: val }))
    },
    [mode]
  )

  const generatedOutput = outputsByMode[mode] || ''
  const setGeneratedOutput = React.useCallback(
    (val: string) => {
      setOutputsByMode((prev) => ({ ...prev, [mode]: val }))
    },
    [mode]
  )

  const [selectedModel, setSelectedModel] = React.useState<string>(() => {
    try {
      return localStorage.getItem('sibluudz_ai_model') || ''
    } catch {
      return ''
    }
  })
  const [selectedImageModel, setSelectedImageModel] = React.useState<string>(() => {
    try {
      return localStorage.getItem('sibluudz_product_swap_model') || ''
    } catch {
      return ''
    }
  })
  const [customModels, setCustomModels] = React.useState<string[]>([])
  const [imageModels, setImageModels] = React.useState<string[]>([])
  const [modelsLoading, setModelsLoading] = React.useState(false)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = React.useState(false)
  const [modelCategory, setModelCategory] = React.useState<string>('all')
  const [modelSearch, setModelSearch] = React.useState('')
  const [showLegacyModels, setShowLegacyModels] = React.useState(false)
  const [modelsSyncError, setModelsSyncError] = React.useState('')
  const lastTextSyncRef = React.useRef(0)
  const lastImageSyncRef = React.useRef(0)

  const [generating, setGenerating] = React.useState(false)
  const [generationError, setGenerationError] = React.useState('')
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
  const [pane, setPane] = React.useState<'input' | 'result'>('input')
  const historyDialogRef = React.useRef<HTMLDialogElement>(null)

  const [scenePhoto, setScenePhoto] = React.useState<UploadedPhoto | null>(null)
  const [productPhoto, setProductPhoto] = React.useState<UploadedPhoto | null>(null)
  const [swapSettings, setSwapSettings] = React.useState<ProductSwapSettings>({
    ...defaultProductSwapSettings,
  })
  const [swapResolution, setSwapResolution] = React.useState<ProductSwapResolution>('')
  const [swapResult, setSwapResult] = React.useState<ProductSwapResult | null>(null)
  const [relightSeed, setRelightSeed] = React.useState<{
    key: number
    source: { data: string; name: string } | null
  }>({ key: 0, source: null })

  // History state
  const [isHistoryOpen, setIsHistoryOpen] = React.useState(false)
  const [historySearch, setHistorySearch] = React.useState('')
  const [historyList, setHistoryList] = React.useState<
    { id: string; type: string; model: string; prompt: string; result: string; createdAt: string }[]
  >([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyError, setHistoryError] = React.useState('')

  const dropdownRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const dialog = historyDialogRef.current
    if (isHistoryOpen && dialog && !dialog.open) dialog.showModal()
    if (!isHistoryOpen && dialog?.open) dialog.close()
  }, [isHistoryOpen])

  const selectTool = (nextMode: GeneratorMode) => {
    if (generating) return
    setMode(nextMode)
    setPane('input')
    if (nextMode === 'prompt_studio') setStudioVisited(true)
    if (nextMode === 'relight_studio') setRelightVisited(true)
    setIsModelDropdownOpen(false)
    setModelCategory('all')
    setModelSearch('')
    setGenerationError('')
    setCopiedKey(null)
  }

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

  const loadStatus = React.useCallback(async (refresh = false) => {
    const res = await fetch(refresh ? '/api/ai/status?refresh=1' : '/api/ai/status', {
      credentials: 'same-origin',
    })
    if (!res.ok) {
      throw new Error(`Gagal mengambil status AI (${res.status})`)
    }
    const data: AiStatus = await res.json()
    return data
  }, [])

  const applyStatus = React.useCallback((data: AiStatus) => {
    setAiStatus(data)
    const catalog = Array.isArray(data.catalog) ? data.catalog : []
    setModelCatalog(catalog)
    const rawAvailable = Array.isArray(data.availableModels) ? data.availableModels : []
    const curatedText = curateTextModels(rawAvailable, catalog)
    if (curatedText.all.length > 0 && lastTextSyncRef.current === 0) {
      setCustomModels(curatedText.all)
    }
    const preferredTextDefault =
      (data.model && curatedText.latest.includes(data.model) && data.model) ||
      pickPreferredLatestTextModel(curatedText.latest, catalog)
    setSelectedModel((prev) => {
      const saved = (() => {
        try {
          return localStorage.getItem('sibluudz_ai_model') || ''
        } catch {
          return ''
        }
      })()
      const next = resolveLiveModel(prev || saved, curatedText.latest, preferredTextDefault)
      if (next && next !== prev) {
        try {
          localStorage.setItem('sibluudz_ai_model', next)
        } catch {
          /* Storage can be unavailable in private sessions. */
        }
      }
      return next
    })

    const imgList = Array.isArray(data.availableImageModels) ? data.availableImageModels : []
    const curatedImg = curateImageModels(imgList)
    if (curatedImg.all.length > 0 && lastImageSyncRef.current === 0) {
      setImageModels(curatedImg.all)
    }
    const preferredImgDefault =
      (data.imageModel && curatedImg.latest.includes(data.imageModel) && data.imageModel) ||
      curatedImg.latest[0] ||
      data.imageModel
    setSelectedImageModel((prev) => {
      const saved = (() => {
        try {
          return localStorage.getItem('sibluudz_product_swap_model') || ''
        } catch {
          return ''
        }
      })()
      const next = resolveLiveModel(prev || saved, curatedImg.latest, preferredImgDefault)
      if (next && next !== prev) {
        try {
          localStorage.setItem('sibluudz_product_swap_model', next)
        } catch {
          /* Storage can be unavailable in private sessions. */
        }
      }
      return next
    })
  }, [])

  const fetchStatus = React.useCallback(async () => {
    setStatusLoading(true)
    setStatusError('')
    try {
      const data = await loadStatus(true)
      applyStatus(data)
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Gagal memuat status AI')
    } finally {
      setStatusLoading(false)
    }
  }, [loadStatus, applyStatus])

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

  const fetchModelsFromApi = React.useCallback(async (force = false, silent = false) => {
    if (!force && Date.now() - lastTextSyncRef.current < 15_000) return
    if (!silent) {
      setModelsLoading(true)
      setModelsSyncError('')
    }
    try {
      const res = await fetch('/api/ai/models', { credentials: 'same-origin' })
      const data = await res.json()
      const catalog: ModelCatalogEntry[] = Array.isArray(data.catalog) ? data.catalog : []
      if (catalog.length > 0) setModelCatalog(catalog)
      if (data.success && Array.isArray(data.models)) {
        lastTextSyncRef.current = Date.now()
        setModelsSyncError('')
        const curatedText = curateTextModels(data.models, catalog)
        setCustomModels(curatedText.all)
        setAiStatus((prev) =>
          prev
            ? {
                ...prev,
                availableModels: data.models,
                catalog: catalog.length > 0 ? catalog : prev.catalog,
                model: data.defaultModel || prev.model,
                syncedAt: data.syncedAt || prev.syncedAt,
              }
            : prev
        )
        const preferredTextDefault =
          (data.defaultModel && curatedText.latest.includes(data.defaultModel) && data.defaultModel) ||
          pickPreferredLatestTextModel(curatedText.latest, catalog)
        setSelectedModel((prev) => {
          const next = resolveLiveModel(prev, curatedText.latest, preferredTextDefault)
          if (next) {
            try {
              localStorage.setItem('sibluudz_ai_model', next)
            } catch {
              /* Storage can be unavailable in private sessions. */
            }
          }
          return next
        })
      } else if (data.error) {
        if (!silent) setModelsSyncError(data.error)
        console.warn('Sinkron model 9router:', data.error)
      }
    } catch (e) {
      if (!silent) setModelsSyncError('Gagal memeriksa model aktif di 9router.')
      console.warn('Gagal memuat model dari 9router:', e)
    } finally {
      if (!silent) setModelsLoading(false)
    }
  }, [])

  const fetchImageModelsFromApi = React.useCallback(async (force = false, silent = false) => {
    if (!force && Date.now() - lastImageSyncRef.current < 15_000) return
    if (!silent) {
      setModelsLoading(true)
      setModelsSyncError('')
    }
    try {
      const res = await fetch('/api/ai/image-models', { credentials: 'same-origin' })
      const data = await res.json()
      if (data.success && Array.isArray(data.models)) {
        lastImageSyncRef.current = Date.now()
        setModelsSyncError('')
        const curatedImg = curateImageModels(data.models)
        setImageModels(curatedImg.all)
        setAiStatus((prev) =>
          prev
            ? {
                ...prev,
                availableImageModels: data.models,
                imageModel: data.defaultModel || prev.imageModel,
              }
            : prev
        )
        const preferredImgDefault =
          (data.defaultModel && curatedImg.latest.includes(data.defaultModel) && data.defaultModel) ||
          curatedImg.latest[0] ||
          data.defaultModel
        setSelectedImageModel((prev) => {
          const next = resolveLiveModel(prev, curatedImg.latest, preferredImgDefault)
          if (next) {
            try {
              localStorage.setItem('sibluudz_product_swap_model', next)
            } catch {
              /* Storage can be unavailable in private sessions. */
            }
          }
          return next
        })
      } else if (data.error) {
        if (!silent) setModelsSyncError(data.error)
        console.warn('Sinkron model gambar 9router:', data.error)
      }
    } catch (e) {
      if (!silent) setModelsSyncError('Gagal memeriksa model gambar di 9router.')
      console.warn('Gagal memuat model gambar dari 9router:', e)
    } finally {
      if (!silent) setModelsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let active = true
    loadStatus()
      .then((data) => {
        if (!active) return
        applyStatus(data)
      })
      .catch((err) => {
        if (!active) return
        setStatusError(err instanceof Error ? err.message : 'Gagal memuat status AI')
      })
      .finally(() => {
        if (active) setStatusLoading(false)
      })

    void fetchModelsFromApi(true, true)
    void fetchImageModelsFromApi(true, true)

    return () => {
      active = false
    }
  }, [loadStatus, applyStatus, fetchModelsFromApi, fetchImageModelsFromApi])

  React.useEffect(() => {
    const syncOnReturn = () => {
      if (document.visibilityState === 'visible') {
        void fetchModelsFromApi(false, true)
        void fetchImageModelsFromApi(false, true)
      }
    }
    document.addEventListener('visibilitychange', syncOnReturn)
    window.addEventListener('focus', syncOnReturn)
    return () => {
      document.removeEventListener('visibilitychange', syncOnReturn)
      window.removeEventListener('focus', syncOnReturn)
    }
  }, [fetchModelsFromApi, fetchImageModelsFromApi])

  const usagePercent =
    aiStatus && !aiStatus.isUnlimited && aiStatus.dailyLimit > 0
      ? Math.min(100, Math.round((aiStatus.usageToday / aiStatus.dailyLimit) * 100))
      : 0

  const isQuotaDepleted = Boolean(aiStatus && !aiStatus.isUnlimited && aiStatus.remaining <= 0)
  const activeTool = generatorTools.find((tool) => tool.mode === mode)!

  const handleGenerate = async () => {
    if (mode === 'prompt_studio' || mode === 'relight_studio') return
    if (generating || statusLoading || isQuotaDepleted || !aiStatus?.configured) return
    if (mode === 'product_swap') {
      if (!isQuotaDepleted && aiStatus?.configured) await handleImageEdit()
      return
    }
    if (!promptInput.trim()) return

    const activeModelToUse = selectedModel || aiStatus?.model || allNineRouterModels[0] || ''

    setGenerating(true)
    setGenerationError('')
    setGeneratedOutput('')
    if (mode === 'prompt_checker') {
      setCheckerEvaluation(null)
    }
    if (mode === 'website_prompt') {
      setWebsiteSpec(null)
    }
    if (mode === 'image_prompt') {
      setImagePromptSpec(null)
    }

    const requestPrompt =
      mode === 'prompt_checker'
        ? buildCheckerPrompt(promptInput, {
            goal: checkerGoal,
            focuses: checkerFocuses,
            extraCriteria: contextByMode[mode] || '',
          })
        : mode === 'website_prompt'
        ? buildWebsitePrompt(promptInput, {
            projectType: websiteProjectType,
            assistant: websiteAssistant,
            stack: websiteStack,
            standards: websiteStandards,
            constraints: contextByMode[mode] || '',
          })
        : mode === 'image_prompt'
        ? buildImagePrompt(promptInput, {
            target: imageTarget,
            style: imageStyle,
            ratio: imageRatio,
            lighting: imageLighting,
            language: imageLanguage,
            details: contextByMode[mode] || '',
          })
        : promptInput

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
          prompt: requestPrompt,
          type: mode,
          model: activeModelToUse,
          ...(mode === 'image_prompt' ? {} : { context: contextPayload }),
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Generasi gagal (${res.status})`)
      }

      setGeneratedOutput(data.result)
      setPane('result')

      if (mode === 'prompt_checker') {
        setCheckerEvaluation(data.evaluation || parsePromptEvaluation(data.result || ''))
        setCheckerEvaluatedSource(promptInput)
      }
      if (mode === 'website_prompt') {
        setWebsiteSpec(data.websiteSpec || parseWebsiteSpec(data.result || ''))
      }
      if (mode === 'image_prompt') {
        setImagePromptSpec(data.imagePromptSpec || parseImagePromptSpec(data.result || ''))
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
      setPane('input')
    } finally {
      setGenerating(false)
    }
  }

  const handleImageEdit = async () => {
    if (!scenePhoto || !productPhoto) return
    setGenerating(true)
    setGenerationError('')
    try {
      const res = await fetch('/api/ai/image-edit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneImage: scenePhoto.data,
          productImage: productPhoto.data,
          instructions: promptInput,
          settings: swapSettings,
          ...(swapResolution ? { resolution: swapResolution } : {}),
          ...(currentImageModel ? { model: currentImageModel } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Gagal memproses gambar (${res.status})`)
      setSwapResult({
        image: data.image,
        model: data.model || currentImageModel,
        output: data.output || null,
        warning: data.warning,
        referenceImage: scenePhoto.data,
        productImage: productPhoto.data,
      })
      setPane('result')
      if (data.usage && aiStatus) {
        setAiStatus((prev) => (prev ? { ...prev, ...data.usage } : null))
      }
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Gagal memproses penggantian produk.')
      setPane('input')
    } finally {
      setGenerating(false)
    }
  }

  const swapProductSlots = () => {
    setScenePhoto(productPhoto)
    setProductPhoto(scenePhoto)
  }

  const sendSwapResultToRelight = (imageData: string) => {
    setRelightSeed((prev) => ({
      key: prev.key + 1,
      source: { data: imageData, name: 'hasil-ganti-produk.png' },
    }))
    setRelightVisited(true)
    selectTool('relight_studio')
  }

  const promoteSwapResultToReference = async (imageData: string) => {
    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 0, height: 0 })
      img.src = imageData
    })
    setScenePhoto({
      data: imageData,
      name: 'referensi-lanjutan.png',
      width: dims.width,
      height: dims.height,
      bytes: Math.round(imageData.length * 0.75),
    })
    setPane('input')
  }

  const curatedTextModels = React.useMemo(() => {
    const raw =
      customModels.length > 0
        ? customModels
        : Array.isArray(aiStatus?.availableModels) && aiStatus.availableModels.length > 0
        ? aiStatus.availableModels
        : aiStatus?.model
        ? [aiStatus.model]
        : statusError
        ? FALLBACK_NINEROUTER_MODELS
        : []
    return curateTextModels(raw, modelCatalog)
  }, [aiStatus, customModels, modelCatalog, statusError])

  const allNineRouterModels = curatedTextModels.latest

  const isLocalTool = mode === 'prompt_studio'
  const isRelightTool = mode === 'relight_studio'
  const isCheckerTool = mode === 'prompt_checker'
  const isWebsiteTool = mode === 'website_prompt'
  const isImagePromptTool = mode === 'image_prompt'
  const isImagePicker = mode === 'product_swap'
  const showModelPicker = !isLocalTool && !isRelightTool

  const curatedImageModels = React.useMemo(() => {
    const raw =
      imageModels.length > 0
        ? imageModels
        : Array.isArray(aiStatus?.availableImageModels) && aiStatus.availableImageModels.length > 0
        ? aiStatus.availableImageModels
        : aiStatus?.imageModel
        ? [aiStatus.imageModel]
        : []
    return curateImageModels(raw)
  }, [imageModels, aiStatus])

  const legacyPickerCount = isImagePicker
    ? curatedImageModels.legacy.length
    : curatedTextModels.legacy.length

  const activePickerModels = React.useMemo(() => {
    const group = isImagePicker ? curatedImageModels : curatedTextModels
    return showLegacyModels ? group.all : group.latest
  }, [isImagePicker, showLegacyModels, curatedImageModels, curatedTextModels])

  const filteredPickerModels = React.useMemo(() => {
    return activePickerModels.filter((modelName) => {
      const catalogEntry = modelCatalog.find((c) => c.id === modelName)
      const provider = getModelProvider(modelName, catalogEntry?.owner)
      const matchesCategory =
        modelCategory === 'all' || provider.toLowerCase() === modelCategory.toLowerCase()
      const matchesSearch =
        modelName.toLowerCase().includes(modelSearch.toLowerCase()) ||
        provider.toLowerCase().includes(modelSearch.toLowerCase())
      return matchesCategory && matchesSearch
    })
  }, [activePickerModels, modelCategory, modelSearch, modelCatalog])

  const currentActiveModel = selectedModel || aiStatus?.model || allNineRouterModels[0] || ''
  const currentImageModel =
    selectedImageModel || aiStatus?.imageModel || activePickerModels[0] || ''
  const displayPickerModel =
    statusLoading && !aiStatus && !selectedModel
      ? 'Memuat model...'
      : isImagePicker
      ? currentImageModel || 'Otomatis'
      : currentActiveModel || (modelsLoading ? 'Memuat model...' : 'Belum dipilih')
  const currentModelProvider = getModelProvider(
    displayPickerModel,
    modelCatalog.find((c) => c.id === displayPickerModel)?.owner
  )

  const ready = Boolean(
    aiStatus?.configured &&
      !statusLoading &&
      !isQuotaDepleted &&
      !generating &&
      (mode === 'product_swap' ? scenePhoto && productPhoto : promptInput.trim())
  )

  const draftModes = React.useMemo(() => {
    const map: Partial<Record<GeneratorMode, boolean>> = {}
    for (const tool of generatorTools) {
      if (tool.mode === 'product_swap') {
        map[tool.mode] = Boolean(scenePhoto || productPhoto || swapResult || inputsByMode[tool.mode]?.trim())
      } else {
        map[tool.mode] = Boolean(
          inputsByMode[tool.mode]?.trim() ||
            outputsByMode[tool.mode]?.trim() ||
            contextByMode[tool.mode]?.trim()
        )
      }
    }
    return map
  }, [inputsByMode, outputsByMode, contextByMode, scenePhoto, productPhoto, swapResult])

  const filteredHistory = React.useMemo(() => {
    const query = historySearch.trim().toLowerCase()
    if (!query) return historyList
    return historyList.filter((item) => {
      const toolTitle = generatorTools.find((t) => t.mode === item.type)?.title || item.type
      return (
        item.prompt.toLowerCase().includes(query) ||
        item.result.toLowerCase().includes(query) ||
        item.model.toLowerCase().includes(query) ||
        toolTitle.toLowerCase().includes(query)
      )
    })
  }, [historyList, historySearch])

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 2000)
    } catch {
      setGenerationError('Gagal menyalin. Pilih teks hasil lalu salin secara manual.')
    }
  }

  const restoreHistory = (item: { type: string; prompt: string; result: string }) => {
    const target = generatorTools.find((tool) => tool.mode === item.type)?.mode
    if (!target || target === 'prompt_studio' || generating) return
    selectTool(target)
    setInputsByMode((prev) => ({ ...prev, [target]: item.prompt }))
    // Stored prompts already include optional context from the original request.
    setContextByMode((prev) => ({ ...prev, [target]: '' }))
    setOutputsByMode((prev) => ({ ...prev, [target]: item.result }))
    if (target === 'prompt_checker') {
      setCheckerEvaluation(parsePromptEvaluation(item.result))
      setCheckerEvaluatedSource(item.prompt)
    }
    if (target === 'website_prompt') {
      setWebsiteSpec(parseWebsiteSpec(item.result))
    }
    if (target === 'image_prompt') {
      setImagePromptSpec(parseImagePromptSpec(item.result))
    }
    setPane('result')
    setIsHistoryOpen(false)
  }

  const toggleWebsiteStack = (item: string) => {
    setWebsiteStack((prev) =>
      prev.includes(item) ? prev.filter((s) => s !== item) : [...prev, item]
    )
  }

  const toggleWebsiteStandard = (id: string) => {
    setWebsiteStandards((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const sendPromptToChecker = (promptText: string) => {
    setInputsByMode((prev) => ({ ...prev, prompt_checker: promptText }))
    setCheckerEvaluation(null)
    setCheckerEvaluatedSource('')
    selectTool('prompt_checker')
  }

  const websiteDisabledReason = statusLoading
    ? 'Menunggu status koneksi.'
    : !aiStatus?.configured
    ? 'Koneksi AI belum siap.'
    : isQuotaDepleted
    ? 'Kuota harian sudah habis.'
    : 'Jelaskan website atau fitur untuk mulai.'

  const toggleCheckerFocus = (focusId: string) => {
    setCheckerFocuses((prev) =>
      prev.includes(focusId) ? prev.filter((id) => id !== focusId) : [...prev, focusId]
    )
  }

  const checkerDisabledReason = statusLoading
    ? 'Menunggu status koneksi.'
    : !aiStatus?.configured
    ? 'Koneksi AI belum siap.'
    : isQuotaDepleted
    ? 'Kuota harian sudah habis.'
    : 'Isi prompt untuk mulai diaudit.'

  const imagePromptDisabledReason = statusLoading
    ? 'Menunggu status koneksi.'
    : !aiStatus?.configured
    ? 'Koneksi AI belum siap.'
    : isQuotaDepleted
    ? 'Kuota harian sudah habis.'
    : 'Jelaskan ide gambar untuk mulai.'

  const productSwapDisabledReason = statusLoading
    ? 'Menunggu status koneksi.'
    : !aiStatus?.configured
    ? 'Koneksi AI belum siap.'
    : isQuotaDepleted
    ? 'Kuota harian sudah habis.'
    : 'Unggah kedua foto untuk lanjut.'

  const connectionNode = (
    <span className="ag-connection" role="status">
      <span
        className={`ag-status-dot ${isLocalTool || aiStatus?.configured ? 'is-connected' : 'is-offline'}`}
        aria-hidden="true"
      />
      <span>
        {isLocalTool
          ? 'Berjalan lokal'
          : statusLoading
          ? 'Memeriksa koneksi...'
          : statusError
          ? 'Status tidak tersedia'
          : aiStatus?.configured
          ? '9router tersambung'
          : '9router belum aktif'}
      </span>
    </span>
  )

  const quotaNode = (
    <div className="ag-quota">
      <span>
        {isLocalTool
          ? 'Tanpa kuota API'
          : aiStatus
          ? aiStatus.isUnlimited
            ? `${aiStatus.usageToday} dipakai · Tanpa batas`
            : `${aiStatus.remaining} / ${aiStatus.dailyLimit} tersisa`
          : 'Kuota belum tersedia'}
      </span>
      {!isLocalTool && aiStatus && !aiStatus.isUnlimited && (
        <progress aria-label="Pemakaian kuota harian" value={usagePercent} max={100} />
      )}
    </div>
  )

  const railActions = (
    <>
      <button
        type="button"
        className="ag-rail-action-btn"
        data-testid="history"
        aria-label="Riwayat"
        onClick={() => {
          setHistorySearch('')
          setIsHistoryOpen(true)
          fetchHistory()
        }}
      >
        <History size={15} aria-hidden="true" />
        <span className="ag-history-label">Riwayat</span>
      </button>
      <button
        type="button"
        className="ag-icon-btn"
        aria-label="Perbarui status AI"
        onClick={fetchStatus}
        disabled={statusLoading}
      >
        <RefreshCw size={15} className={statusLoading ? 'animate-spin' : ''} aria-hidden="true" />
      </button>
    </>
  )

  return (
    <div className="ai-workspace" data-ui="ai-generator">
      <div className="ag-shell">
        <ToolNavigation
          mode={mode}
          disabled={generating}
          onSelect={selectTool}
          draftModes={draftModes}
          connectionStatus={connectionNode}
          quotaSummary={quotaNode}
          actions={railActions}
        />

        <div className="ag-stage">
        <div className="ag-sheet">
          <header className="ag-sheet-header" data-has-picker={showModelPicker}>
            <div className="ag-sheet-title">
              <span className="ag-tool-badge" aria-hidden="true">
                <AiToolIcon mode={mode} size={16} />
              </span>
              <div className="ag-title-copy">
                <h1>{activeTool.headerTitle || activeTool.title}</h1>
                <p>{activeTool.description}</p>
              </div>
            </div>

            {(showModelPicker || isLocalTool) && (
              <div className="ag-header-controls">
              {showModelPicker ? (
                <div className="ag-model-picker" ref={dropdownRef}>
                  <span id="ai-model-label" className="ag-model-label">
                    {isImagePicker ? 'Model gambar' : 'Model'}
                  </span>
                  <button
                    type="button"
                    className="ag-model-trigger"
                    aria-labelledby="ai-model-label ai-model-value"
                    aria-expanded={isModelDropdownOpen}
                    aria-controls="ai-model-options"
                    disabled={generating}
                    onClick={() => {
                      const nextOpen = !isModelDropdownOpen
                      setIsModelDropdownOpen(nextOpen)
                      if (nextOpen) {
                        void (isImagePicker
                          ? fetchImageModelsFromApi(false, false)
                          : fetchModelsFromApi(false, false))
                      }
                    }}
                  >
                    <span className="ag-model-provider">{currentModelProvider}</span>
                    <span id="ai-model-value" className="ag-model-name">
                      {displayPickerModel}
                    </span>
                    <ChevronDown size={15} aria-hidden="true" />
                  </button>

                  {isModelDropdownOpen && (
                    <div
                      className="ag-model-menu"
                      id="ai-model-options"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setIsModelDropdownOpen(false)
                      }}
                    >
                      <label className="ag-search-box">
                        <Search size={15} aria-hidden="true" />
                        <input
                          autoFocus
                          aria-label={isImagePicker ? 'Cari model gambar AI' : 'Cari model AI'}
                          placeholder="Cari model atau provider..."
                          value={modelSearch}
                          onChange={(e) => setModelSearch(e.target.value)}
                        />
                      </label>
                      <div className="ag-model-filters">
                        <select
                          aria-label="Filter provider"
                          value={modelCategory}
                          onChange={(e) => setModelCategory(e.target.value)}
                        >
                          <option value="all">Semua provider</option>
                          {Array.from(
                            new Set(
                              activePickerModels.map((name) =>
                                getModelProvider(name, modelCatalog.find((item) => item.id === name)?.owner)
                              )
                            )
                          )
                            .sort()
                            .map((provider) => (
                              <option key={provider}>{provider}</option>
                            ))}
                        </select>
                        <button
                          type="button"
                          className="ag-icon-btn"
                          aria-label={
                            isImagePicker ? 'Sinkronkan katalog model gambar' : 'Sinkronkan katalog model'
                          }
                          disabled={modelsLoading}
                          onClick={() =>
                            void (isImagePicker
                              ? fetchImageModelsFromApi(true, false)
                              : fetchModelsFromApi(true, false))
                          }
                        >
                          <RefreshCw
                            size={15}
                            className={modelsLoading ? 'animate-spin' : ''}
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                      <div
                        className={`ag-model-status${modelsSyncError ? ' is-error' : ''}`}
                        role="status"
                      >
                        {modelsLoading
                          ? 'Memeriksa model aktif di 9router...'
                          : modelsSyncError
                          ? modelsSyncError
                          : `${activePickerModels.length} model aktif dari 9router`}
                      </div>
                      <div className="ag-model-list">
                        {filteredPickerModels.map((name) => {
                          const activeMatch = isImagePicker
                            ? currentImageModel === name
                            : currentActiveModel === name
                          return (
                            <button
                              key={name}
                              type="button"
                              aria-pressed={activeMatch}
                              onClick={() => {
                                if (isImagePicker) {
                                  setSelectedImageModel(name)
                                  try {
                                    localStorage.setItem('sibluudz_product_swap_model', name)
                                  } catch {
                                    /* Storage can be unavailable in private sessions. */
                                  }
                                } else {
                                  setSelectedModel(name)
                                  try {
                                    localStorage.setItem('sibluudz_ai_model', name)
                                  } catch {
                                    /* Storage can be unavailable in private sessions. */
                                  }
                                }
                                setIsModelDropdownOpen(false)
                              }}
                            >
                              <span>{name}</span>
                              {activeMatch && <Check size={15} aria-hidden="true" />}
                            </button>
                          )
                        })}
                        {!filteredPickerModels.length && (
                          <p className="ag-empty-note">Model tidak ditemukan.</p>
                        )}
                      </div>
                      {legacyPickerCount > 0 && (
                        <button
                          type="button"
                          className="ag-model-legacy-toggle"
                          onClick={() => setShowLegacyModels((prev) => !prev)}
                        >
                          {showLegacyModels
                            ? 'Hanya tampilkan model terbaru'
                            : `Tampilkan ${legacyPickerCount} model versi lama`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <span className="ag-kind-pill">Prompt lokal · Tanpa kuota API</span>
              )}
              </div>
            )}
          </header>

          {!isLocalTool && (statusError || (aiStatus && !aiStatus.configured) || isQuotaDepleted) && (
            <div className="ag-system-notices">
              {statusError && (
                <div className="ag-alert is-negative" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>{statusError}</span>
                  <button type="button" onClick={fetchStatus}>
                    Coba lagi
                  </button>
                </div>
              )}
              {aiStatus && !aiStatus.configured && (
                <div className="ag-alert is-warning" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>
                    {profile.role === 'admin'
                      ? 'Atur API Key 9router di Pengaturan untuk mulai membuat konten.'
                      : 'Hubungi administrator untuk mengaktifkan koneksi AI.'}
                  </span>
                </div>
              )}
              {isQuotaDepleted && (
                <div className="ag-alert is-warning" role="alert">
                  <AlertTriangle size={15} aria-hidden="true" />
                  <span>Kuota harian habis. Coba kembali setelah kuota direset atau hubungi administrator.</span>
                </div>
              )}
            </div>
          )}

          <div className="ag-mobile-pane-tabs" role="group" aria-label="Panel editor">
            <button type="button" aria-pressed={pane === 'input'} onClick={() => setPane('input')}>
              {isLocalTool ? 'Brief' : 'Arahan'}
            </button>
            <button type="button" aria-pressed={pane === 'result'} onClick={() => setPane('result')}>
              {isRelightTool ? 'Foto & hasil' : 'Hasil'}
            </button>
          </div>

          {studioVisited && (
            <div hidden={!isLocalTool} className="ai-prompt-studio">
              <PromptStudioPage
                embedded
                pane={pane}
                onAuditInChecker={(promptText) => {
                  setInputsByMode((prev) => ({ ...prev, prompt_checker: promptText }))
                  setCheckerEvaluation(null)
                  setCheckerEvaluatedSource('')
                  selectTool('prompt_checker')
                }}
              />
            </div>
          )}

          {relightVisited && (
            <RelightStudio
              key={relightSeed.key}
              active={isRelightTool}
              configured={!!aiStatus?.configured}
              statusLoading={statusLoading}
              quotaDepleted={isQuotaDepleted}
              defaultModel={aiStatus?.imageModel}
              initialSource={relightSeed.source}
              busy={generating}
              pane={pane}
              onResult={() => setPane('result')}
              onBusyChange={setGenerating}
              onUsage={(usage) => setAiStatus((previous) => (previous ? { ...previous, ...usage } : null))}
            />
          )}

          {isCheckerTool && (
            <PromptCheckerWorkspace
              promptInput={promptInput}
              onPromptChange={setPromptInput}
              extraCriteria={contextByMode.prompt_checker || ''}
              onExtraCriteriaChange={(value) =>
                setContextByMode((prev) => ({ ...prev, prompt_checker: value }))
              }
              goal={checkerGoal}
              onGoalChange={setCheckerGoal}
              focuses={checkerFocuses}
              onToggleFocus={toggleCheckerFocus}
              generatedOutput={generatedOutput}
              onGeneratedOutputChange={setGeneratedOutput}
              evaluation={checkerEvaluation}
              evaluatedSourcePrompt={checkerEvaluatedSource}
              currentActiveModel={currentActiveModel}
              generating={generating}
              ready={ready}
              disabledReason={checkerDisabledReason}
              generationError={generationError}
              pane={pane}
              onGenerate={() => void handleGenerate()}
              onClear={() => {
                setPromptInput('')
                setContextByMode((prev) => ({ ...prev, prompt_checker: '' }))
                setGenerationError('')
              }}
              onApplyImproved={(nextPrompt) => {
                setPromptInput(nextPrompt)
                setPane('input')
                setGenerationError('')
              }}
              copiedKey={copiedKey}
              onCopy={copyText}
            />
          )}

          {isWebsiteTool && (
            <WebsitePromptWorkspace
              promptInput={promptInput}
              onPromptChange={setPromptInput}
              constraints={contextByMode.website_prompt || ''}
              onConstraintsChange={(value) =>
                setContextByMode((prev) => ({ ...prev, website_prompt: value }))
              }
              projectType={websiteProjectType}
              onProjectTypeChange={setWebsiteProjectType}
              assistant={websiteAssistant}
              onAssistantChange={setWebsiteAssistant}
              stack={websiteStack}
              onToggleStack={toggleWebsiteStack}
              onSetStack={setWebsiteStack}
              standards={websiteStandards}
              onToggleStandard={toggleWebsiteStandard}
              generatedOutput={generatedOutput}
              onGeneratedOutputChange={setGeneratedOutput}
              spec={websiteSpec}
              currentActiveModel={currentActiveModel}
              generating={generating}
              ready={ready}
              disabledReason={websiteDisabledReason}
              generationError={generationError}
              pane={pane}
              onGenerate={() => void handleGenerate()}
              onClear={() => {
                setPromptInput('')
                setContextByMode((prev) => ({ ...prev, website_prompt: '' }))
                setGenerationError('')
              }}
              onAuditInChecker={sendPromptToChecker}
              copiedKey={copiedKey}
              onCopy={copyText}
            />
          )}

          {isImagePromptTool && (
            <ImagePromptWorkspace
              promptInput={promptInput}
              onPromptChange={setPromptInput}
              details={contextByMode.image_prompt || ''}
              onDetailsChange={(value) =>
                setContextByMode((prev) => ({ ...prev, image_prompt: value }))
              }
              target={imageTarget}
              onTargetChange={setImageTarget}
              style={imageStyle}
              onStyleChange={setImageStyle}
              ratio={imageRatio}
              onRatioChange={setImageRatio}
              lighting={imageLighting}
              onLightingChange={setImageLighting}
              language={imageLanguage}
              onLanguageChange={setImageLanguage}
              generatedOutput={generatedOutput}
              onGeneratedOutputChange={setGeneratedOutput}
              spec={imagePromptSpec}
              currentActiveModel={currentActiveModel}
              generating={generating}
              ready={ready}
              disabledReason={imagePromptDisabledReason}
              generationError={generationError}
              pane={pane}
              onGenerate={() => void handleGenerate()}
              onClear={() => {
                setPromptInput('')
                setContextByMode((prev) => ({ ...prev, image_prompt: '' }))
                setGenerationError('')
              }}
              onAuditInChecker={sendPromptToChecker}
              copiedKey={copiedKey}
              onCopy={copyText}
            />
          )}

          {isImagePicker && (
            <ProductSwapWorkspace
              scenePhoto={scenePhoto}
              productPhoto={productPhoto}
              onScenePhotoChange={setScenePhoto}
              onProductPhotoChange={setProductPhoto}
              onSwapSlots={swapProductSlots}
              instructions={promptInput}
              onInstructionsChange={setPromptInput}
              settings={swapSettings}
              onSettingsChange={setSwapSettings}
              resolution={swapResolution}
              onResolutionChange={setSwapResolution}
              result={swapResult}
              currentImageModel={currentImageModel}
              generating={generating}
              ready={ready}
              disabledReason={productSwapDisabledReason}
              generationError={generationError}
              pane={pane}
              onGenerate={() => void handleImageEdit()}
              onClear={() => {
                setScenePhoto(null)
                setProductPhoto(null)
                setPromptInput('')
                setSwapResult(null)
                setGenerationError('')
              }}
              onSendToRelight={sendSwapResultToRelight}
              onUseAsReference={(imageData) => void promoteSwapResultToReference(imageData)}
            />
          )}
        </div>
      </div>
      </div>

      <div className="ag-mobile-statusbar" role="status">
        {connectionNode}
        {quotaNode}
      </div>

      <dialog
        ref={historyDialogRef}
        className="ag-dialog ag-history-dialog"
        aria-labelledby="ai-history-title"
        onCancel={() => setIsHistoryOpen(false)}
        onClose={() => setIsHistoryOpen(false)}
      >
        <div className="ag-dialog-head">
          <div>
            <h2 id="ai-history-title">Riwayat generasi</h2>
            <p className="ag-muted">{historyList.length} hasil tersimpan di akun ini</p>
          </div>
          <button
            type="button"
            className="ag-icon-btn"
            aria-label="Tutup riwayat"
            onClick={() => setIsHistoryOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div className="ag-history-toolbar">
          <label className="ag-search-box">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Cari riwayat"
              placeholder="Filter prompt, model, atau tool..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
            />
          </label>
          {historyList.length > 0 && (
            <button type="button" className="ag-danger-text-btn" onClick={handleClearHistory}>
              <Trash2 size={14} aria-hidden="true" />
              <span>Hapus semua</span>
            </button>
          )}
        </div>

        {historyError && (
          <div className="ag-alert is-negative" role="alert">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{historyError}</span>
            <button type="button" onClick={fetchHistory}>
              Coba lagi
            </button>
          </div>
        )}

        <div className="ag-history-list">
          {historyLoading ? (
            <p className="ag-muted" role="status">
              Memuat riwayat...
            </p>
          ) : !historyList.length ? (
            <p className="ag-empty-note">
              Belum ada riwayat. Hasil dari tool teks akan otomatis tersimpan di sini.
            </p>
          ) : !filteredHistory.length ? (
            <p className="ag-empty-note">Tidak ada riwayat yang cocok dengan kata pencarian.</p>
          ) : (
            filteredHistory.map((item) => (
              <article key={item.id} className="ag-history-card">
                <div className="ag-history-meta">
                  <span className="ag-history-type">
                    {generatorTools.find((tool) => tool.mode === item.type)?.title || item.type}
                  </span>
                  <span>{item.createdAt}</span>
                </div>
                <h3>{item.prompt}</h3>
                <p>{item.result}</p>
                <div className="ag-history-actions">
                  <span className="ag-history-model" title={item.model}>
                    {item.model}
                  </span>
                  {generatorTools.some((tool) => tool.mode === item.type) && (
                    <button
                      type="button"
                      className="ag-text-btn"
                      data-testid="restore-history"
                      disabled={generating}
                      onClick={() => restoreHistory(item)}
                    >
                      <span>Gunakan kembali</span>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    className="ag-icon-btn"
                    aria-label="Hapus riwayat ini"
                    onClick={(e) => handleDeleteHistory(item.id, e)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </dialog>
    </div>
  )
}
