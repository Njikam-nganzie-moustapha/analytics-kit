// Site IDs are free-form slugs: alphanumeric, hyphens, underscores, dots. Max 64 chars.
// Rejects path traversal (../) and injection attempts before they reach SQL or meta reflection.
const SITE_RE     = /^[a-zA-Z0-9_\-.]{1,64}$/
// Release tags: semver-like slugs. e.g. "1.2.3", "v2.0.0-rc.1", "abc1234"
const RELEASE_RE  = /^[a-zA-Z0-9_\-.+]{1,128}$/
// Source map filenames: paths with slashes allowed, no traversal. e.g. "assets/main.abc.js.map"
const FILENAME_RE = /^[a-zA-Z0-9_\-./]{1,256}$/

export function parseSite(raw: string | undefined): { site: string } | null {
  if (!raw || !SITE_RE.test(raw)) return null
  return { site: raw }
}

export function parseRelease(raw: string | undefined): { release: string } | null {
  if (!raw || !RELEASE_RE.test(raw)) return null
  return { release: raw }
}

export function parseFilename(raw: string | undefined): { filename: string } | null {
  if (!raw || !FILENAME_RE.test(raw) || raw.includes('..')) return null
  return { filename: raw }
}

// Audit target URL: http(s) only, public host, length-capped. Blocks the
// obvious SSRF targets (localhost, link-local, private ranges) before fetch.
export function parseAuditUrl(raw: string | undefined): { url: string } | null {
  if (!raw || raw.length > 2048) return null
  let u: URL
  try { u = new URL(raw) } catch { return null }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (
    host === 'localhost' || host === '0.0.0.0' || host.endsWith('.local') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    host === '[::1]' || host.startsWith('[fc') || host.startsWith('[fd')
  ) return null
  return { url: u.toString() }
}

export interface FunnelStepInput { label: string; type: 'url' | 'event'; match: string }

// Validates a funnel definition: 2–8 ordered steps, each matching a URL
// substring or a custom event name.
export function parseSteps(raw: unknown): FunnelStepInput[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 8) return null
  const out: FunnelStepInput[] = []
  for (const s of raw) {
    if (!s || typeof s !== 'object') return null
    const o = s as Record<string, unknown>
    const match = typeof o.match === 'string' ? o.match.slice(0, 120).trim() : ''
    if (!match) return null
    out.push({
      type: o.type === 'event' ? 'event' : 'url',
      label: (typeof o.label === 'string' && o.label.trim() ? o.label : match).slice(0, 60),
      match,
    })
  }
  return out
}
