export interface GeoInfo {
  country?: string | null
  city?: string | null
  region?: string | null
}

export interface AnalyticsEvent {
  t: number
  type: string
  sid: string
  site: string
  uid?: string
  geo?: GeoInfo
  [key: string]: unknown
}

export interface StorageAdapter {
  write(events: AnalyticsEvent[]): Promise<void>
  query?(params: QueryParams): Promise<AnalyticsEvent[]>
  init?(): Promise<void>
  close?(): Promise<void>
}

export interface QueryParams {
  siteId: string
  from?: number
  to?: number
  type?: string
  sessionId?: string
  limit?: number
}

// Turso HTTP API types
export type TursoArgType = 'text' | 'integer' | 'real' | 'null'
export interface TursoArg { type: TursoArgType; value: string | null }
export interface TursoStmt { sql: string; args?: TursoArg[] }
export type TursoRequest =
  | { type: 'execute'; stmt: TursoStmt }
  | { type: 'close' }
