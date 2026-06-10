import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite } from '../validate'

export function errorsRouter(db: QueryTurso) {
  const app = new Hono()

  // GET /errors?site=X&status=open|ignored|resolved|regressed&from=&to=&limit=
  app.get('/', async c => {
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed

    const from   = c.req.query('from')   ? parseInt(c.req.query('from')!)   : undefined
    const to     = c.req.query('to')     ? parseInt(c.req.query('to')!)     : undefined
    const limit  = c.req.query('limit')  ? parseInt(c.req.query('limit')!)  : undefined
    const status = c.req.query('status') ?? undefined

    const errors = await db.getErrorGroups(site, { from, to, limit, status })
    return c.json({ errors })
  })

  // PATCH /errors/:fingerprint?site=X
  // Body: { status?, assignee?, note? }
  app.patch('/:fingerprint', async c => {
    const parsed      = parseSite(c.req.query('site'))
    const fingerprint = c.req.param('fingerprint')
    if (!parsed)      return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site }    = parsed
    if (!fingerprint) return c.json({ error: 'fingerprint is required' }, 400)

    let body: { status?: string; assignee?: string; note?: string }
    try { body = await c.req.json() } catch { return c.json({ error: 'invalid json' }, 400) }

    const VALID_STATUSES = ['open', 'ignored', 'resolved', 'regressed']
    if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
      return c.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, 400)
    }

    await db.updateErrorState(site, fingerprint, body)
    return c.json({ ok: true })
  })

  return app
}
