import type { MiddlewareHandler } from 'hono'

// Site keys loaded from SITE_KEYS env var (comma-separated)
// e.g. SITE_KEYS=key-abc123,key-def456
const _keys = new Set<string>(
  (process.env.SITE_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
)

// Always allow in non-production for local development
if (process.env.NODE_ENV !== 'production') _keys.add('test-key')

export const auth: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-site-key') ?? c.req.query('sk') ?? ''
  if (!_keys.has(key)) return c.json({ error: 'unauthorized' }, 401)
  await next()
}
