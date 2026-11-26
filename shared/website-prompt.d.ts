export type WebsiteProjectTypeId = 'landing' | 'webapp' | 'existing_feature' | 'fullstack'
export type WebsiteAssistantId = 'agent' | 'cursor' | 'v0_bolt' | 'general'
export type WebsiteQualityStandardId =
  | 'responsive'
  | 'dual_theme'
  | 'a11y'
  | 'no_new_deps'
  | 'tests'

export interface WebsiteProjectType {
  id: WebsiteProjectTypeId
  label: string
  guidance: string
}

export interface WebsiteAssistant {
  id: WebsiteAssistantId
  label: string
}

export interface WebsiteQualityStandard {
  id: WebsiteQualityStandardId
  label: string
}

export interface WebsitePromptStarter {
  id: string
  label: string
  projectType: WebsiteProjectTypeId
  stack: string[]
  prompt: string
  constraints: string
}

export interface WebsiteSpecFile {
  path: string
  purpose: string
}

export interface WebsiteSpecComponent {
  name: string
  responsibility: string
}

export interface WebsiteSpec {
  title: string
  summary: string
  stack: string[]
  files: WebsiteSpecFile[]
  components: WebsiteSpecComponent[]
  user_flows: string[]
  states: {
    empty: string
    loading: string
    error: string
  }
  acceptance_criteria: string[]
  execution_prompt: string
}

export const WEBSITE_PROJECT_TYPES: WebsiteProjectType[]
export const WEBSITE_ASSISTANTS: WebsiteAssistant[]
export const WEBSITE_STACK_OPTIONS: string[]
export const WEBSITE_QUALITY_STANDARDS: WebsiteQualityStandard[]
export const WEBSITE_PROMPT_STARTERS: WebsitePromptStarter[]

export function estimateWebsitePromptMetrics(text?: string): {
  chars: number
  words: number
  approxTokens: number
}

export function buildWebsitePrompt(
  input?: string,
  options?: {
    projectType?: string
    assistant?: string
    stack?: string[]
    standards?: string[]
    constraints?: string
  }
): string

export function parseWebsiteSpec(rawText: string): WebsiteSpec | null
export function formatWebsiteSpecMarkdown(spec: WebsiteSpec): string
