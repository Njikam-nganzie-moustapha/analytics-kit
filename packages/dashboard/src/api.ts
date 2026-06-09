import type { HeatmapCell, ZoneRow, SessionRow } from './types'

const BASE = (import.meta.env.VITE_QUERY_API_URL as string | undefined) ?? 'http://localhost:4211'
const KEY  = (import.meta.env.VITE_API_KEY       as string | undefined) ?? ''

function hdrs(): HeadersInit {
  return KEY ? { 'x-api-key': KEY } : {}
}

export async function fetchHeatmap(site: string, url?: string): Promise<HeatmapCell[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await fetch(`${BASE}/heatmap?${q}`, { headers: hdrs() })
  const data = await res.json() as { cells: HeatmapCell[] }
  return data.cells ?? []
}

export async function fetchZones(site: string, url?: string): Promise<ZoneRow[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await fetch(`${BASE}/zones?${q}`, { headers: hdrs() })
  const data = await res.json() as { zones: ZoneRow[] }
  return data.zones ?? []
}

export async function fetchSessions(
  site: string,
  opts: { from?: number; to?: number; limit?: number; hasReplay?: boolean } = {},
): Promise<SessionRow[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)      q.set('from',       String(opts.from))
  if (opts.to)        q.set('to',         String(opts.to))
  if (opts.limit)     q.set('limit',      String(opts.limit))
  if (opts.hasReplay) q.set('has_replay', '1')
  const res  = await fetch(`${BASE}/sessions?${q}`, { headers: hdrs() })
  const data = await res.json() as { sessions: SessionRow[] }
  return data.sessions ?? []
}

export async function fetchReplay(sid: string): Promise<unknown[]> {
  const res = await fetch(`${BASE}/replay/${encodeURIComponent(sid)}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { events: unknown[] }
  return data.events ?? []
}
