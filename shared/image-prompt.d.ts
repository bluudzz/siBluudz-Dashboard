export interface ImagePromptVariant {
  label: string
  prompt: string
}

export interface ImagePromptBreakdown {
  subject: string
  composition: string
  lighting: string
  color_palette: string
}

export interface ImagePromptSpec {
  title: string
  main_prompt: string
  negative_prompt: string
  variants: ImagePromptVariant[]
  breakdown: ImagePromptBreakdown
  parameters: string
  tips: string[]
}

export interface ImagePromptOptions {
  target?: string
  style?: string
  ratio?: string
  lighting?: string
  language?: string
  details?: string
}

export const IMAGE_PROMPT_TARGETS: ReadonlyArray<{ id: string; label: string; guidance: string }>
export const IMAGE_PROMPT_STYLES: ReadonlyArray<{ id: string; label: string; guidance: string }>
export const IMAGE_PROMPT_RATIOS: ReadonlyArray<string>
export const IMAGE_PROMPT_LIGHTING: ReadonlyArray<{ id: string; label: string; guidance: string }>
export const IMAGE_PROMPT_LANGUAGES: ReadonlyArray<{ id: string; label: string }>
export const IMAGE_PROMPT_STARTERS: ReadonlyArray<{
  id: string
  label: string
  style: string
  ratio: string
  lighting: string
  prompt: string
  details: string
}>

export function estimateImagePromptMetrics(text?: string): { chars: number; words: number }
export function buildImagePrompt(input?: string, options?: ImagePromptOptions): string
export function parseImagePromptSpec(raw?: string): ImagePromptSpec | null
export function formatImagePromptText(spec?: ImagePromptSpec | null): string
