import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite } from '../validate'

export function replayRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/:sid', async c => {
    const p = parseSite(c.req.query('site'))
    if (!p) return c.json({ error: 'site required' }, 400)
    const sid    = c.req.param('sid')
    const events = await db.getReplayEvents(sid, p.site)
    if (events.length === 0) return c.json({ error: 'no replay data for this session' }, 404)
    return c.json({ sid, events, count: events.length })
  })

  return r
}
