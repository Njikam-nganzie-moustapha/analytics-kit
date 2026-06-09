import { Hono } from 'hono'
import type { AnalyticsEvent } from '@analytics-kit/storage'
import type { Queue } from '../queue/types'
import { auth } from '../middleware/auth'
import { rateLimit } from '../middleware/ratelimit'
import { maybeDecompress } from '../decompress'

function isValidEvent(e: unknown): e is AnalyticsEvent {
  if (!e || typeof e !== 'object') return false
  const ev = e as Record<string, unknown>
  return typeof ev.type === 'string' && typeof ev.sid === 'string' && typeof ev.t === 'number'
}

export function eventsRouter(queue: Queue): Hono {
  const r = new Hono()

  r.use('*', rateLimit)
  r.use('*', auth)

  // POST /e — main ingest endpoint
  // Body: JSON array | compressed string (X-Compressed: 1)
  r.post('/', async c => {
    try {
      const compressed = c.req.header('x-compressed') === '1'
      const ct = c.req.header('content-type') ?? ''

      let events: AnalyticsEvent[]
      if (ct.includes('text/plain') || compressed) {
        const raw = await c.req.text()
        const json = await maybeDecompress(raw, compressed)
        const parsed = JSON.parse(json)
        events = Array.isArray(parsed) ? parsed : [parsed]
      } else {
        const parsed = await c.req.json()
        events = Array.isArray(parsed) ? parsed : [parsed]
      }

      const valid = events.filter(isValidEvent)
      if (valid.length === 0) return c.body(null, 204)

      await queue.push(valid)
      return c.body(null, 204)
    } catch {
      return c.json({ error: 'bad_request' }, 400)
    }
  })

  // GET /e/health — queue depth (for dashboards / alerting)
  r.get('/health', c => c.json({ ok: true, queued: queue.size() }))

  return r
}
