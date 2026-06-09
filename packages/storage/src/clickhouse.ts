import type { AnalyticsEvent, StorageAdapter, QueryParams } from './types'

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS analytics_events
(
    t       DateTime64(3, 'UTC'),
    type    LowCardinality(String),
    sid     String,
    site    LowCardinality(String),
    uid     Nullable(String),
    payload String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(t)
ORDER BY (site, t, type)
SETTINGS index_granularity = 8192
`

export interface ClickHouseConfig {
  url:       string   // e.g. 'http://localhost:8123'
  database?: string   // default: 'analytics'
  user?:     string   // default: 'default'
  password?: string   // default: ''
}

function toClickHouseTs(epochMs: number): string {
  return new Date(epochMs).toISOString().replace('T', ' ').slice(0, 23)
}

export class ClickHouseAdapter implements StorageAdapter {
  private readonly db: string

  constructor(private readonly cfg: ClickHouseConfig) {
    this.db = cfg.database ?? 'analytics'
  }

  async init(): Promise<void> {
    // CREATE DATABASE may fail if running as non-admin user — that's OK
    await this._exec(`CREATE DATABASE IF NOT EXISTS ${this.db}`, '').catch(() => {})
    await this._exec(CREATE_TABLE, this.db)
  }

  async write(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return

    const ndjson = events.map(e => JSON.stringify({
      t:       toClickHouseTs(e.t),
      type:    String(e.type),
      sid:     String(e.sid),
      site:    String(e.site),
      uid:     e.uid ?? null,
      payload: JSON.stringify(e),
    })).join('\n')

    const query = 'INSERT INTO analytics_events FORMAT JSONEachRow'
    const url   = `${this.cfg.url}/?database=${this.db}&query=${encodeURIComponent(query)}`
    const res   = await fetch(url, { method: 'POST', headers: this._hdrs(), body: ndjson })
    if (!res.ok) throw new Error(`ClickHouse write ${res.status}: ${await res.text()}`)
  }

  async query(params: QueryParams): Promise<AnalyticsEvent[]> {
    // Build parameterised WHERE — ClickHouse named params: {name:type}
    const conds: string[] = []
    const qp = new URLSearchParams({ database: this.db })

    qp.set('param_site', params.siteId)
    conds.push('site = {site:String}')

    if (params.from !== undefined) {
      conds.push('t >= fromUnixTimestamp64Milli({from:Int64})')
      qp.set('param_from', String(params.from))
    }
    if (params.to !== undefined) {
      conds.push('t <= fromUnixTimestamp64Milli({to:Int64})')
      qp.set('param_to', String(params.to))
    }
    if (params.type) {
      conds.push('type = {evtype:String}')
      qp.set('param_evtype', params.type)
    }
    if (params.sessionId) {
      conds.push('sid = {sid:String}')
      qp.set('param_sid', params.sessionId)
    }

    const limit = Math.min(params.limit ?? 1000, 10_000)
    const sql = `SELECT payload FROM analytics_events WHERE ${conds.join(' AND ')} ORDER BY t ASC LIMIT {lim:UInt32} FORMAT JSONEachRow`
    qp.set('param_lim', String(limit))
    qp.set('query', sql)

    const res  = await fetch(`${this.cfg.url}/?${qp}`, { headers: this._hdrs() })
    if (!res.ok) throw new Error(`ClickHouse query ${res.status}: ${await res.text()}`)

    return (await res.text())
      .split('\n')
      .filter((l: string) => l.trim())
      .flatMap((line: string) => {
        try {
          const row = JSON.parse(line) as { payload: string }
          return [JSON.parse(row.payload) as AnalyticsEvent]
        } catch { return [] }
      })
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private _hdrs(): Record<string, string> {
    return {
      'X-ClickHouse-User': this.cfg.user     ?? 'default',
      'X-ClickHouse-Key':  this.cfg.password ?? '',
    }
  }

  private async _exec(sql: string, database: string): Promise<void> {
    const url = database
      ? `${this.cfg.url}/?database=${database}`
      : `${this.cfg.url}/`
    const res = await fetch(url, { method: 'POST', headers: this._hdrs(), body: sql })
    if (!res.ok) throw new Error(`ClickHouse ${res.status}: ${await res.text()}`)
  }
}
