// Short-lived HMAC session tokens.
//
// `/auth` (password exchange) hands the dashboard one of these instead of the
// long-lived QUERY_API_KEY, so the static key never reaches the browser. The
// auth guard accepts either the static key (server-to-server callers like the
// LIA backend) or an unexpired signed token (the dashboard). Uses Web Crypto,
// available in both Cloudflare Workers and Bun.

const enc = new TextEncoder()
const dec = new TextDecoder()

export const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000 // 12h

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  const str = atob(s + '='.repeat(pad))
  const bytes = new Uint8Array(str.length)
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signToken(secret: string, ttlMs = DEFAULT_TTL_MS, now = Date.now()): Promise<{ token: string; exp: number }> {
  const exp = now + ttlMs
  const payload = b64url(enc.encode(JSON.stringify({ exp })))
  const key = await hmacKey(secret)
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return { token: `${payload}.${b64url(new Uint8Array(sig))}`, exp }
}

export async function verifyToken(token: string, secret: string, now = Date.now()): Promise<boolean> {
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const key = await hmacKey(secret)
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(payload))
    if (!ok) return false
    const parsed = JSON.parse(dec.decode(b64urlToBytes(payload))) as { exp?: number }
    return typeof parsed.exp === 'number' && parsed.exp > now
  } catch {
    return false
  }
}
