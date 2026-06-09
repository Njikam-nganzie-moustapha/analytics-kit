import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup } from './types'

const BASE      = (import.meta.env.VITE_QUERY_API_URL as string | undefined) ?? 'http://localhost:4211'
const TOKEN_KEY = 'analyticskit_token'

export function getToken(): string  { return localStorage.getItem(TOKEN_KEY) ?? '' }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()        { localStorage.removeItem(TOKEN_KEY) }

function hdrs(): HeadersInit {
  const t = getToken()
  return t ? { 'x-api-key': t } : {}
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    clearToken()
    // Re-throw so callers know auth failed
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  }
  return res
}

export async function authStatus(): Promise<{ required: boolean }> {
  const res = await fetch(`${BASE}/auth`)
  return res.json() as Promise<{ required: boolean }>
}

export async function login(password: string): Promise<boolean> {
  const res = await fetch(`${BASE}/auth`, {
    method:  'POST',
    headers: { 'content-type': 'application/json' },
    body:    JSON.stringify({ password }),
  })
  if (!res.ok) return false
  const data = await res.json() as { token: string | null; required: boolean }
  // token === null means open access (no DASHBOARD_PASSWORD set)
  setToken(data.token ?? '')
  return true
}

export async function fetchHeatmap(site: string, url?: string): Promise<HeatmapCell[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await apiFetch(`${BASE}/heatmap?${q}`, { headers: hdrs() })
  const data = await res.json() as { cells: HeatmapCell[] }
  return data.cells ?? []
}

export async function fetchZones(site: string, url?: string): Promise<ZoneRow[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await apiFetch(`${BASE}/zones?${q}`, { headers: hdrs() })
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
  const res  = await apiFetch(`${BASE}/sessions?${q}`, { headers: hdrs() })
  const data = await res.json() as { sessions: SessionRow[] }
  return data.sessions ?? []
}

export async function fetchReplay(sid: string): Promise<unknown[]> {
  const res = await apiFetch(`${BASE}/replay/${encodeURIComponent(sid)}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { events: unknown[] }
  return data.events ?? []
}

export async function fetchErrors(
  site: string,
  opts: { from?: number; to?: number; limit?: number } = {},
): Promise<ErrorGroup[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)  q.set('from',  String(opts.from))
  if (opts.to)    q.set('to',    String(opts.to))
  if (opts.limit) q.set('limit', String(opts.limit))
  const res  = await apiFetch(`${BASE}/errors?${q}`, { headers: hdrs() })
  const data = await res.json() as { errors: ErrorGroup[] }
  return data.errors ?? []
}
