import type { StorageAdapter, QueryParams, AnalyticsEvent, TursoRequest, TursoArg } from './types'

interface TursoConfig { url: string; token: string }

const BATCH = 50

export class TursoAdapter implements StorageAdapter {
  constructor(private readonly cfg: TursoConfig) {}

  async init(): Promise<void> {
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS analytics_events (
        id      INTEGER PRIMARY KEY AUTOINCREMENT,
        t       INTEGER NOT NULL,
        type    TEXT    NOT NULL,
        sid     TEXT    NOT NULL,
        site    TEXT    NOT NULL,
        uid     TEXT,
        payload TEXT    NOT NULL
      )` } },
      { type: 'execute', stmt: { sql: 'CREATE INDEX IF NOT EXISTS idx_ae_site_t ON analytics_events (site, t DESC)' } },
      { type: 'execute', stmt: { sql: 'CREATE INDEX IF NOT EXISTS idx_ae_sid    ON analytics_events (sid)' } },
      { type: 'execute', stmt: { sql: 'CREATE INDEX IF NOT EXISTS idx_ae_type   ON analytics_events (site, type, t DESC)' } },
      { type: 'close' },
    ])
  }

  async write(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return
    for (let i = 0; i < events.length; i += BATCH) {
      await this._insertBatch(events.slice(i, i + BATCH))
    }
  }

  async query(params: QueryParams): Promise<AnalyticsEvent[]> {
    const where: string[] = ['site = ?']
    const args: TursoArg[] = [{ type: 'text', value: params.siteId }]

    if (params.from)      { where.push('t >= ?'); args.push({ type: 'integer', value: String(params.from) }) }
    if (params.to)        { where.push('t <= ?'); args.push({ type: 'integer', value: String(params.to) }) }
    if (params.type)      { where.push('type = ?'); args.push({ type: 'text', value: params.type }) }
    if (params.sessionId) { where.push('sid = ?'); args.push({ type: 'text', value: params.sessionId }) }
    args.push({ type: 'integer', value: String(params.limit ?? 1000) })

    const sql = `SELECT payload FROM analytics_events WHERE ${where.join(' AND ')} ORDER BY t DESC LIMIT ?`
    const results = await this._pipeline([{ type: 'execute', stmt: { sql, args } }, { type: 'close' }])
    return this._toRows(results[0])
  }

  close(): Promise<void> { return Promise.resolve() }

  private async _insertBatch(events: AnalyticsEvent[]): Promise<void> {
    const stmts: TursoRequest[] = events.map(e => ({
      type: 'execute',
      stmt: {
        sql: 'INSERT OR IGNORE INTO analytics_events (t, type, sid, site, uid, payload) VALUES (?, ?, ?, ?, ?, ?)',
        args: [
          { type: 'integer', value: String(e.t) },
          { type: 'text',    value: e.type },
          { type: 'text',    value: e.sid },
          { type: 'text',    value: e.site },
          { type: e.uid ? 'text' : 'null', value: e.uid ? String(e.uid) : null },
          { type: 'text',    value: JSON.stringify(e) },
        ] as TursoArg[],
      },
    }))
    stmts.push({ type: 'close' })
    await this._pipeline(stmts)
  }

  private async _pipeline(requests: TursoRequest[]): Promise<unknown[]> {
    const res = await fetch(`${this.cfg.url}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`)
    const data = await res.json() as { results: unknown[] }
    return data.results
  }

  private _toRows(result: unknown): AnalyticsEvent[] {
    const r = result as { response?: { result?: { cols: { name: string }[]; rows: { value?: unknown }[][] } } }
    const rows = r?.response?.result?.rows ?? []
    return rows.flatMap(row => {
      const payload = row[0]?.value
      if (typeof payload !== 'string') return []
      try { return [JSON.parse(payload) as AnalyticsEvent] } catch { return [] }
    })
  }
}
