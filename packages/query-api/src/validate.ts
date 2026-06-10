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
