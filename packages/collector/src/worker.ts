import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { TursoAdapter } from '../../storage/src/turso'
import type { AnalyticsEvent } from '../../storage/src/types'

interface Env {
  TURSO_URL:    string
  TURSO_TOKEN:  string
  SITE_KEYS:    string
  CORS_ORIGINS?: string
}

function isValid(e: unknown): e is AnalyticsEvent {
  if (!e || typeof e !== 'object') return false
  const ev = e as Record<string, unknown>
  return typeof ev.type === 'string' && typeof ev.sid === 'string' && typeof ev.t === 'number'
}

const app = new Hono<{ Bindings: Env }>()

app.use('*', async (c, next) => {
  const origins = c.env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  return cors({
    origin: origins.length === 1 && origins[0] === '*' ? '*' : origins,
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Site-Key', 'X-Compressed'],
    maxAge: 86400,
  })(c, next)
})

app.get('/health', c => c.json({ ok: true, ts: Date.now() }))

app.post('/e', async c => {
  // Auth
  const keys = new Set(c.env.SITE_KEYS.split(',').map(k => k.trim()).filter(Boolean))
  const key = c.req.header('x-site-key') ?? c.req.query('sk') ?? ''
  if (!keys.has(key)) return c.json({ error: 'unauthorized' }, 401)

  try {
    const body = await c.req.json()
    // Support both { v:1, events: [...] } envelope and raw array
    const raw: unknown[] = Array.isArray(body) ? body : (body?.events ?? [body])
    const events = raw.filter(isValid)
    if (events.length === 0) return c.body(null, 204)

    const storage = new TursoAdapter({ url: c.env.TURSO_URL, token: c.env.TURSO_TOKEN })
    await storage.write(events)
    return c.body(null, 204)
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
})

export default app
