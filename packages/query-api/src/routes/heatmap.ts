import { Hono } from 'hono'
import type { QueryTurso, HeatmapRow } from '../turso'

// Normalize counts to 0–1 intensity so the dashboard renderer is scale-independent.
function normalize(cells: HeatmapRow[]): Array<HeatmapRow & { intensity: number }> {
  const max = Math.max(...cells.map(c => c.count), 1)
  return cells.map(c => ({ ...c, intensity: c.count / max }))
}

export function heatmapRouter(db: QueryTurso) {
  const r = new Hono()

  r.get('/', async c => {
    const site = c.req.query('site')
    if (!site) return c.json({ error: 'site is required' }, 400)

    const url   = c.req.query('url')
    const cells = await db.getHeatmapCells(site, url)
    return c.json({ cells: normalize(cells), meta: { site, url: url ?? null, total: cells.length } })
  })

  return r
}
