export function validateCron(expression: string): { valid: boolean; error?: string }
export function matchesCron(expression: string, date?: Date, timeZone?: string): boolean
export function minuteKey(date?: Date, timeZone?: string): string
