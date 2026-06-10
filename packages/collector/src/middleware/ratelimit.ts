import type { MiddlewareHandler } from 'hono'

const WINDOW = 60_000  // 1 minute
const MAX    = 120     // requests per IP per window

interface Slot { n: number; reset: number }
const _slots = new Map<string, Slot>()

// Periodic cleanup — prevent unbounded map growth
setInterval(() => {
  const now = Date.now()
  for (const [ip, slot] of _slots) { if (now > slot.reset) _slots.delete(ip) }
}, 300_000)

// Trust X-Forwarded-For only when behind a CDN/reverse-proxy (TRUSTED_PROXY=1).
// Without it, clients can spoof the header and bypass rate limiting.
const TRUSTED_PROXY = process.env.TRUSTED_PROXY === '1'

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const ip = TRUSTED_PROXY
    ? (c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? c.req.header('x-real-ip') ?? 'anon')
    : (c.req.header('x-real-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'anon')
  const now = Date.now()
  const slot = _slots.get(ip)

  if (!slot || now > slot.reset) {
    _slots.set(ip, { n: 1, reset: now + WINDOW })
  } else {
    slot.n++
    if (slot.n > MAX) return c.json({ error: 'rate limit exceeded' }, 429)
  }
  await next()
}
