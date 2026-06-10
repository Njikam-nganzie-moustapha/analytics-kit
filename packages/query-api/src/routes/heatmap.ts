import { Hono } from 'hono'
import type { QueryTurso, HeatmapRow } from '../turso'
import { parseSite } from '../validate'

// Normalize counts to 0–1 intensity so the dashboard renderer is scale-independent.
function normalize(cells: HeatmapRow[]): Array<HeatmapRow & { intensity: number }> {
  const max = Math.max(...cells.map(c => c.count), 1)
  return cells.map(c => ({ ...c, intensity: c.count / max }))
}

export function heatmapRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const parsed = parseSite(c.req.query('site'))
    if (!parsed) return c.json({ error: 'site is required and must be a valid site ID (a-z, 0-9, -, _, .)' }, 400)
    const { site } = parsed

    const url   = c.req.query('url')
    const cells = await db.getHeatmapCells(site, url)
    return c.json({ cells: normalize(cells), meta: { site, url: url ?? null, total: cells.length } })
  })

  return r
}
