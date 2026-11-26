export type PromptCheckerGoalId = 'general' | 'coding' | 'writing' | 'analysis' | 'image'
export type PromptCheckerFocusId =
  | 'clarity'
  | 'anti_hallucination'
  | 'output_format'
  | 'token_efficiency'
  | 'strict_constraints'

export interface PromptCheckerGoal {
  id: PromptCheckerGoalId
  label: string
  guidance: string
}

export interface PromptCheckerFocus {
  id: PromptCheckerFocusId
  label: string
}

export interface LocalPromptCheck {
  id: 'context' | 'task' | 'format' | 'constraints'
  label: string
  passed: boolean
}

export interface LocalPromptAnalysis {
  chars: number
  words: number
  approxTokens: number
  passedCount: number
  totalChecks: number
  checks: LocalPromptCheck[]
}

export interface PromptEvaluationIssue {
  title: string
  detail: string
  severity: 'high' | 'medium' | 'low'
}

export interface PromptEvaluation {
  overall: number
  scores: {
    clarity: number
    specificity: number
    constraints: number
  }
  summary: string
  strengths: string[]
  issues: PromptEvaluationIssue[]
  recommendations: string[]
  improved_prompt: string
}

export const PROMPT_CHECKER_GOALS: PromptCheckerGoal[]
export const PROMPT_CHECKER_FOCUSES: PromptCheckerFocus[]

export function analyzePromptLocally(text?: string): LocalPromptAnalysis
export function buildCheckerPrompt(
  prompt?: string,
  options?: { goal?: string; focuses?: string[]; extraCriteria?: string }
): string
export function parsePromptEvaluation(rawText: string): PromptEvaluation | null
