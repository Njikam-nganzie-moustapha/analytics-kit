import type { RawEvent, ErrorGroup, Breadcrumb } from './types'

function fingerprint(e: RawEvent): string {
  if (e.type === 'network_error') {
    const method  = String(e.method ?? 'GET').toUpperCase()
    const rawUrl  = String(e.url ?? 'unknown')
    const urlPath = rawUrl.replace(/\/\d+/g, '/:id').replace(/[?#].*/, '').slice(0, 100)
    return `net:${method}:${urlPath}`
  }
  const msg = String(e.msg ?? 'unknown')
    .replace(/:\d+:\d+/g, '')
    .replace(/\bat\b.*$/ms, '')
    .replace(/0x[0-9a-f]+/gi, '0x?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `js:${msg}`
}

function parseBreadcrumbs(e: RawEvent): Breadcrumb[] | undefined {
  if (!Array.isArray(e.breadcrumbs) || e.breadcrumbs.length === 0) return undefined
  return (e.breadcrumbs as unknown[]).filter(
    (b): b is Breadcrumb =>
      b !== null && typeof b === 'object' &&
      typeof (b as Record<string, unknown>).t === 'number' &&
      typeof (b as Record<string, unknown>).message === 'string',
  )
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
      // Keep breadcrumbs from the latest occurrence
      const crumbs = parseBreadcrumbs(e)
      if (crumbs) hit.breadcrumbs = crumbs
      if (e.release) hit.release = String(e.release)
    } else {
      groups.set(fp, {
        fingerprint: fp,
        site:        e.site,
        message:     String(e.msg ?? e.url ?? 'unknown').slice(0, 300),
        eventType:   e.type,
        source:      e.source != null ? String(e.source).slice(0, 100) : undefined,
        stack:       e.stack  != null ? String(e.stack).slice(0, 800)  : undefined,
        release:     e.release != null ? String(e.release).slice(0, 80) : undefined,
        breadcrumbs: parseBreadcrumbs(e),
        count:       1,
        sessions:    new Set([e.sid]),
        firstSeen:   e.t,
        lastSeen:    e.t,
      })
    }
  }

  return groups
}
