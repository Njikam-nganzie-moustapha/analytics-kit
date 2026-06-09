import { Hono } from 'hono'
import type { MiddlewareHandler } from 'hono'

const KEY      = process.env.QUERY_API_KEY
const PASSWORD = process.env.DASHBOARD_PASSWORD

// No-op when QUERY_API_KEY is unset — useful for local dev / same-origin dashboard.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!KEY) return next()
  const provided = c.req.header('x-api-key') ?? c.req.query('api_key')
  if (provided !== KEY) return c.json({ error: 'unauthorized' }, 401)
  return next()
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
    return c.json({ token: KEY, required: true })
  })

  return router
}
