import type { RawEvent, DeviceRow, ScreenRow } from './types'
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

// Viewport resolution per session (from session_start vpW × vpH).
// Snapped to the nearest common width breakpoint to avoid excessive cardinality.
const BREAKPOINTS = [360, 390, 414, 430, 768, 1024, 1280, 1366, 1440, 1536, 1920, 2560]
function snapWidth(w: number): number {
  return BREAKPOINTS.reduce((best, b) => Math.abs(b - w) < Math.abs(best - w) ? b : best, BREAKPOINTS[0])
}

export function buildScreenStats(events: RawEvent[]): ScreenRow[] {
  const vpBySid = new Map<string, { w: number; h: number; site: string }>()
  for (const e of events) {
    if (e.type !== 'session_start') continue
    if (vpBySid.has(e.sid)) continue
    const w = typeof e.vpW === 'number' ? e.vpW : typeof e.vw === 'number' ? e.vw : 0
    const h = typeof e.vpH === 'number' ? e.vpH : typeof e.vh === 'number' ? e.vh : 0
    if (w > 0 && h > 0) vpBySid.set(e.sid, { w, h, site: e.site })
  }

  const agg = new Map<string, ScreenRow>()
  for (const { w, h, site } of vpBySid.values()) {
    const snapped = snapWidth(w)
    const resolution = `${snapped}×${h}`
    const key = `${site}|${resolution}`
    const row = agg.get(key)
    if (row) row.sessions += 1
    else agg.set(key, { site, resolution, sessions: 1 })
  }
  return [...agg.values()]
}
