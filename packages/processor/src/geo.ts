import type { RawEvent, GeoRow } from './types'

interface Geo { country?: string | null; city?: string | null; region?: string | null }

// Sessions per country/city, using the first edge-geo seen for each session.
export function buildGeoStats(events: RawEvent[]): GeoRow[] {
  const geoBySid = new Map<string, { geo: Geo; t: number }>()
  for (const e of events) {
    const g = e.geo as Geo | undefined
    if (!g || (!g.country && !g.city)) continue
    const prev = geoBySid.get(e.sid)
    if (!prev || e.t < prev.t) geoBySid.set(e.sid, { geo: g, t: e.t })
  }

  const agg = new Map<string, GeoRow>()

  // aggregate distinct sessions
  const siteBySid = new Map<string, string>()
  for (const e of events) if (!siteBySid.has(e.sid)) siteBySid.set(e.sid, e.site)

  for (const [sid, rec] of geoBySid) {
    const site = siteBySid.get(sid) ?? ''
    const country = (rec.geo.country ?? '').slice(0, 2).toUpperCase() || 'XX'
    const city = (rec.geo.city ?? '').slice(0, 80)
    const key = `${site}|${country}|${city}`
    const row = agg.get(key)
    if (row) {
      row.sessions += 1
      row.lastSeen = Math.max(row.lastSeen, rec.t)
    } else {
      agg.set(key, { site, country, city, sessions: 1, lastSeen: rec.t })
    }
  }
  return [...agg.values()]
}
