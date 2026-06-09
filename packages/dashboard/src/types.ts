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
  urlCount: number; eventCount: number; hasReplay: boolean
}

export interface ErrorGroup {
  fingerprint: string
  site: string
  message: string
  eventType: string
  source: string | null
  stack: string | null
  count: number
  sessions: number
  firstSeen: number
  lastSeen: number
}
