import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import { QueryTurso } from './turso'
import { parseSite, parseRelease, parseFilename, parseSteps, parseAuditUrl } from './validate'
import { signToken, verifyToken, constantTimeEqual } from './token'
import { auditHtml } from './seo'

const HSL_RE = /^\d{1,3} \d{1,3}% \d{1,3}%$/

interface Env {
  TURSO_URL:          string
  TURSO_TOKEN:        string
  QUERY_API_KEY:      string
  DASHBOARD_PASSWORD?: string
  CORS_ORIGINS?:      string
  ALLOW_QUERY_KEY?:   string // set to '1' to also accept ?api_key= (legacy); default header-only
  PAGESPEED_API_KEY?: string // optional Google PageSpeed Insights key (higher quota)
}

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-site')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header('Cache-Control', 'no-store')
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  // API returns JSON only — disallow rendering as a page
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

const VALID_STATUSES = new Set(['open', 'ignored', 'resolved', 'regressed'])

// Per-isolate schema init flag
let schemaReady = false
let warnedCors = false

// Brute-force guard on POST /auth: max 10 attempts per IP per 5 minutes
const authAttempts = new Map<string, { count: number; windowStart: number }>()
function isAuthRateLimited(ip: string, now: number): boolean {
  const WINDOW = 5 * 60 * 1000; const MAX = 10
  // Periodic eviction of expired windows
  if (now % 30_000 < 500) for (const [k, v] of authAttempts) if (now - v.windowStart > WINDOW) authAttempts.delete(k)
  const e = authAttempts.get(ip)
  if (!e || now - e.windowStart > WINDOW) { authAttempts.set(ip, { count: 1, windowStart: now }); return false }
  e.count++; return e.count > MAX
}

// Safe integer parser: returns fallback on NaN, clamps to [min, max]
function safeInt(raw: string | undefined, fallback: number, min?: number, max?: number): number {
  const n = parseInt(raw ?? '', 10)
  const v = isNaN(n) ? fallback : n
  if (min !== undefined && v < min) return min
  if (max !== undefined && v > max) return max
  return v
}

// Timestamp param: undefined if missing or invalid
function parseTs(raw: string | undefined): number | undefined {
  if (!raw) return undefined
  const n = parseInt(raw, 10)
  return isNaN(n) || n < 0 ? undefined : n
}

// Monitor name allowlist: alphanumeric + hyphen + underscore + dot, max 100 chars
const MONITOR_RE = /^[a-zA-Z0-9_\-.]{1,100}$/

