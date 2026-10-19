import * as React from 'react'
import {
  Sparkles,
  Bot,
  Copy,
  Check,
  Send,
  Layers,
  AlertTriangle,
  RefreshCw,
  Zap,
  HelpCircle,
  Wand2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useUser } from '@/context/UserContext'

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
}

type GeneratorMode =
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

const generatorTools: { mode: GeneratorMode; title: string; description: string }[] = [
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

export function AiGeneratorPage() {
  const { profile } = useUser()
  const [aiStatus, setAiStatus] = React.useState<AiStatus | null>(null)
  const [statusLoading, setStatusLoading] = React.useState(true)
  const [statusError, setStatusError] = React.useState('')

  const [mode, setMode] = React.useState<GeneratorMode>('prompt_builder')
  const [promptInput, setPromptInput] = React.useState('')
  const [targetModel, setTargetModel] = React.useState('ChatGPT / Claude / Gemini')
  const [writingTone, setWritingTone] = React.useState('Profesional')

  const [generating, setGenerating] = React.useState(false)
  const [generationError, setGenerationError] = React.useState('')
  const [generatedOutput, setGeneratedOutput] = React.useState('')
  const [copied, setCopied] = React.useState(false)

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
    } catch (err) {
      setStatusError(err instanceof Error ? err.message : 'Gagal memuat status AI')
    } finally {
      setStatusLoading(false)
    }
  }, [])

  React.useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleGenerate = async () => {
    if (!promptInput.trim()) return

    setGenerating(true)
    setGenerationError('')
    setGeneratedOutput('')

    const contextPayload = {
      profile: {
        company: profile.company,
        name: profile.name,
      },
      preferences: { targetModel, tone: writingTone },
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
          context: contextPayload,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Generasi gagal (${res.status})`)
      }

      setGeneratedOutput(data.result)
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

  const handleCopy = () => {
    if (!generatedOutput) return
    navigator.clipboard.writeText(generatedOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const usagePercent = aiStatus && !aiStatus.isUnlimited && aiStatus.dailyLimit > 0
    ? Math.min(100, Math.round((aiStatus.usageToday / aiStatus.dailyLimit) * 100))
    : 0

  const isQuotaDepleted = aiStatus && !aiStatus.isUnlimited && aiStatus.remaining <= 0

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-blue-500" />
            AI Generator
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Buat prompt terstruktur, rancang item invoice, susun proposal, dan buat pesan follow-up otomatis untuk berbagai kebutuhan Anda.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchStatus}
          disabled={statusLoading}
          className="gap-2 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`h-4 w-4 ${statusLoading ? 'animate-spin' : ''}`} />
          Perbarui Status
        </Button>
      </div>

      {statusError && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
          {statusError}
        </div>
      )}

      {/* Quota & 9router Connectivity Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Status Koneksi 9router */}
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${aiStatus?.configured ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
              <Bot className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground font-medium">Koneksi AI Backend</div>
              <div className="font-semibold text-sm truncate flex items-center gap-1.5 mt-0.5">
                {aiStatus?.configured ? (
                  <>
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    9router Terhubung
                  </>
                ) : (
                  <>
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    9router Belum Disetel
                  </>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                Model: <span className="font-mono text-foreground font-medium">{aiStatus?.model || 'Belum dipilih'}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Tier & Batas Pengguna */}
        <Card className="border-border">
          <CardContent className="p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl ${aiStatus?.tier === 'pro' || aiStatus?.role === 'admin' ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
              <Zap className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted-foreground font-medium">Status Akun Anda</div>
              <div className="font-semibold text-sm flex items-center gap-2 mt-0.5">
                <span className="capitalize">{aiStatus?.tier || 'Free'} Tier</span>
                <Badge variant={aiStatus?.tier === 'pro' || aiStatus?.role === 'admin' ? 'default' : 'secondary'} className="text-[10px] py-0">
                  {aiStatus?.role === 'admin' ? 'Unlimited (Admin)' : (aiStatus?.tier === 'pro' ? 'Pro Member' : 'Free Member')}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {aiStatus?.isUnlimited
                  ? 'Pemakaian tanpa batas harian'
                  : `Batas: ${aiStatus?.dailyLimit || 5} permintaan per hari`}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Kuota Hari Ini */}
        <Card className="border-border">
          <CardContent className="p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-muted-foreground font-medium">Kuota Pemakaian Hari Ini</span>
              <span className="font-bold text-foreground">
                {aiStatus?.isUnlimited
                  ? `${aiStatus?.usageToday || 0} kali digunakan`
                  : `${aiStatus?.usageToday || 0} / ${aiStatus?.dailyLimit || 5}`}
              </span>
            </div>
            {aiStatus && !aiStatus.isUnlimited ? (
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden my-1">
                <div
                  className={`h-full transition-all duration-300 ${
                    usagePercent >= 100
                      ? 'bg-rose-500'
                      : usagePercent > 80
                      ? 'bg-amber-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            ) : (
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden my-1">
                <div className="h-full bg-emerald-500 w-full" />
              </div>
            )}
            <div className="text-[11px] text-muted-foreground flex items-center justify-between mt-0.5">
              <span>{aiStatus?.isUnlimited ? 'Bebas kuota harian' : `Sisa ${aiStatus?.remaining ?? 0} request`}</span>
              <span className="text-[10px] text-muted-foreground">Reset tiap 00:00</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warning if 9router not configured */}
      {aiStatus && !aiStatus.configured && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-amber-700 dark:text-amber-300 text-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">9router API Key Belum Dikonfigurasi</p>
            <p className="text-xs text-amber-600/90 dark:text-amber-400/90">
              {profile.role === 'admin'
                ? 'Sebagai administrator, Anda dapat menyetel API Key 9router di menu "Pengaturan" pada tab "Konfigurasi 9router AI".'
                : 'Administrator belum memasukkan API Key 9router. Silakan hubungi administrator sistem untuk mengaktifkannya.'}
            </p>
          </div>
        </div>
      )}

      {/* Warning if Free Tier quota exceeded */}
      {isQuotaDepleted && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium">Batas Pemakaian Harian AI Tercapai</p>
            <p className="text-xs text-rose-600/90 dark:text-rose-400/90">
              Akun Anda berstatus Free dengan batas {aiStatus?.dailyLimit || 5} permintaan per hari. Kuota akan otomatis direset besok atau minta administrator untuk upgrade akun Anda ke Pro tier.
            </p>
          </div>
        </div>
      )}

      {/* Generator Tools Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Form Controls */}
        <div className="lg:col-span-5 space-y-5">
          {/* Mode Selector */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-500" />
                AI Tools
              </CardTitle>
              <CardDescription className="text-xs">
                Pilih tool sesuai kebutuhan. Hasil bisa diedit dan disalin.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {generatorTools.map((tool) => (
                <button
                  key={tool.mode}
                  type="button"
                  onClick={() => setMode(tool.mode)}
                  aria-pressed={mode === tool.mode}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    mode === tool.mode ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:bg-accent'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Sparkles className="h-4 w-4 shrink-0 text-blue-500" />
                    {tool.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{tool.description}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Prompt Input & Generated Output */}
        <div className="lg:col-span-7 space-y-5">
          {/* Prompt Input Box */}
          <Card className="border-border shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-blue-500" />
                  Instruksi / Permintaan AI
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Tekan Generate untuk memproses via 9router
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                rows={5}
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder={
                  mode === 'prompt_builder'
                    ? 'Jelaskan apa yang ingin Anda hasilkan (misal: "Buatkan prompt untuk mengevaluasi kelayakan proyek software freelance...")'
                    : mode === 'image_prompt'
                    ? 'Jelaskan gambar yang ingin dibuat: subjek, suasana, gaya visual, komposisi...'
                    : mode === 'video_prompt'
                    ? 'Jelaskan adegan, aksi, durasi, dan gerakan kamera untuk video...'
                    : mode === 'prompt_checker' || mode === 'prompt_optimizer'
                    ? 'Tempel prompt yang ingin diperiksa atau disempurnakan...'
                    : mode === 'humanizer'
                    ? 'Tempel teks yang ingin ditulis ulang dengan gaya lebih natural...'
                    : mode === 'website_prompt'
                    ? 'Jelaskan website atau aplikasi yang ingin dibangun...'
                    : mode === 'invoice_items'
                    ? 'Jelaskan pekerjaan atau paket jasa yang ingin dirinci ke dalam item invoice...'
                    : mode === 'proposal_structure'
                    ? 'Jelaskan kebutuhan proposal penawaran Anda...'
                    : 'Jelaskan kondisi penagihan atau pesan yang ingin disampaikan ke klien...'
                }
                className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500"
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Target penggunaan
                  <select
                    value={targetModel}
                    onChange={(event) => setTargetModel(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"
                  >
                    <option>ChatGPT / Claude / Gemini</option>
                    <option>Midjourney</option>
                    <option>Flux / Stable Diffusion</option>
                    <option>DALL-E</option>
                    <option>Runway / Kling / Sora</option>
                    <option>Cursor / Bolt / Lovable</option>
                    <option>WhatsApp / Email</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-muted-foreground">
                  Gaya / tone
                  <select
                    value={writingTone}
                    onChange={(event) => setWritingTone(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background p-2 text-sm text-foreground"
                  >
                    <option>Profesional</option>
                    <option>Kreatif</option>
                    <option>Ramah dan santai</option>
                    <option>Persuasif</option>
                    <option>Sinematik</option>
                    <option>Teknis dan detail</option>
                  </select>
                </label>
              </div>

              <div className="flex items-center justify-between pt-1">
                <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <HelpCircle className="h-3.5 w-3.5" />
                  <span>{promptInput.length} karakter · Diproses via 9router</span>
                </div>

                <div className="flex gap-2">
                  {promptInput.trim() && mode !== 'prompt_optimizer' && (
                    <Button
                      variant="outline"
                      onClick={() => setMode('prompt_optimizer')}
                      disabled={generating}
                      className="gap-2"
                    >
                      <Wand2 className="h-4 w-4" />
                      Optimalkan
                    </Button>
                  )}
                  <Button
                    onClick={handleGenerate}
                    disabled={generating || !promptInput.trim() || isQuotaDepleted || !aiStatus?.configured}
                    className="gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                  >
                    {generating ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Memproses via 9router...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Generate
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {generationError && (
                <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400 mt-2">
                  {generationError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Generated Result Output */}
          <Card className="border-border">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-emerald-500" />
                  Hasil Generasi AI
                </CardTitle>
                <CardDescription className="text-xs">
                  {generatedOutput ? 'Siap disalin atau diaplikasikan ke dokumen Anda' : 'Hasil akan tampil di sini'}
                </CardDescription>
              </div>

              {generatedOutput && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5 text-xs h-8"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      Disalin!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Salin Teks
                    </>
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {generatedOutput ? (
                <div className="relative">
                  <pre className="w-full max-h-[500px] overflow-y-auto rounded-lg border border-border bg-muted/40 p-4 text-xs font-mono text-foreground whitespace-pre-wrap leading-relaxed select-text">
                    {generatedOutput}
                  </pre>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground flex flex-col items-center justify-center space-y-2">
                  <Bot className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">Belum ada hasil generasi</p>
                  <p className="text-xs max-w-sm">
                    Pilih salah satu preset atau ketik instruksi pada kotak di atas, kemudian klik &quot;Generate Sekarang&quot;.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}