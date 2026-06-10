import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite } from '../validate'

export function vitalsRouter(db: QueryTurso) {
  const app = new Hono()

  // GET /vitals?site=X&url=Y
  app.get('/', async c => {
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed
    const url = c.req.query('url') ?? undefined

    const rows = await db.getVitals(site, url)
    return c.json({ vitals: rows })
  })

  return app
}
