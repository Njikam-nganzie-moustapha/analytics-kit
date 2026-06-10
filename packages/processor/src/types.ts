export interface RawEvent {
  t: number
  type: string
  sid: string
  site: string
  uid?: string
  url?: string
  release?: string
  x?: number
  y?: number
  vpW?: number
  vpH?: number
  zoneId?: string
  dwellMs?: number
  breadcrumbs?: Breadcrumb[]
  [key: string]: unknown
}

export interface Breadcrumb {
  t: number
  category: string
  message: string
  data?: Record<string, unknown>
}

export interface HeatmapCell {
  site: string
  url: string
  gx: number
  gy: number
  count: number
}

export interface ZoneStat {
  site: string
  zoneId: string
  url: string
  enters: number
  clicks: number
  totalDwell: number
  samples: number
}

export interface SessionStat {
  sid: string
  site: string
  uid: string | undefined
  started: number
  ended: number
  duration: number
  urlCount: number
  eventCount: number
  hasReplay: boolean
}

export interface ErrorGroup {
  fingerprint: string
  site: string
  message: string
  eventType: string
  source?: string
  stack?: string
  release?: string
  breadcrumbs?: Breadcrumb[]
  count: number
  sessions: Set<string>
  firstSeen: number
  lastSeen: number
}

export interface Checkpoint {
  site: string
  lastT: number
}
