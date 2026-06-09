import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function zonesRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const site = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    const url   = c.req.query('url')
    const zones = await db.getZoneStats(site, url)
    return c.json({ zones, meta: { site, url: url ?? null, total: zones.length } })
  })

  return r
}
