import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function replayRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/:sid', async c => {
    const sid    = c.req.param('sid')
    const events = await db.getReplayEvents(sid)
    if (events.length === 0) return c.json({ error: 'no replay data for this session' }, 404)
    return c.json({ sid, events, count: events.length })
  })

  return r
}
