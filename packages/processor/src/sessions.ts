import type { RawEvent, SessionStat } from './types'

export function buildSessionStats(events: RawEvent[]): SessionStat[] {
  // Group events by session ID
  const bySession = new Map<string, RawEvent[]>()
  for (const e of events) {
    const bucket = bySession.get(e.sid)
    if (bucket) { bucket.push(e) } else { bySession.set(e.sid, [e]) }
  }

  const stats: SessionStat[] = []

  for (const [sid, evs] of bySession) {
    if (evs.length === 0) continue
    const first = evs[0]

    const times = evs.map(e => e.t)
    const started = Math.min(...times)
    const ended   = Math.max(...times)

    const urls = new Set<string>()
    for (const e of evs) { if (e.url) urls.add(String(e.url)) }

    const endEv = evs.find(e => e.type === 'session_end')
    const duration = endEv && typeof endEv.duration === 'number'
      ? endEv.duration
      : ended - started

    stats.push({
      sid,
      site:       first.site,
      uid:        first.uid,
      started,
      ended,
      duration,
      urlCount:   urls.size,
      eventCount: evs.length,
      hasReplay:  evs.some(e => e.type === 'rrweb_chunk'),
    })
  }

  return stats
}
