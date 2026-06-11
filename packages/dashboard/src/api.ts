import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup, CronMonitor, VitalRow, ErrorOccurrence, UserSample, ErrorActivity, ReleaseRow, PerfRow, FeedbackItem, AlertRule } from './types'

const BASE       = ((import.meta.env.VITE_QUERY_API_URL as string | undefined) ?? 'http://localhost:4211').replace(/^﻿/, '').trim()
const PRESET_KEY = (import.meta.env.VITE_API_KEY as string | undefined) ?? ''
const TOKEN_KEY  = 'analyticskit_token'

// Use stored login token first, fall back to the pre-configured VITE_API_KEY
export function getToken(): string  { return localStorage.getItem(TOKEN_KEY) || PRESET_KEY }
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

export async function fetchSites(): Promise<string[]> {
  try {
    const res  = await fetch(`${BASE}/sites`, { headers: hdrs() })
    if (!res.ok) return []
    const data = await res.json() as { sites: string[] }
    return data.sites ?? []
  } catch { return [] }
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
  opts: { from?: number; to?: number; limit?: number; hasReplay?: boolean; hasError?: boolean; urlContains?: string } = {},
): Promise<SessionRow[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)        q.set('from',       String(opts.from))
  if (opts.to)          q.set('to',         String(opts.to))
  if (opts.limit)       q.set('limit',      String(opts.limit))
  if (opts.hasReplay)   q.set('has_replay', '1')
  if (opts.hasError)    q.set('has_error',  '1')
  if (opts.urlContains) q.set('url',        opts.urlContains)
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
  opts: { from?: number; to?: number; limit?: number; status?: string; query?: string } = {},
): Promise<ErrorGroup[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)   q.set('from',   String(opts.from))
  if (opts.to)     q.set('to',     String(opts.to))
  if (opts.limit)  q.set('limit',  String(opts.limit))
  if (opts.status) q.set('status', opts.status)
  if (opts.query)  q.set('query',  opts.query)
  const res  = await apiFetch(`${BASE}/errors?${q}`, { headers: hdrs() })
  const data = await res.json() as { errors: RawErrorGroup[] }
  return (data.errors ?? []).map(normalizeError)
}

