type TursoArg = { type: 'text' | 'integer' | 'real' | 'null'; value: string | null }
type TursoReq =
  | { type: 'execute'; stmt: { sql: string; args?: TursoArg[] } }
  | { type: 'close' }

const int = (v: number): TursoArg => ({ type: 'integer', value: String(v) })
const str = (v: string): TursoArg => ({ type: 'text',    value: v })

function toRows(result: unknown): Record<string, string | null>[] {
  const r = result as {
    response?: {
      result?: {
        cols: { name: string }[]
        rows: ({ value?: string | null })[][]
      }
    }
  }
  const cols = r?.response?.result?.cols ?? []
  const rows = r?.response?.result?.rows ?? []
  return rows.map(row =>
    Object.fromEntries(cols.map((c, i) => [c.name, row[i]?.value ?? null]))
  )
}

// ── Public row types ──────────────────────────────────────────────────────────

export interface HeatmapRow {
  site: string; url: string; gx: number; gy: number; count: number
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

export interface ReplayEvent { t: number; type: string; [k: string]: unknown }

export interface ErrorGroupRow {
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

// ── Client ────────────────────────────────────────────────────────────────────

export class QueryTurso {
  constructor(private readonly url: string, private readonly token: string) {}

  async getHeatmapCells(site: string, url?: string): Promise<HeatmapRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (url !== undefined) { conds.push('url = ?'); args.push(str(url)) }

    const sql = `SELECT site, url, gx, gy, count
                 FROM heatmap_cells
                 WHERE ${conds.join(' AND ')}
                 ORDER BY count DESC`
    const rows = await this._query(sql, args)
    return rows.map(r => ({
      site: r.site!, url: r.url!,
      gx: parseInt(r.gx!), gy: parseInt(r.gy!), count: parseInt(r.count!),
    }))
  }

  async getZoneStats(site: string, url?: string): Promise<ZoneRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (url !== undefined) { conds.push('url = ?'); args.push(str(url)) }

    const sql = `SELECT site, zone_id, url, enters, clicks, avg_dwell
                 FROM zone_stats
                 WHERE ${conds.join(' AND ')}
                 ORDER BY enters DESC`
    const rows = await this._query(sql, args)
    return rows.map(r => ({
      site: r.site!, zoneId: r.zone_id!, url: r.url!,
      enters: parseInt(r.enters!), clicks: parseInt(r.clicks!),
      avgDwell: parseFloat(r.avg_dwell ?? '0'),
    }))
  }

  async getSessions(
    site: string,
    opts: { from?: number; to?: number; limit?: number; hasReplay?: boolean } = {},
  ): Promise<SessionRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from !== undefined)  { conds.push('started >= ?'); args.push(int(opts.from)) }
    if (opts.to   !== undefined)  { conds.push('started <= ?'); args.push(int(opts.to))   }
    if (opts.hasReplay)           { conds.push('has_replay = 1')                           }

    const limit = Math.min(opts.limit ?? 100, 500)
    const sql = `SELECT sid, site, uid, started, ended, duration, url_count, event_count, has_replay
                 FROM sessions
                 WHERE ${conds.join(' AND ')}
                 ORDER BY started DESC
                 LIMIT ?`
    args.push(int(limit))

    const rows = await this._query(sql, args)
    return rows.map(r => ({
      sid: r.sid!, site: r.site!, uid: r.uid ?? null,
      started: parseInt(r.started!), ended: parseInt(r.ended!), duration: parseInt(r.duration!),
      urlCount: parseInt(r.url_count!), eventCount: parseInt(r.event_count!),
      hasReplay: r.has_replay === '1',
    }))
  }

  async getErrorGroups(
    site: string,
    opts: { from?: number; to?: number; limit?: number } = {},
  ): Promise<ErrorGroupRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from !== undefined) { conds.push('last_seen >= ?'); args.push(int(opts.from)) }
    if (opts.to   !== undefined) { conds.push('first_seen <= ?'); args.push(int(opts.to))  }

    const limit = Math.min(opts.limit ?? 100, 500)
    const sql = `SELECT fingerprint, site, message, event_type, source, stack,
                        count, sessions, first_seen, last_seen
                 FROM error_groups
                 WHERE ${conds.join(' AND ')}
                 ORDER BY count DESC
                 LIMIT ?`
    args.push(int(limit))

    const rows = await this._query(sql, args)
    return rows.map(r => ({
      fingerprint: r.fingerprint!,
      site:        r.site!,
      message:     r.message!,
      eventType:   r.event_type!,
      source:      r.source ?? null,
      stack:       r.stack  ?? null,
      count:       parseInt(r.count!),
      sessions:    parseInt(r.sessions!),
      firstSeen:   parseInt(r.first_seen!),
      lastSeen:    parseInt(r.last_seen!),
    }))
  }

  async getReplayEvents(sid: string): Promise<ReplayEvent[]> {
    const sql = `SELECT payload
                 FROM analytics_events
                 WHERE sid = ? AND type LIKE 'rrweb%'
                 ORDER BY t ASC
                 LIMIT 10000`
    const rows = await this._query(sql, [str(sid)])
    return rows.flatMap(r => {
      if (!r.payload) return []
      try {
        const outer = JSON.parse(r.payload) as Record<string, unknown>
        // Unwrap inner rrweb event from analytics envelope { type:'rrweb_chunk', payload: <rrweb_event> }
        return [(outer.payload ?? outer) as ReplayEvent]
      } catch { return [] }
    })
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _query(sql: string, args: TursoArg[]): Promise<Record<string, string | null>[]> {
    const reqs: TursoReq[] = [{ type: 'execute', stmt: { sql, args } }, { type: 'close' }]
    const res = await fetch(`${this.url}/v2/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ requests: reqs }),
    })
    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`)
    const data = await res.json() as { results: unknown[] }
    return toRows(data.results[0])
  }
}
