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

export interface AlertRule {
  site:       string
  ruleType:   string
  enabled:    boolean
  threshold:  number
  cooldownMs: number
  updated:    number
}

export interface SavedView {
  id:    string
  label: string
  site:  string
  env:   string
  url:   string
  tab:   string
}

export interface AlertChannels {
  telegram: { configured: boolean; chatId: string | null }
  slack:    { configured: boolean; webhookUrl: string | null }
}

export interface FeedbackItem {
  id:      number
  site:    string
  sid:     string
  uid:     string | null
  name:    string | null
  email:   string | null
  message: string
  url:     string | null
  ts:      number
}

// ── Audience + overview ─────────────────────────────────────────────────────────

export type Channel = 'direct' | 'organic' | 'social' | 'referral' | 'ai'

export interface TrafficSource {
  site: string; channel: Channel; referrerHost: string
  utmSource: string; utmMedium: string; utmCampaign: string
  utmContent: string; utmTerm: string
  sessions: number; lastSeen: number
}

export interface GeoStat { site: string; country: string; city: string; sessions: number }

export interface DeviceStat { site: string; deviceType: string; browser: string; os: string; sessions: number }

export interface ScreenStat { site: string; resolution: string; sessions: number }

export interface BotStat { site: string; bot: string; category: string; hits: number; lastSeen: number }

export interface ConversionStat { site: string; kind: string; url: string; count: number; lastSeen: number }

export interface OverviewSummary {
  site: string
  sessions: number
  users: number
  errorSessions: number
  errorRate: number
  conversions: number
  vitalsGoodPct: number
  perfP75: number
  health: number
  series: { day: number; sessions: number; errors: number }[]
  // New KPIs:
  pageviews: number
  bounceRate: number         // 0–100
  avgDuration: number        // ms
  // Previous period (used for delta ▲▼ badges):
  prevSessions: number
  prevUsers: number
  prevConversions: number
  prevErrorRate: number      // 0–100
}

export interface SiteTotal { site: string; sessions: number; lastSeen: number }

export interface ActivityDay { day: string; sessions: number }

export interface FunnelStep { label: string; type: 'url' | 'event'; match: string }
export interface FunnelDef { id: string; site: string; name: string; steps: FunnelStep[]; updated: number }
export interface FunnelResult { counts: number[]; total: number; steps: FunnelStep[] }

export interface SeoCheck { id: string; label: string; status: 'pass' | 'warn' | 'fail'; detail: string; fix?: string; weight: number }
export interface SeoReport { url: string; score: number; title: string | null; description: string | null; checks: SeoCheck[] }

export interface PsMetric { id: string; label: string; display: string; numeric: number | null }
export interface PageSpeedResult {
  url: string
  strategy: string
  score: number
  metrics: PsMetric[]
  categories?: { performance: number; accessibility: number; seo: number; bestPractices: number }
}

export interface Branding { site: string; productName: string | null; logoUrl: string | null; primary: string | null; updated: number }

export interface PageRow { url: string; views: number; entries: number; exits: number; bounceRate: number; avgDuration: number }

export interface ChannelSeriesPoint { day: number; channel: string; sessions: number }
