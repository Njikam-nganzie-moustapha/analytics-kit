export interface HeatmapCell {
  site: string; url: string; gx: number; gy: number; count: number; intensity: number
}

export interface ZoneRow {
  site: string; zoneId: string; url: string
  enters: number; clicks: number; avgDwell: number
}

export interface SessionRow {
  sid: string; site: string; uid: string | null
  started: number; ended: number; duration: number
  urlCount: number; eventCount: number; hasReplay: boolean; hasError: boolean
}

export type ErrorStatus = 'open' | 'ignored' | 'resolved' | 'regressed'

export interface Breadcrumb {
  t: number
  category: 'navigation' | 'click' | 'console' | 'http'
  message: string
  data?: Record<string, unknown>
}

export interface UserSample {
  id?:    string
  email?: string
  name?:  string
}

export interface ErrorOccurrence {
  ts:      number
  url:     string | null
  stack:   string | null
  user:    string | null
  sid:     string | null
  release: string | null
}

export interface ErrorGroup {
  fingerprint: string
  site: string
  message: string
  eventType: string
  source: string | null
  stack: string | null
  release: string | null
  breadcrumbs: Breadcrumb[]
  userSample: UserSample | null
  recentCounts: number[]          // 14 days, index 13 = today
  count: number
  sessions: number
  firstSeen: number
  lastSeen: number
  // from error_states JOIN
  status: ErrorStatus
  assignee: string | null
  note: string | null
}

export interface VitalRow {
  site:     string
  url:      string
  metric:   string
  good:     number
  needsImp: number
  poor:     number
  avg:      number
  total:    number
}

export interface CronMonitor {
  monitorId: string
  site: string
  intervalMs: number
  graceMs: number
  lastCheckin: number | null
  status: 'ok' | 'late' | 'missing'
}

export interface ErrorActivity {
  id: number
  site: string
  fingerprint: string
  action: string
  actor: string | null
  ts: number
}

export interface ReleaseRow {
  release: string
  site: string
  groups: number
  events: number
  lastSeen: number
}

export interface PerfRow {
  site:  string
  url:   string
  count: number
  avg:   number
  min:   number
  max:   number
  p50:   number
  p75:   number
  p95:   number
}
