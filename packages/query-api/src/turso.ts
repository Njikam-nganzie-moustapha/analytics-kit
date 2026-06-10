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
  release: string | null
  breadcrumbs: string | null      // raw JSON string
  count: number
  sessions: number
  firstSeen: number
  lastSeen: number
  // from error_states JOIN
  status: string
  assignee: string | null
  note: string | null
}

export interface CronMonitorRow {
  monitorId: string
  site: string
  intervalMs: number
  graceMs: number
  lastCheckin: number | null
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
    opts: { from?: number; to?: number; limit?: number; status?: string } = {},
  ): Promise<ErrorGroupRow[]> {
    const conds = ['eg.site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from   !== undefined) { conds.push('eg.last_seen >= ?');   args.push(int(opts.from)) }
    if (opts.to     !== undefined) { conds.push('eg.first_seen <= ?');  args.push(int(opts.to))   }
    if (opts.status !== undefined) { conds.push('COALESCE(es.status, \'open\') = ?'); args.push(str(opts.status)) }

    const limit = Math.min(opts.limit ?? 100, 500)
    const sql = `SELECT
                   eg.fingerprint, eg.site, eg.message, eg.event_type,
                   eg.source, eg.stack, eg.release, eg.breadcrumbs,
                   eg.count, eg.sessions, eg.first_seen, eg.last_seen,
                   COALESCE(es.status, 'open') AS status,
                   es.assignee, es.note
                 FROM error_groups eg
                 LEFT JOIN error_states es
                   ON es.site = eg.site AND es.fingerprint = eg.fingerprint
                 WHERE ${conds.join(' AND ')}
                 ORDER BY eg.count DESC
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
      release:     r.release ?? null,
      breadcrumbs: r.breadcrumbs ?? null,
      count:       parseInt(r.count!),
      sessions:    parseInt(r.sessions!),
      firstSeen:   parseInt(r.first_seen!),
      lastSeen:    parseInt(r.last_seen!),
      status:      r.status ?? 'open',
      assignee:    r.assignee ?? null,
      note:        r.note ?? null,
    }))
  }

  async updateErrorState(
    site: string,
    fingerprint: string,
    update: { status?: string; assignee?: string; note?: string },
  ): Promise<void> {
    const now = int(Date.now())
    const nullArg: TursoArg = { type: 'null', value: null }

    // Build dynamic SET clause for ON CONFLICT branch
    const setClauses: string[] = ['updated_at = ?']
    const setArgs: TursoArg[]  = [now]
    if (update.status   !== undefined) { setClauses.push('status = ?');   setArgs.push(str(update.status)) }
    if (update.assignee !== undefined) { setClauses.push('assignee = ?'); setArgs.push(str(update.assignee)) }
    if (update.note     !== undefined) { setClauses.push('note = ?');     setArgs.push(str(update.note)) }

    // INSERT args (positional): site, fingerprint, status, assignee, note, updated_at
    const insertArgs: TursoArg[] = [
      str(site), str(fingerprint),
      str(update.status ?? 'open'),
      update.assignee !== undefined ? str(update.assignee) : nullArg,
      update.note     !== undefined ? str(update.note)     : nullArg,
      now,
    ]

    await this._execute(
      `INSERT INTO error_states (site, fingerprint, status, assignee, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (site, fingerprint) DO UPDATE SET ${setClauses.join(', ')}`,
      [...insertArgs, ...setArgs],
    )
  }

  // ── CRON monitors ─────────────────────────────────────────────────────────────

  async upsertCronCheckin(monitorId: string, site: string, intervalMs: number, graceMs: number): Promise<void> {
    await this._execute(
      `INSERT INTO cron_monitors (monitor_id, site, interval_ms, grace_ms, last_checkin)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (monitor_id) DO UPDATE SET
         last_checkin = excluded.last_checkin,
         interval_ms  = excluded.interval_ms,
         grace_ms     = excluded.grace_ms`,
      [str(monitorId), str(site), int(intervalMs), int(graceMs), int(Date.now())],
    )
  }

  async getCronMonitors(site: string): Promise<CronMonitorRow[]> {
    const rows = await this._query(
      'SELECT monitor_id, site, interval_ms, grace_ms, last_checkin FROM cron_monitors WHERE site = ?',
      [str(site)],
    )
    return rows.map(r => ({
      monitorId:   r.monitor_id!,
      site:        r.site!,
      intervalMs:  parseInt(r.interval_ms!),
      graceMs:     parseInt(r.grace_ms!),
      lastCheckin: r.last_checkin != null ? parseInt(r.last_checkin) : null,
    }))
  }

  async deleteCronMonitor(monitorId: string, site: string): Promise<void> {
    await this._execute(
      'DELETE FROM cron_monitors WHERE monitor_id = ? AND site = ?',
      [str(monitorId), str(site)],
    )
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
        return [(outer.payload ?? outer) as ReplayEvent]
      } catch { return [] }
    })
  }

  // ── Schema (idempotent) ───────────────────────────────────────────────────────

  async ensureSchema(): Promise<void> {
    const stmts: TursoReq[] = [
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS error_states (
          site        TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          status      TEXT NOT NULL DEFAULT 'open',
          assignee    TEXT,
          note        TEXT,
          updated_at  INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, fingerprint)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS cron_monitors (
          monitor_id   TEXT NOT NULL,
          site         TEXT NOT NULL,
          interval_ms  INTEGER NOT NULL DEFAULT 300000,
          grace_ms     INTEGER NOT NULL DEFAULT 60000,
          last_checkin INTEGER,
          PRIMARY KEY (monitor_id)
        )` }},
      { type: 'close' },
    ]
    await this._pipeline(stmts)

    // Migrations for error_groups columns that may not exist yet
    for (const col of ['release TEXT', 'breadcrumbs TEXT']) {
      await this._pipeline([
        { type: 'execute', stmt: { sql: `ALTER TABLE error_groups ADD COLUMN ${col}` } },
        { type: 'close' },
      ]).catch(() => { /* column already exists */ })
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private async _execute(sql: string, args: TursoArg[]): Promise<void> {
    await this._pipeline([{ type: 'execute', stmt: { sql, args } }, { type: 'close' }])
  }

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

  private async _pipeline(requests: TursoReq[]): Promise<unknown[]> {
    const res = await fetch(`${this.url}/v2/pipeline`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ requests }),
    })
    if (!res.ok) throw new Error(`Turso ${res.status}: ${await res.text()}`)
    const data = await res.json() as { results: unknown[] }
    return data.results
  }
}
