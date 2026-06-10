import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function cronRouter(db: QueryTurso) {
  const app = new Hono()

  // POST /cron/checkin?monitor=ID&site=X&interval=60000&grace=30000
  // Called by cron jobs to record a successful run
  app.post('/checkin', async c => {
    const monitorId = c.req.query('monitor')
    const site      = c.req.query('site')
    if (!monitorId) return c.json({ error: 'monitor is required' }, 400)
    if (!site)      return c.json({ error: 'site is required' }, 400)

    const intervalMs = parseInt(c.req.query('interval') ?? '300000')
    const graceMs    = parseInt(c.req.query('grace')    ?? '60000')

    await db.upsertCronCheckin(monitorId, site, intervalMs, graceMs)
    return c.json({ ok: true, checkin: Date.now() })
  })

  // GET /cron?site=X — list monitors with computed status
  app.get('/', async c => {
    const site = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    const monitors = await db.getCronMonitors(site)
    const now = Date.now()

    const enriched = monitors.map(m => {
      let status: 'ok' | 'late' | 'missing'
      if (m.lastCheckin == null) {
        status = 'missing'
      } else {
        const elapsed = now - m.lastCheckin
        if (elapsed > m.intervalMs + m.graceMs) {
          status = elapsed > m.intervalMs * 2 ? 'missing' : 'late'
        } else {
          status = 'ok'
        }
      }
      return { ...m, status }
    })

    return c.json({ monitors: enriched })
  })

  // DELETE /cron/:monitorId?site=X
  app.delete('/:monitorId', async c => {
    const monitorId = c.req.param('monitorId')
    const site      = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    await db.deleteCronMonitor(monitorId, site)
    return c.json({ ok: true })
  })

  return app
}
