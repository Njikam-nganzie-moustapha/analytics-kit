import type { RawEvent, ErrorGroup } from './types'

function fingerprint(e: RawEvent): string {
  if (e.type === 'network_error') {
    const method  = String(e.method ?? 'GET').toUpperCase()
    const rawUrl  = String(e.url ?? 'unknown')
    // Strip IDs and query strings so /users/123 and /users/456 group together
    const urlPath = rawUrl.replace(/\/\d+/g, '/:id').replace(/[?#].*/, '').slice(0, 100)
    return `net:${method}:${urlPath}`
  }
  // js_error: strip line/col numbers + memory addresses so the same bug groups
  const msg = String(e.msg ?? 'unknown')
    .replace(/:\d+:\d+/g, '')          // :line:col
    .replace(/\bat\b.*$/ms, '')         // strip stack tail embedded in message
    .replace(/0x[0-9a-f]+/gi, '0x?')   // memory addresses
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `js:${msg}`
}

export function buildErrorGroups(events: RawEvent[]): Map<string, ErrorGroup> {
  const groups = new Map<string, ErrorGroup>()

  for (const e of events) {
    if (e.type !== 'js_error' && e.type !== 'network_error') continue

    const fp  = fingerprint(e)
    const hit = groups.get(fp)

    if (hit) {
      hit.count++
      hit.sessions.add(e.sid)
      hit.lastSeen = Math.max(hit.lastSeen, e.t)
    } else {
      groups.set(fp, {
        fingerprint: fp,
        site:        e.site,
        message:     String(e.msg ?? e.url ?? 'unknown').slice(0, 300),
        eventType:   e.type,
        source:      e.source != null ? String(e.source).slice(0, 100) : undefined,
        stack:       e.stack  != null ? String(e.stack).slice(0, 800)  : undefined,
        count:       1,
        sessions:    new Set([e.sid]),
        firstSeen:   e.t,
        lastSeen:    e.t,
      })
    }
  }

  return groups
}
