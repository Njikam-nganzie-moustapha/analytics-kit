import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function sitesRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const sites = await db.getAvailableSites()
    return c.json({ sites })
  })

  return r
}
