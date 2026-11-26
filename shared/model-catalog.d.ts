export interface ModelCatalogItem {
  id: string
  owner?: string
  imageOutput?: boolean
}

export interface CuratedModels {
  latest: string[]
  legacy: string[]
  all: string[]
}

export function isNonTextOrNoiseModel(id: string, catalogEntry?: ModelCatalogItem): boolean
export function parseModelFamilyAndVersion(id: string): {
  provider: string
  family: string | null
  version: number
}
export function sortModelsNewestFirst(models: string[]): string[]
export function isLegacyModel(id: string, allModels: string[]): boolean
export function curateTextModels(models: string[], catalog?: ModelCatalogItem[]): CuratedModels
export function curateImageModels(models: string[]): CuratedModels
export function pickPreferredLatestTextModel(models: string[], catalog?: ModelCatalogItem[]): string
