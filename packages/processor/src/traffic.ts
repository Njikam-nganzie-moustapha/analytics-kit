import type { RawEvent, TrafficRow } from './types'
import { classifyReferrer, parseUTM, hostOf } from './referrer'

// One landing record per session: channel + referrer host + UTM campaign.
// Derived from session_start (falls back to the first page_view of a session).
export function buildTrafficSources(events: RawEvent[]): TrafficRow[] {
  const landingBySid = new Map<string, RawEvent>()
  for (const e of events) {
    if (e.type !== 'session_start' && e.type !== 'page_view') continue
    const prev = landingBySid.get(e.sid)
    // prefer session_start; otherwise the earliest event
    if (!prev || (e.type === 'session_start' && prev.type !== 'session_start') || e.t < prev.t) {
      landingBySid.set(e.sid, e)
    }
  }

  const agg = new Map<string, TrafficRow>()
  for (const e of landingBySid.values()) {
    const selfHost = hostOf(typeof e.url === 'string' ? e.url : undefined)
    const referrer = typeof e.referrer === 'string' ? e.referrer : undefined
    const channel = classifyReferrer(referrer, selfHost)
    const referrerHost = hostOf(referrer)
    const utm = parseUTM(typeof e.url === 'string' ? e.url : undefined)
    const day = Math.floor(e.t / 86_400_000)
    const key = `${e.site}|${channel}|${referrerHost}|${utm.source}|${utm.medium}|${utm.campaign}|${day}`
    const row = agg.get(key)
    if (row) {
      row.sessions += 1
      row.lastSeen = Math.max(row.lastSeen, e.t)
    } else {
      agg.set(key, {
        site: e.site,
        channel,
        referrerHost,
        utmSource: utm.source,
        utmMedium: utm.medium,
        utmCampaign: utm.campaign,
        utmContent: utm.content,
        utmTerm: utm.term,
        sessions: 1,
        lastSeen: e.t,
        day,
      })
    }
  }
  return [...agg.values()]
}
