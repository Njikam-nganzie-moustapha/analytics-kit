import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { MiddlewareHandler } from 'hono'
import { requireAuth, authRouter } from './auth'
import { heatmapRouter  } from './routes/heatmap'
import { zonesRouter    } from './routes/zones'
import { sessionsRouter } from './routes/sessions'
import { replayRouter   } from './routes/replay'
import { errorsRouter   } from './routes/errors'
import { cronRouter       } from './routes/cron'
import { vitalsRouter     } from './routes/vitals'
import { sourcemapsRouter } from './routes/sourcemaps'
import { sitesRouter      } from './routes/sites'
import { parseSite, parseSteps, parseAuditUrl } from './validate'
import { auditHtml } from './seo'
import type { QueryTurso } from './turso'

const HSL_RE = /^\d{1,3} \d{1,3}% \d{1,3}%$/

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  c.header('Cache-Control', 'no-store')
  // CSP: analytics API returns JSON only — disallow rendering as page
  c.header('Content-Security-Policy', "default-src 'none'")
}

export function createApp(db: QueryTurso) {
  const app = new Hono()

  const rawOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  const origin = rawOrigins.length === 1 && rawOrigins[0] === '*'
    ? '*'
    : rawOrigins

  if (process.env.NODE_ENV === 'production' && origin === '*') {
    console.warn('[query-api] WARNING: CORS_ORIGINS not set — wildcard CORS active. Any website can read analytics data. Set CORS_ORIGINS=https://your-dashboard.vercel.app')
  }

  app.use('*', securityHeaders)
  app.use('*', cors({
    origin,
    allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-api-key'],
    maxAge: 600,
  }))

  app.get('/health', c => c.json({ ok: true }))
  app.route('/auth', authRouter())
  app.route('/sites', sitesRouter(db))

  app.use('*', requireAuth)

  app.route('/heatmap',  heatmapRouter(db))
  app.route('/zones',    zonesRouter(db))
  app.route('/sessions', sessionsRouter(db))
  app.route('/replay',   replayRouter(db))
  app.route('/errors',     errorsRouter(db))
  app.route('/cron',       cronRouter(db))
  app.route('/vitals',     vitalsRouter(db))
  app.route('/sourcemaps', sourcemapsRouter(db))

  // Audience + overview (inline — mirror worker.ts)
  const fromOf = (c: { req: { query: (k: string) => string | undefined } }) => {
    const raw = c.req.query('from'); return raw ? parseInt(raw) : undefined
  }
  app.get('/traffic', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ sources: await db.getTrafficSources(p.site, fromOf(c)) })
  })
  app.get('/geo', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ geo: await db.getGeoStats(p.site) })
  })
  app.get('/devices', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ devices: await db.getDeviceStats(p.site) })
  })
  app.get('/conversions', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ conversions: await db.getConversions(p.site, fromOf(c)) })
  })
  app.get('/overview', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    const [summary, sites] = await Promise.all([db.getOverview(p.site, fromOf(c)), db.getSiteTotals()])
    return c.json({ summary, sites })
  })

  // Funnels (inline — mirror worker.ts)
  app.get('/funnels', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ funnels: await db.listFunnels(p.site) })
  })
  app.post('/funnels', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ name?: string; steps?: unknown }>().catch(() => ({} as { name?: string; steps?: unknown }))
    const steps = parseSteps(body.steps); if (!steps) return c.json({ error: 'steps must be 2–8 {type,label,match}' }, 400)
    const id = Date.now().toString(36)
    await db.upsertFunnel(p.site, id, body.name || 'Untitled funnel', steps)
    return c.json({ ok: true, id })
  })
  app.put('/funnels/:id', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ name?: string; steps?: unknown }>().catch(() => ({} as { name?: string; steps?: unknown }))
    const steps = parseSteps(body.steps); if (!steps) return c.json({ error: 'steps must be 2–8 {type,label,match}' }, 400)
    await db.upsertFunnel(p.site, c.req.param('id'), body.name || 'Untitled funnel', steps)
    return c.json({ ok: true, id: c.req.param('id') })
  })
  app.delete('/funnels/:id', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    await db.deleteFunnel(p.site, c.req.param('id'))
    return c.json({ ok: true })
  })
  app.post('/funnels/compute', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    const body = await c.req.json<{ steps?: unknown }>().catch(() => ({} as { steps?: unknown }))
    const steps = parseSteps(body.steps); if (!steps) return c.json({ error: 'steps must be 2–8 {type,label,match}' }, 400)
    return c.json({ ...(await db.computeFunnel(p.site, steps, fromOf(c))), steps })
  })

  // SEO audit / PageSpeed / Branding (inline — mirror worker.ts)
  app.get('/seo', async c => {
    const target = parseAuditUrl(c.req.query('url'))
    if (!target) return c.json({ error: 'a valid public http(s) url is required' }, 400)
    try {
      const resp = await fetch(target.url, { headers: { 'user-agent': 'analytics-kit-seo/1.0' }, redirect: 'follow' })
      if (!resp.ok) return c.json({ error: `fetch failed: HTTP ${resp.status}` }, 502)
      const html = (await resp.text()).slice(0, 1_500_000)
      return c.json(auditHtml(html, resp.url || target.url))
    } catch (e) { return c.json({ error: `could not fetch page: ${e instanceof Error ? e.message : String(e)}` }, 502) }
  })

  app.get('/pagespeed', async c => {
    const target = parseAuditUrl(c.req.query('url'))
    if (!target) return c.json({ error: 'a valid public http(s) url is required' }, 400)
    const strategy = c.req.query('strategy') === 'desktop' ? 'desktop' : 'mobile'
    const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : ''
    const psi = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(target.url)}&strategy=${strategy}&category=performance${key}`
    try {
      const r = await fetch(psi)
      const data = await r.json() as { lighthouseResult?: { categories?: { performance?: { score?: number } }; audits?: Record<string, { displayValue?: string; numericValue?: number }> }; error?: { message?: string } }
      if (data.error) return c.json({ error: data.error.message ?? 'PageSpeed error' }, 502)
      const lr = data.lighthouseResult
      const score = Math.round((lr?.categories?.performance?.score ?? 0) * 100)
      const pick = (id: string, label: string) => ({ id, label, display: lr?.audits?.[id]?.displayValue ?? '—', numeric: lr?.audits?.[id]?.numericValue ?? null })
      const metrics = [
        pick('first-contentful-paint', 'First Contentful Paint'),
        pick('largest-contentful-paint', 'Largest Contentful Paint'),
        pick('total-blocking-time', 'Total Blocking Time'),
        pick('cumulative-layout-shift', 'Cumulative Layout Shift'),
        pick('speed-index', 'Speed Index'),
        pick('interactive', 'Time to Interactive'),
      ]
      return c.json({ url: target.url, strategy, score, metrics })
    } catch (e) { return c.json({ error: `PageSpeed request failed: ${e instanceof Error ? e.message : String(e)}` }, 502) }
  })

  app.get('/branding', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
    return c.json({ branding: await db.getBranding(p.site) })
  })
  app.put('/branding', async c => {
    const p = parseSite(c.req.query('site')); if (!p) return c.json({ error: 'site required' }, 400)
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

  return app
}
