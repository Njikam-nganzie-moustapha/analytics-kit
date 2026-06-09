import type { RawEvent, ZoneStat } from './types'

function normalizeUrl(raw: string): string {
  try { const u = new URL(raw); return u.origin + u.pathname } catch { return raw.split('?')[0] }
}

export function buildZoneStats(events: RawEvent[]): ZoneStat[] {
  const map = new Map<string, ZoneStat>()

  function key(e: RawEvent, zoneId: string): string {
    return `${e.site}\x00${zoneId}\x00${normalizeUrl(String(e.url ?? '/'))}`
  }

  function getOrCreate(e: RawEvent, zoneId: string): ZoneStat {
    const k = key(e, zoneId)
    let stat = map.get(k)
    if (!stat) {
      stat = { site: e.site, zoneId, url: normalizeUrl(String(e.url ?? '/')), enters: 0, clicks: 0, totalDwell: 0, samples: 0 }
      map.set(k, stat)
    }
    return stat
  }

  for (const e of events) {
    if (e.type === 'zone_enter' && e.zoneId) {
      getOrCreate(e, e.zoneId).enters++
    }

    if (e.type === 'zone_leave' && e.zoneId) {
      const stat = getOrCreate(e, e.zoneId)
      if (typeof e.dwellMs === 'number') {
        stat.totalDwell += e.dwellMs
        stat.samples++
      }
    }

    // click carries zoneIds[] (SDK >= 0.1) or legacy zone string
    if (e.type === 'click') {
      const ids: string[] = Array.isArray(e.zoneIds)
        ? (e.zoneIds as string[])
        : typeof e.zone === 'string' ? [e.zone] : []
      for (const id of ids) getOrCreate(e, id).clicks++
    }
  }

  return Array.from(map.values())
}
