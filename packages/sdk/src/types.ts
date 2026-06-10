export type EventType =
  | 'page_view'
  | 'mouse_move'
  | 'zone_enter'
  | 'zone_leave'
  | 'click'
  | 'scroll'
  | 'js_error'
  | 'network_error'
  | 'lcp' | 'fcp' | 'fid' | 'cls' | 'ttfb' | 'long_task'
  | 'rage_click'
  | 'dead_click'
  | 'session_start'
  | 'session_end'
  | 'rrweb_chunk'
  | 'identify'
  | 'custom'
  | 'transaction'

export interface AnalyticsEvent {
  t: number        // timestamp ms depuis epoch
  type: EventType
  sid: string      // session id
  site: string     // siteId
  uid?: string     // user id optionnel
  [key: string]: unknown
}

export interface ZoneDef {
  id: string
  selector?: string
  bbox?: {
    x: number
    y: number
    w: number
    h: number
    unit?: 'px' | 'pct'
  }
}

export interface UserContext {
  id?:    string
  email?: string
  name?:  string
  [key: string]: unknown
}

export interface TrackerConfig {
  siteId: string
  collectorUrl: string
  env?: string              // 'production' | 'staging' | 'development' — default: 'production'
  zones?: ZoneDef[]
  userId?: string
  userContext?: UserContext
  release?: string          // version deployée, ex: "1.4.2" ou commit SHA
  replay?: boolean          // default: true
  compress?: boolean        // default: true
  flushInterval?: number    // ms, default: 2000
  maxBatchSize?: number     // default: 50
  sampleRate?: number       // 0-1, default: 1 (100% sessions)
  debug?: boolean
  blockClass?: string       // CSS class pour masquer elements du replay
  tracing?: boolean         // default: true — auto page load + SPA navigation transactions
}

export type PushFn = (partial: Omit<AnalyticsEvent, 't' | 'sid' | 'site' | 'uid'>) => void
