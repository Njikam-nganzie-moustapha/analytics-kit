import { Hono } from 'hono'
import type { QueryTurso } from '../turso'

export function sessionsRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const site = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    const fromStr     = c.req.query('from')
    const toStr       = c.req.query('to')
    const limitStr    = c.req.query('limit')
    const hasReplayQs = c.req.query('has_replay')

    const from      = fromStr  ? parseInt(fromStr)  : undefined
    const to        = toStr    ? parseInt(toStr)    : undefined
    const limit     = limitStr ? parseInt(limitStr) : 100
    const hasReplay = hasReplayQs === '1' || hasReplayQs === 'true' ? true : undefined

    const sessions = await db.getSessions(site, { from, to, limit, hasReplay })
    return c.json({ sessions, meta: { site, total: sessions.length } })
  })

  return r
}
