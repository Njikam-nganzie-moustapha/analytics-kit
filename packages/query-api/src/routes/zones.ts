import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite } from '../validate'

export function zonesRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed

    const url   = c.req.query('url')
    const zones = await db.getZoneStats(site, url)
    return c.json({ zones, meta: { site, url: url ?? null, total: zones.length } })
  })

  return r
}
