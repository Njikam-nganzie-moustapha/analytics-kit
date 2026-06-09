import type { MiddlewareHandler } from 'hono'

const KEY = process.env.QUERY_API_KEY

// No-op when QUERY_API_KEY is unset — useful for local dev / same-origin dashboard.
export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!KEY) return next()
  const provided = c.req.header('x-api-key') ?? c.req.query('api_key')
  if (provided !== KEY) return c.json({ error: 'unauthorized' }, 401)
  return next()
}
