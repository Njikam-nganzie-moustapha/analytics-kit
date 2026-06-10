// Site IDs are free-form slugs: alphanumeric, hyphens, underscores, dots. Max 64 chars.
// Rejects path traversal (../) and injection attempts before they reach SQL or meta reflection.
const SITE_RE = /^[a-zA-Z0-9_\-.]{1,64}$/

export function parseSite(raw: string | undefined): { site: string } | null {
  if (!raw || !SITE_RE.test(raw)) return null
  return { site: raw }
}
