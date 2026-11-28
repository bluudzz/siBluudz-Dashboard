/**
 * Return true only when the app is accessed from a local loopback host.
 */
export function isLocalhostOrigin(hostname?: string): boolean {
  const raw = (hostname ?? (typeof window !== 'undefined' ? window.location.hostname : '')).trim().toLowerCase()
  return raw === 'localhost' || raw === '127.0.0.1' || raw === '::1' || raw === '[::1]'
}
