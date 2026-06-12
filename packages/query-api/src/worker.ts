import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import { QueryTurso } from './turso'
import { parseSite, parseRelease, parseFilename } from './validate'
import { signToken, verifyToken } from './token'

interface Env {
  TURSO_URL:          string
  TURSO_TOKEN:        string
  QUERY_API_KEY:      string
  DASHBOARD_PASSWORD?: string
  CORS_ORIGINS?:      string
  ALLOW_QUERY_KEY?:   string // set to '1' to also accept ?api_key= (legacy); default header-only
}

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Resource-Policy', 'same-site')
  c.header('Cache-Control', 'no-store')
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  // API returns JSON only — disallow rendering as a page
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
}

const VALID_STATUSES = new Set(['open', 'ignored', 'resolved', 'regressed'])

// Per-isolate schema init flag
let schemaReady = false
let warnedCors = false

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
    if (!env.DASHBOARD_PASSWORD || !env.QUERY_API_KEY) return c.json({ token: null, required: false })
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }))
    if (body.password !== env.DASHBOARD_PASSWORD) return c.json({ error: 'invalid password' }, 401)
    // Hand back a short-lived signed token — never the static QUERY_API_KEY.
    const { token, exp } = await signToken(env.QUERY_API_KEY)
    return c.json({ token, exp, required: true })
  })

  // Auth guard for all data routes. Accepts the static key (server-to-server)
  // or an unexpired signed session token. Header-only by default — query-string
  // keys leak via logs/proxies/referrer; set ALLOW_QUERY_KEY=1 to opt back in.
  app.use('*', async (c, next) => {
    if (!env.QUERY_API_KEY) return next()
    const expected = env.QUERY_API_KEY.trim()
    const headerKey = (c.req.header('x-api-key') ?? '').trim()
    const queryKey = env.ALLOW_QUERY_KEY === '1' ? (c.req.query('api_key') ?? '').trim() : ''
    const provided = headerKey || queryKey
    if (!provided) return c.json({ error: 'unauthorized' }, 401)
    if (provided === expected) return next()
    if (await verifyToken(provided, expected)) return next()
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
      from:        c.req.query('from')  ? parseInt(c.req.query('from')!)  : undefined,
      to:          c.req.query('to')    ? parseInt(c.req.query('to')!)    : undefined,
      limit:       c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
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
    const events = await db.getReplayEvents(c.req.param('sid'))
    return c.json({ events })
  })

  // ── Errors ────────────────────────────────────────────────────────────────
  app.get('/errors', async c => {
    const p      = parseSite(c.req.query('site'))
    const status = c.req.query('status')
    const query  = c.req.query('query') ?? undefined
    const limit  = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 200
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
    const limit = c.req.query('limit') ? Math.min(parseInt(c.req.query('limit')!), 200) : 50
    const activity = await db.getErrorActivity(p.site, fp, limit)
    return c.json({ activity, fingerprint: fp })
  })

  app.get('/errors/:fingerprint/events', async c => {
    const fp  = c.req.param('fingerprint')
    const p   = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const limit = c.req.query('limit') ? Math.min(parseInt(c.req.query('limit')!), 100) : 25
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
  const fromParam = (c: { req: { query: (k: string) => string | undefined } }) => {
    const raw = c.req.query('from')
    return raw ? parseInt(raw) : undefined
  }

  app.get('/traffic', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const rows = await db.getTrafficSources(p.site, fromParam(c))
    return c.json({ sources: rows, meta: { site: p.site, total: rows.length } })
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
          chatId:     row?.telegramChatId ?? null,
        },
        slack: {
          configured: !!row?.slackWebhookUrl,
          webhookUrl: row?.slackWebhookUrl ?? null,
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
      from:  c.req.query('from')  ? parseInt(c.req.query('from')!)  : undefined,
      to:    c.req.query('to')    ? parseInt(c.req.query('to')!)    : undefined,
      limit: c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
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
    const interval = parseInt(c.req.query('interval') ?? '300000')
    const grace    = parseInt(c.req.query('grace')    ?? '60000')
    if (!monitor || !p) return c.json({ error: 'monitor and site are required' }, 400)
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
