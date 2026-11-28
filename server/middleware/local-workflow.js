const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])

/**
 * Check whether a Host / X-Forwarded-Host header value refers exclusively to loopback.
 */
export function isLocalHostName(rawHost) {
  const first = String(rawHost || '').split(',')[0].trim().toLowerCase()
  if (!first) return false
  let host = first
  if (first.startsWith('[')) {
    const end = first.indexOf(']')
    if (end < 0) return false
    host = first.slice(1, end)
  } else {
    const colonCount = (first.match(/:/g) || []).length
    if (colonCount === 1) {
      host = first.slice(0, first.indexOf(':'))
    }
  }
  return LOCAL_HOSTNAMES.has(host)
}

/**
 * Determine if the current server configuration allows Auto Workflow execution.
 */
export function isLocalWorkflowEnvironment(env = process.env) {
  if (env.ALLOW_REMOTE_WORKFLOWS === 'true') return true
  const rawOrigin = String(env.APP_ORIGIN || '').trim()
  if (rawOrigin) {
    try {
      const parsed = new URL(rawOrigin)
      return isLocalHostName(parsed.hostname)
    } catch {
      return false
    }
  }
  return true
}

/**
 * Validate that both the server environment and incoming request headers are localhost-only.
 */
export function isLocalWorkflowRequest(req, env = process.env) {
  if (!isLocalWorkflowEnvironment(env)) return false
  const requestHost = req.get?.('x-forwarded-host') || req.get?.('host') || req.hostname || ''
  if (!isLocalHostName(requestHost)) return false

  const origin = req.get?.('origin')
  if (origin) {
    try {
      const parsed = new URL(origin)
      if (!isLocalHostName(parsed.hostname)) return false
    } catch {
      return false
    }
  }
  return true
}

/**
 * Express middleware locking Auto Workflow endpoints when accessed outside localhost.
 */
export function requireLocalWorkflow(req, res, next) {
  if (isLocalWorkflowRequest(req)) return next()
  return res.status(403).json({
    error: 'Auto Workflow terkunci pada website/VPS dan hanya dapat dibuka melalui localhost.',
    code: 'WORKFLOW_LOCAL_ONLY',
  })
}
