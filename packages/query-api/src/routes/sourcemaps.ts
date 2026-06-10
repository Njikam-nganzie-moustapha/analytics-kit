import { Hono } from 'hono'
import type { QueryTurso } from '../turso'
import { parseSite, parseRelease, parseFilename } from '../validate'

const MAX_SIZE_BYTES = 5 * 1024 * 1024   // 5 MB per source map

export function sourcemapsRouter(db: QueryTurso) {
  const app = new Hono()

  // POST /sourcemaps?site=X&release=Y&filename=main.js.map
  // Body: raw JSON source map text (Content-Type: application/json or text/plain)
  app.post('/', async c => {
    const siteP     = parseSite(c.req.query('site'))
    const releaseP  = parseRelease(c.req.query('release'))
    const filenameP = parseFilename(c.req.query('filename'))

    if (!siteP)     return c.json({ error: 'site is required and must be a valid site ID' }, 400)
    if (!releaseP)  return c.json({ error: 'release is required (semver or slug, max 128 chars)' }, 400)
    if (!filenameP) return c.json({ error: 'filename is required (no path traversal, max 256 chars)' }, 400)

    const { site } = siteP; const { release } = releaseP; const { filename } = filenameP

    const body = await c.req.text()
    if (body.length > MAX_SIZE_BYTES) {
      return c.json({ error: `source map exceeds ${MAX_SIZE_BYTES / 1024 / 1024}MB limit` }, 413)
    }

    // Basic validation — must be valid JSON with version:3
    try {
      const sm = JSON.parse(body) as { version?: number }
      if (sm.version !== 3) return c.json({ error: 'only source map v3 is supported' }, 400)
    } catch {
      return c.json({ error: 'invalid JSON' }, 400)
    }

    await db.upsertSourceMap(site, release, filename, body)
    return c.json({ ok: true, site, release, filename, size: body.length })
  })

  // GET /sourcemaps?site=X[&release=Y] — list uploaded maps (all releases if release omitted)
  app.get('/', async c => {
    const siteP = parseSite(c.req.query('site'))
    if (!siteP) return c.json({ error: 'site is required and must be a valid site ID' }, 400)
    const { site } = siteP
    const rawRelease = c.req.query('release')
    const release = rawRelease ? (parseRelease(rawRelease)?.release ?? '') : ''

    const maps = await db.listSourceMaps(site, release)
    return c.json({ maps })
  })

  // DELETE /sourcemaps?site=X&release=Y&filename=main.js.map
  app.delete('/', async c => {
    const siteP     = parseSite(c.req.query('site'))
    const releaseP  = parseRelease(c.req.query('release'))
    const filenameP = parseFilename(c.req.query('filename'))
    if (!siteP || !releaseP || !filenameP) {
      return c.json({ error: 'site, release, and filename are required and must be valid' }, 400)
    }
    const { site } = siteP; const { release } = releaseP; const { filename } = filenameP

    await db.deleteSourceMap(site, release, filename)
    return c.json({ ok: true })
  })

  return app
}
