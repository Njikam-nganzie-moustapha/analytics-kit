import type { HeatmapCell, ZoneStat, SessionStat, RawEvent } from './types'

type TursoArg = { type: 'text' | 'integer' | 'real' | 'null'; value: string | null }
type TursoReq = { type: 'execute'; stmt: { sql: string; args?: TursoArg[] } } | { type: 'close' }

function int(v: number): TursoArg   { return { type: 'integer', value: String(v) } }
function str(v: string): TursoArg   { return { type: 'text',    value: v } }
function real(v: number): TursoArg  { return { type: 'real',    value: String(v) } }
function nullable(v: string | undefined): TursoArg {
  return v ? { type: 'text', value: v } : { type: 'null', value: null }
}

export class ProcessorTurso {
  constructor(private readonly url: string, private readonly token: string) {}

  // ── Raw events ──────────────────────────────────────────────────────────────

  async fetchEventsSince(site: string, fromT: number, limit = 5_000): Promise<RawEvent[]> {
    const sql = `SELECT payload FROM analytics_events WHERE site = ? AND t > ? ORDER BY t ASC LIMIT ?`
    const res = await this._pipeline([
      { type: 'execute', stmt: { sql, args: [str(site), int(fromT), int(limit)] } },
      { type: 'close' },
    ])
    return this._payloadRows(res[0])
  }

  async fetchDistinctSites(): Promise<string[]> {
    const res = await this._pipeline([
      { type: 'execute', stmt: { sql: 'SELECT DISTINCT site FROM analytics_events' } },
      { type: 'close' },
    ])
    return this._scalarRows<string>(res[0], 'site')
  }

  // ── Heatmap ──────────────────────────────────────────────────────────────────

  async upsertHeatmapCells(cells: HeatmapCell[]): Promise<void> {
    if (cells.length === 0) return
    const stmts: Extract<TursoReq, { type: 'execute' }>[] =cells.map(c => ({
      type: 'execute',
      stmt: {
        sql: `INSERT INTO heatmap_cells (site, url, gx, gy, count, updated)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (site, url, gx, gy) DO UPDATE SET
                count   = count + excluded.count,
                updated = excluded.updated`,
        args: [str(c.site), str(c.url), int(c.gx), int(c.gy), int(c.count), int(Date.now())],
      },
    }))
    await this._batchedUpsert(stmts)
  }

  // ── Zone stats ───────────────────────────────────────────────────────────────

  async upsertZoneStats(stats: ZoneStat[]): Promise<void> {
    if (stats.length === 0) return
    const stmts: Extract<TursoReq, { type: 'execute' }>[] =stats.map(s => ({
      type: 'execute',
      stmt: {
        sql: `INSERT INTO zone_stats (site, zone_id, url, enters, clicks, avg_dwell, updated)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (site, zone_id, url) DO UPDATE SET
                enters    = enters + excluded.enters,
                clicks    = clicks + excluded.clicks,
                avg_dwell = CASE WHEN (enters + excluded.enters) > 0
                              THEN (avg_dwell * enters + excluded.avg_dwell * excluded.enters) / (enters + excluded.enters)
                              ELSE 0 END,
                updated   = excluded.updated`,
        args: [
          str(s.site), str(s.zoneId), str(s.url),
          int(s.enters), int(s.clicks),
          real(s.samples > 0 ? s.totalDwell / s.samples : 0),
          int(Date.now()),
        ],
      },
    }))
    await this._batchedUpsert(stmts)
  }

  // ── Sessions ─────────────────────────────────────────────────────────────────

  async upsertSessions(stats: SessionStat[]): Promise<void> {
    if (stats.length === 0) return
    const stmts: Extract<TursoReq, { type: 'execute' }>[] =stats.map(s => ({
      type: 'execute',
      stmt: {
        sql: `INSERT INTO sessions (sid, site, uid, started, ended, duration, url_count, event_count, has_replay)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT (sid) DO UPDATE SET
                ended       = MAX(ended, excluded.ended),
                duration    = MAX(duration, excluded.duration),
                url_count   = MAX(url_count, excluded.url_count),
                event_count = MAX(event_count, excluded.event_count),
                has_replay  = MAX(has_replay, excluded.has_replay)`,
        args: [
          str(s.sid), str(s.site), nullable(s.uid),
          int(s.started), int(s.ended), int(s.duration),
          int(s.urlCount), int(s.eventCount), int(s.hasReplay ? 1 : 0),
        ],
      },
    }))
    await this._batchedUpsert(stmts)
  }

  // ── Checkpoints ──────────────────────────────────────────────────────────────

  async getCheckpoint(site: string): Promise<number> {
    const res = await this._pipeline([
      { type: 'execute', stmt: {
        sql: 'SELECT last_t FROM processor_checkpoints WHERE site = ?',
        args: [str(site)],
      }},
      { type: 'close' },
    ])
    const rows = this._scalarRows<string>(res[0], 'last_t')
    return rows.length > 0 ? parseInt(rows[0]) : 0
  }

  async saveCheckpoint(site: string, lastT: number): Promise<void> {
    await this._pipeline([
      { type: 'execute', stmt: {
        sql: `INSERT INTO processor_checkpoints (site, last_t) VALUES (?, ?)
              ON CONFLICT (site) DO UPDATE SET last_t = excluded.last_t`,
        args: [str(site), int(lastT)],
      }},
      { type: 'close' },
    ])
  }

  async ensureSchema(): Promise<void> {
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS processor_checkpoints (
        site   TEXT PRIMARY KEY,
        last_t INTEGER NOT NULL DEFAULT 0
      )` }},
      { type: 'close' },
    ])
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  // Chunk execute-stmts into batches so a single pipeline call never exceeds ~100 stmts
  private async _batchedUpsert(stmts: Extract<TursoReq, { type: 'execute' }>[], batchSize = 100): Promise<void> {
    for (let i = 0; i < stmts.length; i += batchSize) {
      const batch: TursoReq[] = [...stmts.slice(i, i + batchSize), { type: 'close' }]
      await this._pipeline(batch)
    }
  }

  private async _pipeline(requests: TursoReq[]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/v2/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    })
    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`)
    const data = await res.json() as { results: unknown[] }
    return data.results
  }

  private _payloadRows(result: unknown): RawEvent[] {
    const r = result as { response?: { result?: { rows: { value?: unknown }[][] } } }
    return (r?.response?.result?.rows ?? []).flatMap(row => {
      const v = row[0]?.value
      if (typeof v !== 'string') return []
      try { return [JSON.parse(v) as RawEvent] } catch { return [] }
    })
  }

  private _scalarRows<T>(result: unknown, col: string): T[] {
    const r = result as { response?: { result?: { cols: { name: string }[]; rows: { value?: unknown }[][] } } }
    const cols = r?.response?.result?.cols ?? []
    const rows = r?.response?.result?.rows ?? []
    const idx = cols.findIndex(c => c.name === col)
    if (idx === -1) return []
    return rows.map(row => row[idx]?.value as T).filter(Boolean)
  }
}
