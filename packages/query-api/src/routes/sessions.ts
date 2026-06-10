import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite } from '../validate'

export function sessionsRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed

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

  // GET /sessions/:sid/errors — errors that occurred during a specific session
  r.get('/:sid/errors', async c => {
    const sid    = c.req.param('sid')
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed

    const errors = await db.getSessionErrors(sid, site)
    return c.json({ errors, sid })
  })

  return r
}
