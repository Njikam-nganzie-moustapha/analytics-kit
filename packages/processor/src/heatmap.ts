import type { RawEvent, HeatmapCell, ClickElementRow } from './types'

export const CELL_PX = 10   // one grid cell = 10px × 10px

// Strip query string + hash from URL — same page different queries = same heatmap
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    return u.origin + u.pathname
  } catch {
    return raw.split('?')[0].split('#')[0]
  }
}

export function buildHeatmapCells(events: RawEvent[]): HeatmapCell[] {
  const map = new Map<string, HeatmapCell>()

  for (const e of events) {
    if (e.type !== 'mouse_move' && e.type !== 'click') continue
    if (typeof e.x !== 'number' || typeof e.y !== 'number') continue

    const url = normalizeUrl(String(e.url ?? '/'))
    const gx  = Math.max(0, Math.floor(e.x / CELL_PX))
    const gy  = Math.max(0, Math.floor(e.y / CELL_PX))
    const key = `${e.site}\x00${url}\x00${gx}\x00${gy}`

    const cell = map.get(key)
    if (cell) {
      cell.count++
    } else {
      map.set(key, { site: e.site, url, gx, gy, count: 1 })
    }
  }

  return Array.from(map.values())
}

// Build per-element click counts for ranking (element label × device × url)
export function buildClickElements(events: RawEvent[]): ClickElementRow[] {
  const map = new Map<string, ClickElementRow>()

  for (const e of events) {
    if (e.type !== 'click') continue
    if (typeof e.el !== 'string' || !e.el.trim()) continue

    const url    = normalizeUrl(String(e.url ?? '/'))
    const el     = e.el.trim().slice(0, 60)
    const device = typeof e.device === 'string' ? e.device : 'desktop'
    const key    = `${e.site}\x00${url}\x00${el}\x00${device}`

    const row = map.get(key)
    if (row) {
      row.count++
    } else {
      map.set(key, { site: e.site, url, el, device, count: 1 })
    }
  }

  return Array.from(map.values())
}

// Normalize counts: 0.0–1.0 relative to max in the set.
// Applied at query time (not storage time) so raw counts can accumulate.
export function normalizeCells(cells: HeatmapCell[]): (HeatmapCell & { intensity: number })[] {
  const max = Math.max(1, ...cells.map(c => c.count))
  return cells.map(c => ({ ...c, intensity: c.count / max }))
}
