export interface RawEvent {
  t: number
  type: string
  sid: string
  site: string
  uid?: string
  url?: string
  x?: number
  y?: number
  vpW?: number
  vpH?: number
  zoneId?: string
  dwellMs?: number
  [key: string]: unknown
}

export interface HeatmapCell {
  site: string
  url: string
  gx: number      // floor(x / CELL_PX)
  gy: number      // floor(y / CELL_PX)
  count: number
}

export interface ZoneStat {
  site: string
  zoneId: string
  url: string
  enters: number
  clicks: number
  totalDwell: number   // sum of all dwell_ms for this zone
  samples: number      // number of leave events (for avg computation)
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
  eventType: string     // 'js_error' | 'network_error'
  source?: string
  stack?: string
  count: number
  sessions: Set<string>
  firstSeen: number
  lastSeen: number
}

export interface Checkpoint {
  site: string
  lastT: number       // highest `t` processed so far
}
