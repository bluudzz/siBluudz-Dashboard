export interface RelightSettings {
  preset: string
  intensity: string
  temperature: string
  shadows: string
  pattern: string
  direction: string
}
export interface RelightOption { id: string; label: string; prompt: string }
export const relightPresets: (RelightOption & { description: string })[]
export const relightOptions: Record<Exclude<keyof RelightSettings, 'preset'>, RelightOption[]>
export const defaultRelightSettings: RelightSettings
export const RELIGHT_PROMPT_VERSION: 'universal-master-v3'
export function normalizeRelightSettings(input?: Partial<RelightSettings>): RelightSettings
export type RelightResolution = '1K' | '2K' | '4K'
export function buildRelightPrompt(input?: Partial<RelightSettings>, instructions?: string, resolution?: RelightResolution): string
