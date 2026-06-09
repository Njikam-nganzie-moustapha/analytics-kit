import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function errorsRouter(db: QueryTurso) {
  const app = new Hono()

  app.get('/', async c => {
    const site  = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    const from  = c.req.query('from')  ? parseInt(c.req.query('from')!)  : undefined
    const to    = c.req.query('to')    ? parseInt(c.req.query('to')!)    : undefined
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined

    const errors = await db.getErrorGroups(site, { from, to, limit })
    return c.json({ errors })
  })

  return app
}