export async function fetchErrorActivity(fingerprint: string, site: string): Promise<ErrorActivity[]> {
  const q = new URLSearchParams({ site })
  const res  = await apiFetch(`${BASE}/errors/${encodeURIComponent(fingerprint)}/activity?${q}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { activity: ErrorActivity[] }
  return data.activity ?? []
}

export async function fetchReleases(site: string): Promise<ReleaseRow[]> {
  const res  = await apiFetch(`${BASE}/releases?site=${encodeURIComponent(site)}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { releases: ReleaseRow[] }
  return data.releases ?? []
}

export async function fetchAlertRules(site: string): Promise<AlertRule[]> {
  const res  = await apiFetch(`${BASE}/alert-rules?site=${encodeURIComponent(site)}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { rules: AlertRule[] }
  return data.rules ?? []
}

export async function updateAlertRule(
  site: string,
  ruleType: string,
  rule: { enabled: boolean; threshold: number; cooldown_ms: number },
): Promise<void> {
  await apiFetch(
    `${BASE}/alert-rules/${encodeURIComponent(ruleType)}?site=${encodeURIComponent(site)}`,
    {
      method:  'PUT',
      headers: hdrs({ 'content-type': 'application/json' }),
      body:    JSON.stringify(rule),
    },
  )
}

export async function fetchFeedback(
  site: string,
  opts: { from?: number; to?: number; limit?: number } = {},
): Promise<FeedbackItem[]> {
  const q = new URLSearchParams({ site })
  if (opts.from)  q.set('from',  String(opts.from))
  if (opts.to)    q.set('to',    String(opts.to))
  if (opts.limit) q.set('limit', String(opts.limit))
  const res  = await apiFetch(`${BASE}/feedback?${q}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { items: FeedbackItem[] }
  return data.items ?? []
}

export async function fetchPerformance(site: string, url?: string): Promise<PerfRow[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await apiFetch(`${BASE}/performance?${q}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { rows: PerfRow[] }
  return data.rows ?? []
}

export async function fetchErrorEvents(fingerprint: string, site: string): Promise<ErrorOccurrence[]> {
  const q = new URLSearchParams({ site })
  const res  = await apiFetch(`${BASE}/errors/${encodeURIComponent(fingerprint)}/events?${q}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { events: ErrorOccurrence[] }
  return data.events ?? []
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

export async function fetchVitals(site: string, url?: string): Promise<VitalRow[]> {
  const q = new URLSearchParams({ site })
  if (url) q.set('url', url)
  const res  = await apiFetch(`${BASE}/vitals?${q}`, { headers: hdrs() })
  const data = await res.json() as { vitals: VitalRow[] }
  return data.vitals ?? []
}

export async function fetchSessionErrors(
  sid: string,
  site: string,
): Promise<{ type: string; msg: string; url: string | null; ts: number }[]> {
  const q = new URLSearchParams({ site })
  const res  = await apiFetch(`${BASE}/sessions/${encodeURIComponent(sid)}/errors?${q}`, { headers: hdrs() })
  if (!res.ok) return []
  const data = await res.json() as { errors: { type: string; msg: string; url: string | null; ts: number }[] }
  return data.errors ?? []
}

export async function deleteCronMonitor(monitorId: string, site: string): Promise<void> {
  await apiFetch(
    `${BASE}/cron/${encodeURIComponent(monitorId)}?site=${encodeURIComponent(site)}`,
    { method: 'DELETE', headers: hdrs() },
  )
}

// ── Source maps ───────────────────────────────────────────────────────────────

export interface SourceMapMeta {
  site: string; release: string; filename: string; size: number; uploadedAt: number
}

export async function fetchSourceMaps(site: string, release?: string): Promise<SourceMapMeta[]> {
  const q = new URLSearchParams({ site })
  if (release) q.set('release', release)
  const res  = await apiFetch(`${BASE}/sourcemaps?${q}`, { headers: hdrs() })
  const data = await res.json() as { maps: SourceMapMeta[] }
  return data.maps ?? []
}

export async function uploadSourceMap(
  site: string,
  release: string,
  filename: string,
  content: string,
): Promise<void> {
  const q = new URLSearchParams({ site, release, filename })
  await apiFetch(`${BASE}/sourcemaps?${q}`, {
    method:  'POST',
    headers: hdrs({ 'content-type': 'application/json' }),
    body:    content,
  })
}

export async function deleteSourceMap(site: string, release: string, filename: string): Promise<void> {
  const q = new URLSearchParams({ site, release, filename })
  await apiFetch(`${BASE}/sourcemaps?${q}`, { method: 'DELETE', headers: hdrs() })
}

// ── Normalisation ─────────────────────────────────────────────────────────────
// The API returns breadcrumbs as a JSON string; parse it here.

interface RawErrorGroup extends Omit<ErrorGroup, 'breadcrumbs' | 'userSample' | 'recentCounts'> {
  breadcrumbs:  string | null
  userSample:   string | null
  recentCounts: number[] | undefined
}

function normalizeError(r: RawErrorGroup): ErrorGroup {
  let breadcrumbs: ErrorGroup['breadcrumbs'] = []
  if (r.breadcrumbs) {
    try { breadcrumbs = JSON.parse(r.breadcrumbs) } catch { /* ignore */ }
  }
  let userSample: UserSample | null = null
  if (r.userSample) {
    try { userSample = JSON.parse(r.userSample) } catch { /* ignore */ }
  }
  return { ...r, breadcrumbs, userSample, recentCounts: r.recentCounts ?? new Array(14).fill(0) }
}
