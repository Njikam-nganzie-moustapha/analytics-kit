import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { QueryTurso } from './turso'

interface Env {
  TURSO_URL:          string
  TURSO_TOKEN:        string
  QUERY_API_KEY:      string
  DASHBOARD_PASSWORD?: string
  CORS_ORIGINS?:      string
}

const VALID_STATUSES = new Set(['open', 'ignored', 'resolved', 'regressed'])

// Per-isolate schema init flag
let schemaReady = false

function makeApp(env: Env) {
  const db  = new QueryTurso(env.TURSO_URL, env.TURSO_TOKEN)
  const app = new Hono()

  const origins = env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
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

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.get('/auth', c => c.json({ required: !!(env.DASHBOARD_PASSWORD && env.QUERY_API_KEY) }))
  app.post('/auth', async c => {
    if (!env.DASHBOARD_PASSWORD || !env.QUERY_API_KEY) return c.json({ token: null, required: false })
    const body = await c.req.json<{ password?: string }>().catch(() => ({} as { password?: string }))
    if (body.password !== env.DASHBOARD_PASSWORD) return c.json({ error: 'invalid password' }, 401)
    return c.json({ token: env.QUERY_API_KEY, required: true })
  })

  // API key guard for all data routes
  app.use('*', async (c, next) => {
    if (!env.QUERY_API_KEY) return next()
    const provided = c.req.header('x-api-key') ?? c.req.query('api_key')
    if (provided !== env.QUERY_API_KEY) return c.json({ error: 'unauthorized' }, 401)
    return next()
  })

  // ── Heatmap ───────────────────────────────────────────────────────────────
  app.get('/heatmap', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const cells = await db.getHeatmapCells(site, c.req.query('url'))
    return c.json({ cells, meta: { site, total: cells.length } })
  })

  // ── Zones ────────────────────────────────────────────────────────────────
  app.get('/zones', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    return c.json(await db.getZoneStats(site, c.req.query('url')))
  })

  // ── Sessions ─────────────────────────────────────────────────────────────
  app.get('/sessions', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const sessions = await db.getSessions(site, {
      from:      c.req.query('from')  ? parseInt(c.req.query('from')!)  : undefined,
      to:        c.req.query('to')    ? parseInt(c.req.query('to')!)    : undefined,
      limit:     c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      hasReplay: c.req.query('has_replay') === '1' || c.req.query('has_replay') === 'true',
    })
    return c.json({ sessions, meta: { site, total: sessions.length } })
  })

  app.get('/sessions/:sid/errors', async c => {
    const sid  = c.req.param('sid')
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const errors = await db.getSessionErrors(sid, site)
    return c.json({ errors, sid })
  })

  // ── Replay ────────────────────────────────────────────────────────────────
  app.get('/replay/:sid', async c => {
    const events = await db.getReplayEvents(c.req.param('sid'))
    return c.json({ events })
  })

  // ── Errors ────────────────────────────────────────────────────────────────
  app.get('/errors', async c => {
    const site   = c.req.query('site') ?? ''
    const status = c.req.query('status')
    const limit  = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 200
    if (!site) return c.json({ error: 'site required' }, 400)
    const errors = await db.getErrorGroups(site, {
      status: status && VALID_STATUSES.has(status) ? status : undefined,
      limit,
    })
    return c.json({ errors, meta: { site, total: errors.length } })
  })

  app.patch('/errors/:fingerprint', async c => {
    const fingerprint = c.req.param('fingerprint')
    const site        = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ status?: string; assignee?: string; note?: string }>()
      .catch(() => ({} as { status?: string; assignee?: string; note?: string }))
    if (body.status && !VALID_STATUSES.has(body.status)) {
      return c.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400)
    }
    await db.updateErrorState(site, fingerprint, body)
    return c.json({ ok: true })
  })

  // ── Vitals ────────────────────────────────────────────────────────────────
  app.get('/vitals', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const vitals = await db.getVitals(site, c.req.query('url'))
    return c.json({ vitals, meta: { site, total: vitals.length } })
  })

  // ── Source maps ───────────────────────────────────────────────────────────
  app.get('/sourcemaps', async c => {
    const site    = c.req.query('site')    ?? ''
    const release = c.req.query('release') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const maps = await db.listSourceMaps(site, release)
    return c.json({ maps })
  })

  app.post('/sourcemaps', async c => {
    const site     = c.req.query('site')     ?? ''
    const release  = c.req.query('release')  ?? ''
    const filename = c.req.query('filename') ?? ''
    if (!site || !release || !filename) {
      return c.json({ error: 'site, release, and filename are required' }, 400)
    }
    const content = await c.req.text()
    if (content.length > 5 * 1024 * 1024) return c.json({ error: 'max size is 5 MB' }, 413)
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(content) } catch { return c.json({ error: 'invalid JSON' }, 400) }
    if (parsed.version !== 3) return c.json({ error: 'source map version must be 3' }, 400)
    await db.upsertSourceMap(site, release, filename, content)
    return c.json({ ok: true })
  })

  app.delete('/sourcemaps', async c => {
    const site     = c.req.query('site')     ?? ''
    const release  = c.req.query('release')  ?? ''
    const filename = c.req.query('filename') ?? ''
    if (!site || !release || !filename) {
      return c.json({ error: 'site, release, and filename are required' }, 400)
    }
    await db.deleteSourceMap(site, release, filename)
    return c.json({ ok: true })
  })

  // ── Cron monitors ─────────────────────────────────────────────────────────
  app.get('/cron', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    const monitors = await db.getCronMonitors(site)
    return c.json({ monitors })
  })

  app.post('/cron/checkin', async c => {
    const monitor  = c.req.query('monitor') ?? ''
    const site     = c.req.query('site')    ?? ''
    const interval = parseInt(c.req.query('interval') ?? '300000')
    const grace    = parseInt(c.req.query('grace')    ?? '60000')
    if (!monitor || !site) return c.json({ error: 'monitor and site are required' }, 400)
    await db.upsertCronCheckin(monitor, site, interval, grace)
    return c.json({ ok: true, monitor, checkin: Date.now() })
  })

  app.delete('/cron/:monitorId', async c => {
    const monitorId = c.req.param('monitorId')
    const site      = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    await db.deleteCronMonitor(monitorId, site)
    return c.json({ ok: true })
  })

  return app
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return makeApp(env).fetch(request)
  },
}
