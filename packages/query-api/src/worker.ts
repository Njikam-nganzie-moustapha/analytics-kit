import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { QueryTurso } from './turso'

interface Env {
  TURSO_URL:        string
  TURSO_TOKEN:      string
  QUERY_API_KEY:    string
  DASHBOARD_PASSWORD?: string
  CORS_ORIGINS?:    string
}

function makeApp(env: Env) {
  const db  = new QueryTurso(env.TURSO_URL, env.TURSO_TOKEN)
  const app = new Hono()

  const origins = env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  app.use('*', cors({
    origin: origins.length === 1 && origins[0] === '*' ? '*' : origins,
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-api-key'],
    maxAge: 600,
  }))

  app.get('/health', c => c.json({ ok: true }))

  // Auth check
  app.get('/auth', c => c.json({ required: !!(env.DASHBOARD_PASSWORD && env.QUERY_API_KEY) }))
  app.post('/auth', async c => {
    if (!env.DASHBOARD_PASSWORD || !env.QUERY_API_KEY) return c.json({ token: null, required: false })
    const body = await c.req.json<{ password?: string }>().catch(() => ({}))
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

  app.get('/heatmap',  async c => {
    const site = c.req.query('site') ?? ''
    const url  = c.req.query('url')
    if (!site) return c.json({ error: 'site required' }, 400)
    const cells = await db.getHeatmapCells(site, url)
    return c.json({ cells, meta: { site, url: url ?? null, total: cells.length } })
  })

  app.get('/zones', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    return c.json(await db.getZoneStats(site, c.req.query('url')))
  })

  app.get('/sessions', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    return c.json(await db.getSessions(site, {
      from:      c.req.query('from')  ? parseInt(c.req.query('from')!)  : undefined,
      to:        c.req.query('to')    ? parseInt(c.req.query('to')!)    : undefined,
      limit:     c.req.query('limit') ? parseInt(c.req.query('limit')!) : 100,
      hasReplay: c.req.query('replay') === '1',
    }))
  })

  app.get('/replay/:sid', async c => {
    const events = await db.getReplayEvents(c.req.param('sid'))
    return c.json({ events })
  })

  app.get('/errors', async c => {
    const site = c.req.query('site') ?? ''
    if (!site) return c.json({ error: 'site required' }, 400)
    return c.json(await db.getErrorGroups(site))
  })

  return app
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return makeApp(env).fetch(request)
  },
}
