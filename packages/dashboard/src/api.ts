import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup, CronMonitor } from './types'

const BASE      = (import.meta.env.VITE_QUERY_API_URL as string | undefined) ?? 'http://localhost:4211'
const TOKEN_KEY = 'analyticskit_token'

export function getToken(): string  { return localStorage.getItem(TOKEN_KEY) ?? '' }
export function setToken(t: string) { localStorage.setItem(TOKEN_KEY, t) }
export function clearToken()        { localStorage.removeItem(TOKEN_KEY) }

function hdrs(extra?: Record<string, string>): HeadersInit {
  const t = getToken()
  return t ? { 'x-api-key': t, ...extra } : { ...extra }
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    clearToken()
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
  opts: { from?: number; to?: number; limit?: number; status?: string } = {},
): Promise<ErrorGroup[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)   q.set('from',   String(opts.from))
  if (opts.to)     q.set('to',     String(opts.to))
  if (opts.limit)  q.set('limit',  String(opts.limit))
  if (opts.status) q.set('status', opts.status)
  const res  = await apiFetch(`${BASE}/errors?${q}`, { headers: hdrs() })
  const data = await res.json() as { errors: RawErrorGroup[] }
  return (data.errors ?? []).map(normalizeError)
}

export async function updateError(
  fingerprint: string,
  site: string,
  update: { status?: string; assignee?: string; note?: string },
): Promise<void> {
  await apiFetch(
    `${BASE}/errors/${encodeURIComponent(fingerprint)}?site=${encodeURIComponent(site)}`,
    {
      method:  'PATCH',
      headers: hdrs({ 'content-type': 'application/json' }),
      body:    JSON.stringify(update),
    },
  )
}

export async function fetchCronMonitors(site: string): Promise<CronMonitor[]> {
  const res  = await apiFetch(`${BASE}/cron?site=${encodeURIComponent(site)}`, { headers: hdrs() })
  const data = await res.json() as { monitors: CronMonitor[] }
  return data.monitors ?? []
}

export async function deleteCronMonitor(monitorId: string, site: string): Promise<void> {
  await apiFetch(
    `${BASE}/cron/${encodeURIComponent(monitorId)}?site=${encodeURIComponent(site)}`,
    { method: 'DELETE', headers: hdrs() },
  )
}

// ── Normalisation ─────────────────────────────────────────────────────────────
// The API returns breadcrumbs as a JSON string; parse it here.

interface RawErrorGroup extends Omit<ErrorGroup, 'breadcrumbs'> {
  breadcrumbs: string | null
}

function normalizeError(r: RawErrorGroup): ErrorGroup {
  let breadcrumbs: ErrorGroup['breadcrumbs'] = []
  if (r.breadcrumbs) {
    try { breadcrumbs = JSON.parse(r.breadcrumbs) } catch { /* ignore */ }
  }
  return { ...r, breadcrumbs }
}
