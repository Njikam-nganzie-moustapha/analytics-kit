import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import { TursoAdapter } from '../../storage/src/turso'
import type { AnalyticsEvent, GeoInfo } from '../../storage/src/types'

interface Env {
  TURSO_URL:    string
  TURSO_TOKEN:  string
  SITE_KEYS:    string
  CORS_ORIGINS?: string
  ERROR_FP_MAX_PER_WINDOW?: string
  ERROR_FP_WINDOW_MS?:      string
}

// ── Bot filter ────────────────────────────────────────────────────────────────

const BOT_RE = /bot|crawler|spider|slurp|semrush|ahrefsbot|mj12bot|dotbot|petalbot|yandex|bingpreview|curl|wget|python-requests|go-http-client|java\/|okhttp/i
const EXT_RE = /^(?:chrome-extension|moz-extension|safari-web-extension):\/\//i

function isBotUA(ua: string): boolean { return BOT_RE.test(ua) }
function isExtURL(url: string): boolean { return EXT_RE.test(url) }

// ── Per-fingerprint error rate limiting ───────────────────────────────────────
// Module-level — persists for the lifetime of a CF Worker isolate

const fpCounts = new Map<string, { count: number; windowStart: number }>()
let lastEvict = Date.now()

function isErrorRateLimited(fp: string, now: number, max: number, windowMs: number): boolean {
  if (now - lastEvict > windowMs * 5) {
    lastEvict = now
    for (const [k, v] of fpCounts) {
      if (now - v.windowStart > windowMs) fpCounts.delete(k)
    }
  }
  let entry = fpCounts.get(fp)
  if (!entry || now - entry.windowStart > windowMs) {
    fpCounts.set(fp, { count: 1, windowStart: now }); return false
  }
  entry.count++
  fpCounts.set(fp, entry)
  return entry.count > max
}

// ── Validation ────────────────────────────────────────────────────────────────

const ERROR_TYPES = new Set(['js_error', 'network_error'])

function isValid(e: unknown): e is AnalyticsEvent {
  if (!e || typeof e !== 'object') return false
  const ev = e as Record<string, unknown>
  return typeof ev.type === 'string' && typeof ev.sid === 'string' && typeof ev.t === 'number'
}

function errorFingerprint(e: AnalyticsEvent): string {
  const p = (e as Record<string, unknown>).payload
  const inner = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : (e as Record<string, unknown>)
  const msg = String(inner.msg ?? inner.message ?? e.type ?? '').slice(0, 120)
  return `${e.site ?? ''}|${e.type}|${msg}`
}

function isFiltered(e: AnalyticsEvent): boolean {
  if (!ERROR_TYPES.has(e.type)) return false
  const p = (e as Record<string, unknown>).payload
  const inner = typeof p === 'object' && p !== null ? (p as Record<string, unknown>) : (e as Record<string, unknown>)
  const url = String(inner.url ?? inner.filename ?? '')
  return isExtURL(url)
}

// ── App ───────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>()

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  c.header('Cache-Control', 'no-store')
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
}

app.use('*', securityHeaders)

app.use('*', async (c, next) => {
  const origins = c.env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  return cors({
    origin: origins.length === 1 && origins[0] === '*' ? '*' : origins,
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Site-Key', 'X-Compressed'],
    maxAge: 86400,
  })(c, next)
})

// Geo from the Cloudflare edge — country/city/region only, never the raw IP
// (keeps the GDPR-friendly posture). Attached to each event's payload so the
// processor can aggregate audience geography without any IP storage.
function edgeGeo(c: { req: { raw: Request } }): GeoInfo | undefined {
  const cf = (c.req.raw as Request & { cf?: Record<string, unknown> }).cf
  if (!cf) return undefined
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
  const geo: GeoInfo = { country: str(cf.country), city: str(cf.city), region: str(cf.region) }
  return geo.country || geo.city || geo.region ? geo : undefined
}

app.get('/health', c => c.json({ ok: true, ts: Date.now() }))

app.post('/e', async c => {
  // Bot filter at request level
  const ua = c.req.header('user-agent') ?? ''
  if (isBotUA(ua)) return c.body(null, 204)

  // Auth
  const keys = new Set(c.env.SITE_KEYS.split(',').map(k => k.trim()).filter(Boolean))
  const key  = c.req.header('x-site-key') ?? c.req.query('sk') ?? ''
  if (keys.size > 0 && !keys.has(key)) return c.json({ error: 'unauthorized' }, 401)

  try {
    const body = await c.req.json()
    const raw: unknown[] = Array.isArray(body) ? body : (body?.events ?? [body])

    const fpMax    = parseInt(c.env.ERROR_FP_MAX_PER_WINDOW ?? '50')
    const fpWindow = parseInt(c.env.ERROR_FP_WINDOW_MS      ?? '60000')
    const now = Date.now()

    const events = raw
      .slice(0, 200)
      .filter(isValid)
      .filter(e => !isFiltered(e))
      .filter(e => {
        if (!ERROR_TYPES.has(e.type)) return true
        return !isErrorRateLimited(errorFingerprint(e), now, fpMax, fpWindow)
      })

    if (events.length === 0) return c.body(null, 204)

    const geo = edgeGeo(c)
    if (geo) for (const e of events) { if (!e.geo) e.geo = geo }

    const storage = new TursoAdapter({ url: c.env.TURSO_URL, token: c.env.TURSO_TOKEN })
    await storage.write(events)
    return c.body(null, 204)
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }
})

export default app
