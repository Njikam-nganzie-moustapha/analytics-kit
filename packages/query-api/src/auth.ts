import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'
import { signToken, verifyToken } from './token'

const KEY      = process.env.QUERY_API_KEY
const PASSWORD = process.env.DASHBOARD_PASSWORD
const ALLOW_QUERY_KEY = process.env.ALLOW_QUERY_KEY === '1'

// No-op when QUERY_API_KEY is unset — useful for local dev / same-origin dashboard.
// Accepts the static key (server-to-server) or an unexpired signed session token.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!KEY) return next()
  const headerKey = (c.req.header('x-api-key') ?? '').trim()
  const queryKey  = ALLOW_QUERY_KEY ? (c.req.query('api_key') ?? '').trim() : ''
  const provided  = headerKey || queryKey
  if (!provided) return c.json({ error: 'unauthorized' }, 401)
  if (provided === KEY.trim()) return next()
  if (await verifyToken(provided, KEY.trim())) return next()
  return c.json({ error: 'unauthorized' }, 401)
}

// Auth status + password exchange — must be registered BEFORE requireAuth middleware.
export function authRouter() {
  const router = new Hono()

  // GET /auth — tell the client whether a login form is needed
  router.get('/', c => c.json({ required: !!(PASSWORD && KEY) }))

  // POST /auth — exchange password for the API token
  router.post('/', async c => {
    if (!PASSWORD || !KEY) {
      // Not configured — open access, no token needed
      return c.json({ token: null as string | null, required: false })
    }
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as Record<string, unknown>))
    if (body.password !== PASSWORD) {
      return c.json({ error: 'invalid password' }, 401)
    }
    const { token, exp } = await signToken(KEY)
    return c.json({ token, exp, required: true })
  })

  return router
}
