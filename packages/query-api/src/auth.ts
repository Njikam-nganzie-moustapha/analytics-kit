import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { signToken, verifyToken, constantTimeEqual } from './token'

const KEY      = process.env.QUERY_API_KEY
const PASSWORD = process.env.DASHBOARD_PASSWORD
const ALLOW_QUERY_KEY = process.env.ALLOW_QUERY_KEY === '1'

// Brute-force guard on POST /auth: max 10 attempts per IP per 5 minutes
const authAttempts = new Map<string, { count: number; windowStart: number }>()
function isAuthRateLimited(ip: string, now: number): boolean {
  const WINDOW = 5 * 60 * 1000; const MAX = 10
  if (now % 30_000 < 500) for (const [k, v] of authAttempts) if (now - v.windowStart > WINDOW) authAttempts.delete(k)
  const e = authAttempts.get(ip)
  if (!e || now - e.windowStart > WINDOW) { authAttempts.set(ip, { count: 1, windowStart: now }); return false }
  e.count++; return e.count > MAX
}

// No-op when QUERY_API_KEY is unset — useful for local dev / same-origin dashboard.
// Accepts the static key (server-to-server) or an unexpired signed session token.
// Uses constant-time comparison to prevent timing-oracle attacks on the key.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!KEY) return next()
  const expected  = KEY.trim()
  const headerKey = (c.req.header('x-api-key') ?? '').trim()
  const queryKey  = ALLOW_QUERY_KEY ? (c.req.query('api_key') ?? '').trim() : ''
  const provided  = headerKey || queryKey
  if (!provided) {
    console.warn('[query-api] 401 missing key —', c.req.path)
    return c.json({ error: 'unauthorized' }, 401)
  }
  if (await constantTimeEqual(provided, expected)) return next()
  if (await verifyToken(provided, expected)) return next()
  console.warn('[query-api] 401 invalid key —', c.req.path)
  return c.json({ error: 'unauthorized' }, 401)
}

// Auth status + password exchange — must be registered BEFORE requireAuth middleware.
export function authRouter() {
  const router = new Hono()

  // GET /auth — tell the client whether a login form is needed
  router.get('/', c => c.json({ required: !!(PASSWORD && KEY) }))

  // POST /auth — exchange password for the API token
  router.post('/', async c => {
    const ip = c.req.header('x-forwarded-for') ?? 'anon'
    if (isAuthRateLimited(ip, Date.now())) return c.json({ error: 'too many requests' }, 429)
    if (!PASSWORD || !KEY) {
      // Not configured — open access, no token needed
      return c.json({ token: null as string | null, required: false })
    }
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as Record<string, unknown>))
    if (body.password !== PASSWORD) {
      console.warn('[query-api] /auth failed —', ip)
      return c.json({ error: 'invalid password' }, 401)
    }
    const { token, exp } = await signToken(KEY)
    return c.json({ token, exp, required: true })
  })

  return router
}