function makeApp(env: Env) {
  const db  = new QueryTurso(env.TURSO_URL, env.TURSO_TOKEN)
  const app = new Hono()

  app.use('*', securityHeaders)

  const origins = env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  if (origins.length === 1 && origins[0] === '*' && !warnedCors) {
    warnedCors = true
    console.warn('[query-api] CORS_ORIGINS not set — wildcard CORS active. Set it to the dashboard origin in production.')
  }
  app.use('*', cors({
    origin: origins.length === 1 && origins[0] === '*' ? '*' : origins,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-api-key'],
    maxAge: 600,
  }))

  // Lazy schema ensure (once per isolate)
  app.use('*', async (_c, next) => {
    if (!schemaReady) { await db.ensureSchema(); schemaReady = true }
    return next()
  })

  app.get('/health', c => c.json({ ok: true }))

  // ── Sites (public — no auth required) ────────────────────────────────────
  app.get('/sites', async c => {
    const sites = await db.getAvailableSites()
    return c.json({ sites })
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.get('/auth', c => c.json({ required: !!(env.DASHBOARD_PASSWORD && env.QUERY_API_KEY) }))
  app.post('/auth', async c => {
    const ip = c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for') ?? 'anon'
    if (isAuthRateLimited(ip, Date.now())) return c.json({ error: 'too many requests' }, 429)
    if (!env.DASHBOARD_PASSWORD || !env.QUERY_API_KEY) return c.json({ token: null, required: false })
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }))
    if (body.password !== env.DASHBOARD_PASSWORD) {
      console.warn('[query-api] /auth failed —', ip)
      return c.json({ error: 'invalid password' }, 401)
    }
    // Hand back a short-lived signed token — never the static QUERY_API_KEY.
    const { token, exp } = await signToken(env.QUERY_API_KEY)
    return c.json({ token, exp, required: true })
  })

  // Auth guard for all data routes. Accepts the static key (server-to-server)
  // or an unexpired signed session token. Header-only by default — query-string
  // keys leak via logs/proxies/referrer; set ALLOW_QUERY_KEY=1 to opt back in.
  // Uses constant-time comparison to prevent timing-oracle attacks on the key.
  app.use('*', async (c, next) => {
    if (!env.QUERY_API_KEY) return next()
    const expected = env.QUERY_API_KEY.trim()
    const headerKey = (c.req.header('x-api-key') ?? '').trim()
    const queryKey = env.ALLOW_QUERY_KEY === '1' ? (c.req.query('api_key') ?? '').trim() : ''
    const provided = headerKey || queryKey
    if (!provided) {
      console.warn('[query-api] 401 missing key —', c.req.path)
      return c.json({ error: 'unauthorized' }, 401)
    }
    if (await constantTimeEqual(provided, expected)) return next()
    if (await verifyToken(provided, expected)) return next()
    console.warn('[query-api] 401 invalid key —', c.req.path)
    return c.json({ error: 'unauthorized' }, 401)
  })

  // ── Heatmap ───────────────────────────────────────────────────────────────
  app.get('/heatmap', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const cells = await db.getHeatmapCells(p.site, c.req.query('url'))
    return c.json({ cells, meta: { site: p.site, total: cells.length } })
  })

  // ── Zones ────────────────────────────────────────────────────────────────
  app.get('/zones', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    return c.json(await db.getZoneStats(p.site, c.req.query('url')))
  })

  // ── Sessions ─────────────────────────────────────────────────────────────
  app.get('/sessions', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const sessions = await db.getSessions(p.site, {
      from:        parseTs(c.req.query('from')),
      to:          parseTs(c.req.query('to')),
      limit:       safeInt(c.req.query('limit'), 100, 1, 1000),
      hasReplay:   c.req.query('has_replay') === '1' || c.req.query('has_replay') === 'true',
      hasError:    c.req.query('has_error')  === '1' || c.req.query('has_error')  === 'true',
      urlContains: c.req.query('url') ?? undefined,
    })
    return c.json({ sessions, meta: { site: p.site, total: sessions.length } })
  })

  app.get('/sessions/:sid/errors', async c => {
    const sid = c.req.param('sid')
    const p   = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const errors = await db.getSessionErrors(sid, p.site)
    return c.json({ errors, sid })
  })

  // ── Replay ────────────────────────────────────────────────────────────────
  app.get('/replay/:sid', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const events = await db.getReplayEvents(c.req.param('sid'), p.site)
    return c.json({ events })
  })

  // ── Errors ────────────────────────────────────────────────────────────────
  app.get('/errors', async c => {
    const p      = parseSite(c.req.query('site'))
    const status = c.req.query('status')
    const query  = c.req.query('query') ?? undefined
    const limit  = safeInt(c.req.query('limit'), 200, 1, 1000)
    if (!p) return c.json({ error: 'site required' }, 400)
    const errors = await db.getErrorGroups(p.site, {
      status: status && VALID_STATUSES.has(status) ? status : undefined,
      query,
      limit,
    })
    return c.json({ errors, meta: { site: p.site, total: errors.length } })
  })

  app.get('/errors/:fingerprint/activity', async c => {
    const fp  = c.req.param('fingerprint')
    const p   = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const limit = safeInt(c.req.query('limit'), 50, 1, 200)
    const activity = await db.getErrorActivity(p.site, fp, limit)
    return c.json({ activity, fingerprint: fp })
  })

  app.get('/errors/:fingerprint/events', async c => {
    const fp  = c.req.param('fingerprint')
    const p   = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const limit = safeInt(c.req.query('limit'), 25, 1, 100)
    const events = await db.getErrorEvents(p.site, fp, limit)
    return c.json({ events, fingerprint: fp })
  })

  app.patch('/errors/:fingerprint', async c => {
    const fingerprint = c.req.param('fingerprint')
    const p           = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ status?: string; assignee?: string; note?: string }>()
      .catch(() => ({} as { status?: string; assignee?: string; note?: string }))
    if (body.status && !VALID_STATUSES.has(body.status)) {
      return c.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400)
    }
    await db.updateErrorState(p.site, fingerprint, body)
    return c.json({ ok: true })
  })

  // ── Performance ───────────────────────────────────────────────────────────
  app.get('/performance', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getPagePerf(p.site, c.req.query('url'))
    return c.json({ rows, meta: { site: p.site, total: rows.length } })
  })

  // ── Audience: traffic / geo / devices ──────────────────────────────────────
  const fromParam = (c: { req: { query: (k: string) => string | undefined } }) =>
    parseTs(c.req.query('from'))

  app.get('/traffic', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const from = fromParam(c)
    const to   = parseTs(c.req.query('to'))
    const [rows, series] = await Promise.all([
      db.getTrafficSources(p.site, from, to),
      db.getChannelSeries(p.site, from, to),
    ])
    return c.json({ sources: rows, series, meta: { site: p.site, total: rows.length } })
  })

  app.get('/geo', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getGeoStats(p.site)
    return c.json({ geo: rows, meta: { site: p.site, total: rows.length } })
  })

  app.get('/devices', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getDeviceStats(p.site)
    return c.json({ devices: rows, meta: { site: p.site, total: rows.length } })
  })

  app.get('/realtime', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ visitors: await db.getRealtimeVisitors(p.site), window: 300 })
  })

  app.get('/screen-stats', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getScreenStats(p.site)
    return c.json({ screens: rows, meta: { site: p.site, total: rows.length } })
  })

  app.get('/pages', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getTopPages(p.site, fromParam(c), parseTs(c.req.query('to')))
    return c.json({ pages: rows, meta: { site: p.site, total: rows.length } })
  })

  app.get('/conversions', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getConversions(p.site, fromParam(c))
    return c.json({ conversions: rows, meta: { site: p.site, total: rows.length } })
  })

  // ── Overview + health score ─────────────────────────────────────────────────
  app.get('/overview', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const [summary, sites] = await Promise.all([
      db.getOverview(p.site, fromParam(c)),
      db.getSiteTotals(),
    ])
    return c.json({ summary, sites })
  })

  app.get('/activity', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const days = safeInt(c.req.query('days'), 365, 1, 366)
    return c.json({ days: await db.getActivity(p.site, days) })
  })

  app.get('/bots', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ bots: await db.getBots(p.site) })
  })

  // ── Funnels ─────────────────────────────────────────────────────────────────
  app.get('/funnels', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ funnels: await db.listFunnels(p.site) })
  })

  app.post('/funnels', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ name?: string; steps?: unknown }>().catch(() => ({} as { name?: string; steps?: unknown }))
    const steps = parseSteps(body.steps)
    if (!steps) return c.json({ error: 'steps must be an array of 2–8 {type,label,match}' }, 400)
    const id = Date.now().toString(36)
    await db.upsertFunnel(p.site, id, body.name || 'Untitled funnel', steps)
    return c.json({ ok: true, id })
  })

  app.put('/funnels/:id', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const id = c.req.param('id')
    const body = await c.req.json<{ name?: string; steps?: unknown }>().catch(() => ({} as { name?: string; steps?: unknown }))
    const steps = parseSteps(body.steps)
    if (!steps) return c.json({ error: 'steps must be an array of 2–8 {type,label,match}' }, 400)
    await db.upsertFunnel(p.site, id, body.name || 'Untitled funnel', steps)
    return c.json({ ok: true, id })
  })

  app.delete('/funnels/:id', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    await db.deleteFunnel(p.site, c.req.param('id'))
    return c.json({ ok: true })
  })

  app.post('/funnels/compute', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ steps?: unknown }>().catch(() => ({} as { steps?: unknown }))
    const steps = parseSteps(body.steps)
    if (!steps) return c.json({ error: 'steps must be an array of 2–8 {type,label,match}' }, 400)
    const result = await db.computeFunnel(p.site, steps, fromParam(c))
    return c.json({ ...result, steps })
  })

  // ── SEO audit ───────────────────────────────────────────────────────────────
  app.get('/seo', async c => {
    const target = parseAuditUrl(c.req.query('url'))
    if (!target) return c.json({ error: 'a valid public http(s) url is required' }, 400)
    try {
      const resp = await fetch(target.url, {
        headers: { 'user-agent': 'analytics-kit-seo/1.0 (+https://analytics-kit)' },
        redirect: 'follow',
      })
      if (!resp.ok) return c.json({ error: `fetch failed: HTTP ${resp.status}` }, 502)
      const html = (await resp.text()).slice(0, 1_500_000)
      return c.json(auditHtml(html, resp.url || target.url))
    } catch {
      return c.json({ error: 'could not fetch page: upstream connection failed' }, 502)
    }
  })

  // ── PageSpeed (Google PSI lab data) ───────────────────────────────────────────
  app.get('/pagespeed', async c => {
    const target = parseAuditUrl(c.req.query('url'))
    if (!target) return c.json({ error: 'a valid public http(s) url is required' }, 400)
    const strategy = c.req.query('strategy') === 'desktop' ? 'desktop' : 'mobile'
    const key = env.PAGESPEED_API_KEY ? `&key=${env.PAGESPEED_API_KEY}` : ''
    const cats = 'category=performance&category=accessibility&category=seo&category=best-practices'
    const psi = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(target.url)}&strategy=${strategy}&${cats}${key}`
    try {
      const r = await fetch(psi)
      const data = await r.json() as {
        lighthouseResult?: {
          categories?: { performance?: { score?: number }; accessibility?: { score?: number }; seo?: { score?: number }; 'best-practices'?: { score?: number } }
          audits?: Record<string, { displayValue?: string; numericValue?: number }>
        }
        error?: { message?: string }
      }
      if (data.error) return c.json({ error: data.error.message ?? 'PageSpeed error' }, 502)
      const lr = data.lighthouseResult
      const sc = (k: string) => Math.round(((lr?.categories as Record<string, { score?: number } | undefined> | undefined)?.[k]?.score ?? 0) * 100)
      const pick = (id: string, label: string) => {
        const a = lr?.audits?.[id]
        return { id, label, display: a?.displayValue ?? '—', numeric: a?.numericValue ?? null }
      }
      const metrics = [
        pick('first-contentful-paint', 'First Contentful Paint'),
        pick('largest-contentful-paint', 'Largest Contentful Paint'),
        pick('total-blocking-time', 'Total Blocking Time'),
        pick('cumulative-layout-shift', 'Cumulative Layout Shift'),
        pick('speed-index', 'Speed Index'),
        pick('interactive', 'Time to Interactive'),
      ]
      return c.json({
        url: target.url, strategy, score: sc('performance'), metrics,
        categories: {
          performance:    sc('performance'),
          accessibility:  sc('accessibility'),
          seo:            sc('seo'),
          bestPractices:  sc('best-practices'),
        },
      })
    } catch {
      return c.json({ error: 'PageSpeed request failed: upstream connection error' }, 502)
    }
  })

  // ── Branding (white-label) ────────────────────────────────────────────────────
  app.get('/branding', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const branding = await db.getBranding(p.site)
    return c.json({ branding })
  })

  app.put('/branding', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ product_name?: string | null; logo_url?: string | null; primary?: string | null }>().catch(() => ({} as Record<string, unknown>))
    const update: { productName?: string | null; logoUrl?: string | null; primary?: string | null } = {}
    if ('product_name' in body) update.productName = body.product_name ? String(body.product_name).slice(0, 60) : null
    if ('logo_url' in body) {
      const lu = body.logo_url ? String(body.logo_url).slice(0, 500) : null
      if (lu && !/^https?:\/\//i.test(lu)) return c.json({ error: 'logo_url must be http(s)' }, 400)
      update.logoUrl = lu
    }
    if ('primary' in body) {
      const pr = body.primary ? String(body.primary).trim() : null
      if (pr && !HSL_RE.test(pr)) return c.json({ error: 'primary must be an HSL triple like "262 83% 58%"' }, 400)
      update.primary = pr
    }
    if (Object.keys(update).length === 0) return c.json({ error: 'no fields to update' }, 400)
    await db.upsertBranding(p.site, update)
    return c.json({ ok: true })
  })

  // ── Alert rules ───────────────────────────────────────────────────────────
  const VALID_RULE_TYPES = new Set(['error_spike', 'traffic_drop'])

  app.get('/alert-rules', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rules = await db.getAlertRules(p.site)
    return c.json({ rules, meta: { site: p.site } })
  })

  app.put('/alert-rules/:type', async c => {
    const ruleType = c.req.param('type')
    const p        = parseSite(c.req.query('site'))
    if (!p)                                return c.json({ error: 'site required' }, 400)
    if (!VALID_RULE_TYPES.has(ruleType))   return c.json({ error: `rule type must be one of: ${[...VALID_RULE_TYPES].join(', ')}` }, 400)
    const body = await c.req.json<{ enabled?: boolean; threshold?: number; cooldown_ms?: number }>()
      .catch(() => ({} as { enabled?: boolean; threshold?: number; cooldown_ms?: number }))
    const threshold  = Math.max(1, Math.min(10_000, Math.round(body.threshold  ?? 5)))
    const cooldownMs = Math.max(60_000, Math.min(86_400_000, Math.round(body.cooldown_ms ?? 3_600_000)))
    const enabled    = body.enabled !== false
    await db.upsertAlertRule(p.site, ruleType, { enabled, threshold, cooldownMs })
    return c.json({ ok: true, site: p.site, ruleType, enabled, threshold, cooldownMs })
  })

  // ── Alert channels ────────────────────────────────────────────────────────
  app.get('/alert-channels', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const row = await db.getAlertChannels(p.site)
    return c.json({
      channels: {
        telegram: {
          configured: !!(row?.telegramToken && row?.telegramChatId),
          // chatId is not secret but has no UI use; return only configured status
        },
        slack: {
          configured: !!row?.slackWebhookUrl,
          // webhookUrl is a credential — never returned to the client
        },
      },
      meta: { site: p.site },
    })
  })

  app.put('/alert-channels', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{
      telegram_token?:    string | null
      telegram_chat_id?:  string | null
      slack_webhook_url?: string | null
    }>().catch(() => ({} as Record<string, unknown>))

    const update: { telegramToken?: string | null; telegramChatId?: string | null; slackWebhookUrl?: string | null } = {}
    if ('telegram_token'    in body) update.telegramToken    = body.telegram_token    ? String(body.telegram_token).slice(0, 200)    : null
    if ('telegram_chat_id'  in body) update.telegramChatId   = body.telegram_chat_id  ? String(body.telegram_chat_id).slice(0, 100)  : null
    if ('slack_webhook_url' in body) update.slackWebhookUrl  = body.slack_webhook_url ? String(body.slack_webhook_url).slice(0, 300) : null

    if (Object.keys(update).length === 0) return c.json({ error: 'no fields to update' }, 400)
    await db.upsertAlertChannels(p.site, update)
    return c.json({ ok: true, site: p.site })
  })

  app.delete('/alert-channels/:channel', async c => {
    const channel = c.req.param('channel') as 'telegram' | 'slack'
    const p       = parseSite(c.req.query('site'))
    if (!p)                                          return c.json({ error: 'site required' }, 400)
    if (channel !== 'telegram' && channel !== 'slack') return c.json({ error: 'channel must be telegram or slack' }, 400)
    await db.clearAlertChannelField(p.site, channel)
    return c.json({ ok: true, site: p.site, channel })
  })

  // ── Feedback ─────────────────────────────────────────────────────────────
  app.get('/feedback', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const items = await db.getFeedback(p.site, {
      from:  parseTs(c.req.query('from')),
      to:    parseTs(c.req.query('to')),
      limit: safeInt(c.req.query('limit'), 100, 1, 1000),
    })
    return c.json({ items, meta: { site: p.site, total: items.length } })
  })

  // ── Releases ──────────────────────────────────────────────────────────────
  app.get('/releases', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const releases = await db.getReleases(p.site)
    return c.json({ releases, meta: { site: p.site, total: releases.length } })
  })

  // ── Vitals ────────────────────────────────────────────────────────────────
  app.get('/vitals', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const vitals = await db.getVitals(p.site, c.req.query('url'))
    return c.json({ vitals, meta: { site: p.site, total: vitals.length } })
  })

  // ── Source maps ───────────────────────────────────────────────────────────
  app.get('/sourcemaps', async c => {
    const p        = parseSite(c.req.query('site'))
    const rawRel   = c.req.query('release')
    if (!p) return c.json({ error: 'site required' }, 400)
    const release = rawRel ? (parseRelease(rawRel)?.release ?? '') : ''
    const maps = await db.listSourceMaps(p.site, release)
    return c.json({ maps })
  })

  app.post('/sourcemaps', async c => {
    const p  = parseSite(c.req.query('site'))
    const rp = parseRelease(c.req.query('release'))
    const fp = parseFilename(c.req.query('filename'))
    if (!p || !rp || !fp) {
      return c.json({ error: 'site, release, and filename are required and must be valid' }, 400)
    }
    const content = await c.req.text()
    if (content.length > 5 * 1024 * 1024) return c.json({ error: 'max size is 5 MB' }, 413)
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(content) } catch { return c.json({ error: 'invalid JSON' }, 400) }
    if (parsed.version !== 3) return c.json({ error: 'source map version must be 3' }, 400)
    await db.upsertSourceMap(p.site, rp.release, fp.filename, content)
    return c.json({ ok: true })
  })

  app.delete('/sourcemaps', async c => {
    const p  = parseSite(c.req.query('site'))
    const rp = parseRelease(c.req.query('release'))
    const fp = parseFilename(c.req.query('filename'))
    if (!p || !rp || !fp) {
      return c.json({ error: 'site, release, and filename are required and must be valid' }, 400)
    }
    await db.deleteSourceMap(p.site, rp.release, fp.filename)
    return c.json({ ok: true })
  })

  // ── Cron monitors ─────────────────────────────────────────────────────────
  app.get('/cron', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const monitors = await db.getCronMonitors(p.site)
    return c.json({ monitors })
  })

  app.post('/cron/checkin', async c => {
    const monitor = c.req.query('monitor') ?? ''
    const p       = parseSite(c.req.query('site'))
    if (!monitor || !p) return c.json({ error: 'monitor and site are required' }, 400)
    if (!MONITOR_RE.test(monitor)) return c.json({ error: 'monitor: alphanumeric, -, _, . only (max 100 chars)' }, 400)
    const interval = safeInt(c.req.query('interval'), 300_000, 60_000,  86_400_000)
    const grace    = safeInt(c.req.query('grace'),     60_000,  5_000,   3_600_000)
    await db.upsertCronCheckin(monitor, p.site, interval, grace)
    return c.json({ ok: true, monitor, checkin: Date.now() })
  })

  app.delete('/cron/:monitorId', async c => {
    const monitorId = c.req.param('monitorId')
    const p         = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    await db.deleteCronMonitor(monitorId, p.site)
    return c.json({ ok: true })
  })

  return app
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return makeApp(env).fetch(request)
  },
}
