export type ProductSwapScenario = 'exact_replace' | 'handheld' | 'tabletop' | 'apparel'
export type ProductSwapFidelity = 'strict' | 'balanced'
export type ProductSwapScale = 'match_reference' | 'prominent' | 'natural'
export type ProductSwapResolution = '' | '1K' | '2K' | '4K'

export interface ProductSwapSettings {
  scenario: ProductSwapScenario
  fidelity: ProductSwapFidelity
  scale: ProductSwapScale
}

export const PRODUCT_SWAP_SCENARIOS: ReadonlyArray<{
  id: ProductSwapScenario
  label: string
  guidance: string
  directive: string
}>

export const PRODUCT_SWAP_FIDELITY: ReadonlyArray<{
  id: ProductSwapFidelity
  label: string
  directive: string
}>

export const PRODUCT_SWAP_SCALE: ReadonlyArray<{
  id: ProductSwapScale
  label: string
  directive: string
}>

export const PRODUCT_SWAP_RESOLUTIONS: ReadonlyArray<{
  id: ProductSwapResolution
  label: string
}>

export const PRODUCT_SWAP_QUICK_CHIPS: ReadonlyArray<{
  label: string
  text: string
}>

export const defaultProductSwapSettings: ProductSwapSettings

export function normalizeProductSwapSettings(input?: Partial<ProductSwapSettings> | null): ProductSwapSettings
export function buildProductSwapPrompt(
  settings?: Partial<ProductSwapSettings> | null,
  instructions?: string,
  resolution?: '1K' | '2K' | '4K'
): string
