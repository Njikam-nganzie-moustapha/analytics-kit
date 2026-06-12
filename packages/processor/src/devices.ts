import type { RawEvent, DeviceRow } from './types'
import { parseUA } from './useragent'

// Sessions per device-type / browser / OS, parsed from session_start UA.
export function buildDeviceStats(events: RawEvent[]): DeviceRow[] {
  const uaBySid = new Map<string, string>()
  for (const e of events) {
    if (e.type !== 'session_start') continue
    if (typeof e.ua === 'string' && !uaBySid.has(e.sid)) uaBySid.set(e.sid, e.ua)
  }

  const siteBySid = new Map<string, string>()
  for (const e of events) if (!siteBySid.has(e.sid)) siteBySid.set(e.sid, e.site)

  const agg = new Map<string, DeviceRow>()
  for (const [sid, ua] of uaBySid) {
    const { deviceType, browser, os } = parseUA(ua)
    if (deviceType === 'bot') continue
    const site = siteBySid.get(sid) ?? ''
    const key = `${site}|${deviceType}|${browser}|${os}`
    const row = agg.get(key)
    if (row) row.sessions += 1
    else agg.set(key, { site, deviceType, browser, os, sessions: 1 })
  }
  return [...agg.values()]
}
