import * as React from 'react'
import {
  Bot,
  Sparkles,
  Edit3,
  Eye,
  EyeOff,
  Check,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'

export interface AiConfigSettings {
  baseUrl: string
  model: string
  imageModel?: string
  freeDailyLimit: number
  proDailyLimit: number
  hasApiKey: boolean
  apiKeyMasked: string
  availableModels?: string[]
}

interface AdminAiSettingsCardProps {
  onSettingsSaved?: () => void
}

export function AdminAiSettingsCard({ onSettingsSaved }: AdminAiSettingsCardProps) {
  const [aiSettings, setAiSettings] = React.useState<AiConfigSettings | null>(null)
  const [settingsLoading, setSettingsLoading] = React.useState(true)
  const [baseUrlInput, setBaseUrlInput] = React.useState('')
  const [apiKeyInput, setApiKeyInput] = React.useState('')
  const [showApiKey, setShowApiKey] = React.useState(false)
  const [modelInput, setModelInput] = React.useState('')
  const [imageModelInput, setImageModelInput] = React.useState('')
  const [availableModels, setAvailableModels] = React.useState<string[]>([])
  const [fetchingModels, setFetchingModels] = React.useState(false)
  const [isCustomModelMode, setIsCustomModelMode] = React.useState(false)
  const [freeLimitInput, setFreeLimitInput] = React.useState('5')
  const [proLimitInput, setProLimitInput] = React.useState('100')
  const [savingSettings, setSavingSettings] = React.useState(false)
  const [settingsMessage, setSettingsMessage] = React.useState('')
  const [settingsError, setSettingsError] = React.useState('')

  // State for 9router Test Connection
  const [testingConnection, setTestingConnection] = React.useState(false)
  const [testResult, setTestResult] = React.useState<{ success: boolean; message: string } | null>(null)

  // Fetch 9router AI Settings
  const fetchSettings = React.useCallback(async () => {
    setSettingsLoading(true)
    try {
      const res = await fetch('/api/admin/ai-settings', { credentials: 'same-origin' })
      const data: (AiConfigSettings & { error?: string }) | null = await res.json().catch(() => null)
      if (!res.ok || !data) {
        throw new Error(data?.error || `Gagal memuat konfigurasi (${res.status}). Pastikan backend server aktif.`)
      }
      setAiSettings(data)
      setBaseUrlInput(data.baseUrl || 'https://api.9router.com/v1')
      setModelInput(data.model || '')
      setImageModelInput(data.imageModel || '')
      if (Array.isArray(data.availableModels) && data.availableModels.length > 0) {
        setAvailableModels(data.availableModels)
      }
      setFreeLimitInput(String(data.freeDailyLimit || 5))
      setProLimitInput(String(data.proDailyLimit || 100))
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal memuat konfigurasi')
    } finally {
      setSettingsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Handle Fetch Available Models from 9router
  const handleFetchModels = async () => {
    setFetchingModels(true)
    setSettingsError('')
    setSettingsMessage('')

    try {
      const res = await fetch('/api/admin/fetch-models', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrlInput.trim() || undefined,
          apiKey: apiKeyInput.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Gagal mendeteksi model (${res.status}). Pastikan API Key 9router telah diisi.`)
      }

      const list: string[] = Array.isArray(data.models) ? data.models : []
      setAvailableModels(list)
      setIsCustomModelMode(false)
      if (list.length > 0 && !modelInput) {
        setModelInput(list[0])
      }
      setSettingsMessage(`Berhasil mendeteksi ${list.length} model dari 9router! Silakan pilih model default yang Anda inginkan.`)
      setTimeout(() => setSettingsMessage(''), 4000)
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal mengambil daftar model')
    } finally {
      setFetchingModels(false)
    }
  }

  // Handle Save AI Settings
  const handleSaveSettings = async () => {
    setSavingSettings(true)
    setSettingsMessage('')
    setSettingsError('')

    const payload: {
      baseUrl?: string
      apiKey?: string
      model?: string
      imageModel?: string
      freeDailyLimit?: number
      proDailyLimit?: number
      availableModels?: string[]
    } = {
      baseUrl: baseUrlInput.trim(),
      model: modelInput.trim(),
      imageModel: imageModelInput.trim(),
      freeDailyLimit: Math.max(0, parseInt(freeLimitInput, 10) || 5),
      proDailyLimit: Math.max(0, parseInt(proLimitInput, 10) || 100),
      availableModels: availableModels.length > 0 ? availableModels : undefined,
    }

    if (apiKeyInput.trim()) {
      payload.apiKey = apiKeyInput.trim()
    }

    try {
      const res = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data) {
        throw new Error(data?.error || `Gagal menyimpan pengaturan (${res.status}). Pastikan backend server aktif.`)
      }

      const savedConfig = data.config || data.settings
      if (savedConfig) {
        setAiSettings(savedConfig)
        if (Array.isArray(savedConfig.availableModels)) {
          setAvailableModels(savedConfig.availableModels)
        }
      }
      setApiKeyInput('')
      setSettingsMessage('Pengaturan 9router & kuota AI berhasil disimpan!')
      setTimeout(() => setSettingsMessage(''), 3000)
      if (onSettingsSaved) {
        onSettingsSaved()
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Gagal menyimpan pengaturan')
    } finally {
      setSavingSettings(false)
    }
  }

  // Handle Test Connection
  const handleTestConnection = async () => {
    setTestingConnection(true)
    setTestResult(null)

    try {
      const res = await fetch('/api/admin/test-9router', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrlInput.trim() || undefined,
          apiKey: apiKeyInput.trim() || undefined,
          model: modelInput.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data || !data.success) {
        setTestResult({
          success: false,
          message: data?.error || `Koneksi gagal (${res.status}). Periksa endpoint URL dan API Key, atau pastikan server backend aktif.`,
        })
      } else {
        if (Array.isArray(data.availableModels) && data.availableModels.length > 0) {
          setAvailableModels(data.availableModels)
          if (!modelInput && data.model) {
            setModelInput(data.model)
          }
        }
        setTestResult({
          success: true,
          message: `Berhasil terhubung ke 9router! Respon: "${data.reply}" (Model: ${data.model})` + (data.availableModels?.length ? ` — Ditemukan ${data.availableModels.length} model aktif.` : ''),
        })
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Gagal menghubungi server.',
      })
    } finally {
      setTestingConnection(false)
    }
  }

  return (
    <Card className="border-border shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-500" />
              Konfigurasi 9router & Kuota AI Global
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Atur endpoint 9router dan tetapkan batasan pemakaian otomatis untuk pengguna Free &amp; Pro
            </CardDescription>
          </div>
          <Badge variant={settingsLoading ? 'secondary' : (aiSettings?.hasApiKey ? 'success' : 'warning')} className="text-xs">
            {settingsLoading ? 'Memeriksa...' : (aiSettings?.hasApiKey ? '9router Siap' : 'API Key Kosong')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Endpoint Base URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Base URL 9router (OpenAI Compatible Endpoint)
            </label>
            <Input
              value={baseUrlInput}
              onChange={(e) => setBaseUrlInput(e.target.value)}
              placeholder="https://api.9router.com/v1"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Mendukung endpoint 9router Anda atau reverse proxy OpenAI kompatibel lainnya.
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">
                Model AI Default
              </label>
              <div className="flex items-center gap-2">
                {availableModels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCustomModelMode(!isCustomModelMode)}
                    className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                    {isCustomModelMode ? 'Pilih dari List' : 'Ketik Manual'}
                  </button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] px-2"
                  onClick={handleFetchModels}
                  disabled={fetchingModels || (!aiSettings?.hasApiKey && !apiKeyInput.trim())}
                  title="Deteksi daftar model langsung dari endpoint 9router"
                >
                  <Sparkles className={`h-3 w-3 mr-1 ${fetchingModels ? 'animate-spin' : 'text-amber-500'}`} />
                  {fetchingModels ? 'Mendeteksi...' : 'Deteksi Model'}
                </Button>
              </div>
            </div>

            {availableModels.length > 0 && !isCustomModelMode ? (
              <div className="space-y-1">
                <select
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-foreground"
                >
                  {!modelInput && (
                    <option value="">-- Pilih Model AI Default ({availableModels.length} Model Terdeteksi) --</option>
                  )}
                  {!availableModels.includes(modelInput) && modelInput && (
                    <option value={modelInput}>{modelInput} (Model Kustom Saat Ini)</option>
                  )}
                  {availableModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>
                    {availableModels.length} model terdeteksi dari 9router.{' '}
                    <button
                      type="button"
                      onClick={() => setIsCustomModelMode(true)}
                      className="text-primary hover:underline ml-1 cursor-pointer"
                    >
                      Ketik nama model manual
                    </button>
                  </span>
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <Input
                  list="available-models-datalist"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  placeholder="Kosong (Setup 9router dan klik 'Deteksi Model' untuk memilih)"
                  className="font-mono text-xs"
                />
                {availableModels.length > 0 && (
                  <datalist id="available-models-datalist">
                    {availableModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
                <p className="text-[11px] text-muted-foreground">
                  {availableModels.length > 0
                    ? 'Mode ketik manual. Anda juga dapat memilih saran autocomplete atau model custom dari 9router.'
                    : 'Model AI awal dibiarkan kosong. Klik "Deteksi Model" di atas untuk mengambil daftar model yang aktif di 9router Anda.'}
                </p>
              </div>
            )}
          </div>

          {/* Model AI Image (Ganti Produk) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Model Image / Vision (Ganti Produk di Foto)
            </label>
            <Input
              value={imageModelInput}
              onChange={(e) => setImageModelInput(e.target.value)}
              placeholder="ag/gemini-3.1-flash-image (default jika kosong)"
              className="font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Model yang digunakan pada fitur &quot;Ganti Produk di Foto&quot; (misal: ag/gemini-3.1-flash-image atau model image 9router lainnya).
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>API Key 9router</span>
              {aiSettings?.hasApiKey && (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">
                  Tersimpan ({aiSettings.apiKeyMasked})
                </span>
              )}
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={aiSettings?.hasApiKey ? 'Biarkan kosong jika tidak ingin mengubah key' : 'Masukkan API Key 9router Anda'}
                className="font-mono text-xs pr-9"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Daily Limits */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Batas Harian Free Tier
              </label>
              <Input
                type="number"
                min="0"
                value={freeLimitInput}
                onChange={(e) => setFreeLimitInput(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Request per hari</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">
                Batas Harian Pro Tier
              </label>
              <Input
                type="number"
                min="0"
                value={proLimitInput}
                onChange={(e) => setProLimitInput(e.target.value)}
                className="text-xs"
              />
              <p className="text-[11px] text-muted-foreground">Request per hari</p>
            </div>
          </div>
        </div>

        {/* Feedback messages */}
        {settingsMessage && (
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{settingsMessage}</span>
          </div>
        )}

        {settingsError && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-3 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{settingsError}</span>
          </div>
        )}

        {testResult && (
          <div className={`rounded-lg border p-3 text-xs flex items-center gap-2 ${
            testResult.success
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
          }`}>
            {testResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testingConnection || (!aiSettings?.hasApiKey && !apiKeyInput)}
            className="gap-2 text-xs"
          >
            {testingConnection ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
            Uji Koneksi 9router
          </Button>

          <Button
            type="button"
            onClick={handleSaveSettings}
            disabled={savingSettings}
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium"
          >
            {savingSettings ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Simpan Pengaturan 9router
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
