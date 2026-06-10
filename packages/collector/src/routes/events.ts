import { Hono } from 'hono'
import type { AnalyticsEvent } from '@analytics-kit/storage'
import type { Queue } from '../queue/types'
import { auth } from '../middleware/auth'
import { rateLimit } from '../middleware/ratelimit'
import { maybeDecompress } from '../decompress'
import { isBotUA, isFilteredEvent } from '../middleware/filter'

const MAX_EVENTS_PER_BATCH = 200

// Per-fingerprint error cap: max N occurrences per window
const FP_MAX     = parseInt(process.env.ERROR_FP_MAX_PER_WINDOW ?? '50')
const FP_WINDOW  = parseInt(process.env.ERROR_FP_WINDOW_MS      ?? '60000') // 1 min

const ERROR_TYPES = new Set(['js_error', 'network_error'])

// fingerprint → { count, windowStart }
const fpCounts = new Map<string, { count: number; windowStart: number }>()

function errorFingerprint(e: AnalyticsEvent): string {
  const p = (e as Record<string, unknown>).payload
  const inner = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : (e as Record<string, unknown>)
  const msg = String(inner.msg ?? inner.message ?? e.type ?? '').slice(0, 120)
  return `${e.site ?? ''}|${e.type}|${msg}`
}

function isRateLimited(fp: string, now: number): boolean {
  let entry = fpCounts.get(fp)
  if (!entry || now - entry.windowStart > FP_WINDOW) {
    fpCounts.set(fp, { count: 1, windowStart: now })
    return false
  }
  entry.count++
  if (entry.count > FP_MAX) return true
  fpCounts.set(fp, entry)
  return false
}

// Evict stale entries occasionally to prevent unbounded growth
let lastEvict = Date.now()
function maybeEvict(now: number) {
  if (now - lastEvict < FP_WINDOW * 5) return
  lastEvict = now
  for (const [k, v] of fpCounts) {
    if (now - v.windowStart > FP_WINDOW) fpCounts.delete(k)
  }
}

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
    const ua = c.req.header('user-agent') ?? ''
    if (isBotUA(ua)) return c.body(null, 204)

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

      const now = Date.now()
      maybeEvict(now)

      const valid = events
        .slice(0, MAX_EVENTS_PER_BATCH)
        .filter(isValidEvent)
        .filter(e => !isFilteredEvent(e))
        .filter(e => {
          if (!ERROR_TYPES.has(e.type)) return true
          return !isRateLimited(errorFingerprint(e), now)
        })

      if (valid.length === 0) return c.body(null, 204)

      await queue.push(valid)
      return c.body(null, 204)
    } catch {
      return c.json({ error: 'bad_request' }, 400)
    }
  })

  r.get('/health', c => c.json({ ok: true, queued: queue.size() }))

  return r
}
