type TursoArg = { type: 'text' | 'integer' | 'real' | 'null'; value: string | null }
type TursoReq =
  | { type: 'execute'; stmt: { sql: string; args?: TursoArg[] } }
  | { type: 'close' }

const int = (v: number): TursoArg => ({ type: 'integer', value: String(v) })
const str = (v: string): TursoArg => ({ type: 'text',    value: v })

// Parse "2024-01-15:12,2024-01-14:3" into [0,0,...,3,12] (14 slots, ascending by date)
function parseDailyStats(raw: string): number[] {
  const slots = new Array<number>(14).fill(0)
  if (!raw) return slots
  const today = new Date().toISOString().slice(0, 10)
  for (const part of raw.split(',')) {
    const idx = part.indexOf(':')
    if (idx < 0) continue
    const date  = part.slice(0, idx)
    const count = parseInt(part.slice(idx + 1)) || 0
    const daysAgo = Math.round((Date.parse(today) - Date.parse(date)) / 86400_000)
    const slot    = 13 - daysAgo
    if (slot >= 0 && slot < 14) slots[slot] = count
  }
  return slots
}

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
  userSample: string | null       // raw JSON string {id,email,name}
  recentCounts: number[]          // last 14 days, index 0 = 13 days ago, 13 = today
  count: number
  sessions: number
  firstSeen: number
  lastSeen: number
  // from error_states JOIN
  status: string
  assignee: string | null
  note: string | null
}

export interface ErrorOccurrence {
  ts:      number
  url:     string | null
  stack:   string | null
  user:    string | null
  sid:     string | null
  release: string | null
}

export interface VitalRow {
  site:     string
  url:      string
  metric:   string
  good:     number
  needsImp: number
  poor:     number
  avg:      number
  total:    number
}

export interface SourceMapMeta {
  site:        string
  release:     string
  filename:    string
  size:        number
  uploadedAt:  number
}

export interface CronMonitorRow {
  monitorId: string
  site: string
  intervalMs: number
  graceMs: number
  lastCheckin: number | null
}

export interface ErrorActivityRow {
  id: number
  site: string
  fingerprint: string
  action: string
  actor: string | null
  ts: number
}

export interface ReleaseRow {
  release: string
  site: string
  groups: number
  events: number
  lastSeen: number
}

export interface PagePerfRow {
  site:  string
  url:   string
  count: number
  avg:   number
  min:   number
  max:   number
  p50:   number
  p75:   number
  p95:   number
}

export interface AlertChannelRow {
  site:             string
  telegramToken:    string | null
  telegramChatId:   string | null
  slackWebhookUrl:  string | null
  updated:          number
}

export interface AlertRuleRow {
  site:       string
  ruleType:   string
  enabled:    boolean
  threshold:  number
  cooldownMs: number
  updated:    number
}

export interface FeedbackRow {
  id:      number
  site:    string
  sid:     string
  uid:     string | null
  name:    string | null
  email:   string | null
  message: string
  url:     string | null
  ts:      number
}

export interface TrafficSourceRow {
  site: string; channel: string; referrerHost: string
  utmSource: string; utmMedium: string; utmCampaign: string
  sessions: number; lastSeen: number
}

export interface GeoStatRow {
  site: string; country: string; city: string; sessions: number
}

export interface DeviceStatRow {
  site: string; deviceType: string; browser: string; os: string; sessions: number
}

export interface ConversionStatRow {
  site: string; kind: string; url: string; count: number; lastSeen: number
}

export interface OverviewSummary {
  site: string
  sessions: number
  users: number
  errorSessions: number
  errorRate: number          // 0–100
  conversions: number
  vitalsGoodPct: number      // 0–100
  perfP75: number            // ms
  health: number             // 0–100
  series: { day: number; sessions: number; errors: number }[]
}

export interface SiteTotal { site: string; sessions: number; lastSeen: number }

export interface FunnelStep { label: string; type: 'url' | 'event'; match: string }
export interface FunnelDef { id: string; site: string; name: string; steps: FunnelStep[]; updated: number }
export interface FunnelResult { counts: number[]; total: number }

// ── Client ────────────────────────────────────────────────────────────────────

export class QueryTurso {
  constructor(private readonly url: string, private readonly token: string) {}

  async getAvailableSites(): Promise<string[]> {
    const rows = await this._query('SELECT DISTINCT site FROM analytics_events ORDER BY site', [])
    return rows.map(r => r.site).filter((s): s is string => s !== null)
  }

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
    opts: { from?: number; to?: number; limit?: number; hasReplay?: boolean; hasError?: boolean; urlContains?: string } = {},
  ): Promise<SessionRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from !== undefined)    { conds.push('started >= ?');          args.push(int(opts.from)) }
    if (opts.to   !== undefined)    { conds.push('started <= ?');          args.push(int(opts.to))   }
    if (opts.hasReplay)             { conds.push('has_replay = 1')                                   }
    if (opts.hasError)              { conds.push('has_error = 1')                                    }
    if (opts.urlContains)           { conds.push('url_sample LIKE ?');     args.push(str(`%${opts.urlContains.replace(/%/g, '\\%')}%`)) }

    const limit = Math.min(opts.limit ?? 100, 500)
    const sql = `SELECT sid, site, uid, started, ended, duration, url_count, event_count, has_replay, COALESCE(has_error, 0) AS has_error
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
      hasError:  r.has_error === '1',
    }))
  }

  async getErrorGroups(
    site: string,
    opts: { from?: number; to?: number; limit?: number; status?: string; query?: string } = {},
  ): Promise<ErrorGroupRow[]> {
    const conds = ['eg.site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from   !== undefined) { conds.push('eg.last_seen >= ?');   args.push(int(opts.from)) }
    if (opts.to     !== undefined) { conds.push('eg.first_seen <= ?');  args.push(int(opts.to))   }
    if (opts.status !== undefined) { conds.push("COALESCE(es.status, 'open') = ?"); args.push(str(opts.status)) }
    if (opts.query)                { conds.push('eg.message LIKE ?');   args.push(str(`%${opts.query.replace(/%/g, '\\%').slice(0, 80)}%`)) }

    const limit = Math.min(opts.limit ?? 100, 500)
    const sql = `SELECT
                   eg.fingerprint, eg.site, eg.message, eg.event_type,
                   eg.source, eg.stack, eg.release, eg.breadcrumbs, eg.user_sample,
                   eg.count, eg.sessions, eg.first_seen, eg.last_seen,
                   COALESCE(es.status, 'open') AS status,
                   es.assignee, es.note,
                   (SELECT GROUP_CONCAT(d.date || ':' || d.count, ',')
                    FROM (SELECT date, count FROM error_daily_stats
                          WHERE site = eg.site AND fingerprint = eg.fingerprint
                          ORDER BY date DESC LIMIT 14) d) AS daily_stats
                 FROM error_groups eg
                 LEFT JOIN error_states es
                   ON es.site = eg.site AND es.fingerprint = eg.fingerprint
                 WHERE ${conds.join(' AND ')}
                 ORDER BY eg.last_seen DESC
                 LIMIT ?`
    args.push(int(limit))

    const rows = await this._query(sql, args)
    return rows.map(r => ({
      fingerprint:  r.fingerprint!,
      site:         r.site!,
      message:      r.message!,
      eventType:    r.event_type!,
      source:       r.source ?? null,
      stack:        r.stack  ?? null,
      release:      r.release ?? null,
      breadcrumbs:  r.breadcrumbs ?? null,
      userSample:   r.user_sample ?? null,
      recentCounts: parseDailyStats(r.daily_stats ?? ''),
      count:        parseInt(r.count!),
      sessions:     parseInt(r.sessions!),
      firstSeen:    parseInt(r.first_seen!),
      lastSeen:     parseInt(r.last_seen!),
      status:       r.status ?? 'open',
      assignee:     r.assignee ?? null,
      note:         r.note ?? null,
    }))
  }

  async getErrorEvents(site: string, fingerprint: string, limit = 25): Promise<ErrorOccurrence[]> {
    // Get the group's message + type for matching
    const meta = await this._query(
      'SELECT message, event_type FROM error_groups WHERE site = ? AND fingerprint = ?',
      [str(site), str(fingerprint)],
    )
    if (meta.length === 0) return []
    const msgHint = (meta[0].message ?? '').slice(0, 50).replace(/[%_[\]\\]/g, '\\$&')
    const evType  = meta[0].event_type ?? 'js_error'

    const rows = await this._query(
      `SELECT payload, t FROM analytics_events
       WHERE site = ? AND type = ? AND payload LIKE ?
       ORDER BY t DESC LIMIT ?`,
      [str(site), str(evType), str(`%${msgHint}%`), int(limit)],
    )

    return rows.flatMap(r => {
      if (!r.payload) return []
      try {
        const p = JSON.parse(r.payload) as Record<string, unknown>
        const inner = (typeof p.payload === 'object' && p.payload !== null ? p.payload : p) as Record<string, unknown>
        return [{
          ts:      parseInt(r.t ?? '0'),
          url:     typeof inner.url  === 'string' ? inner.url.slice(0, 200)  : null,
          stack:   typeof inner.stack === 'string' ? inner.stack.slice(0, 600) : null,
          user:    typeof p.uid === 'string' ? p.uid.slice(0, 80) : null,
          sid:     typeof p.sid === 'string' ? p.sid.slice(0, 50) : null,
          release: typeof p.release === 'string' ? p.release.slice(0, 80) : null,
        }]
      } catch { return [] }
    })
  }

  async updateErrorState(
    site: string,
    fingerprint: string,
    update: { status?: string; assignee?: string; note?: string },
    actor?: string,
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

    // Log activity entry
    const actions: string[] = []
    if (update.status   !== undefined) actions.push(`status → ${update.status}`)
    if (update.assignee !== undefined) actions.push(`assigned → ${update.assignee || 'unassigned'}`)
    if (update.note     !== undefined) actions.push('note updated')
    if (actions.length > 0) {
      await this.logErrorActivity(site, fingerprint, actions.join(', '), actor)
    }
  }

  async logErrorActivity(site: string, fingerprint: string, action: string, actor?: string): Promise<void> {
    const nullArg: TursoArg = { type: 'null', value: null }
    await this._execute(
      `INSERT INTO error_activity (site, fingerprint, action, actor, ts) VALUES (?, ?, ?, ?, ?)`,
      [str(site), str(fingerprint), str(action), actor ? str(actor) : nullArg, int(Date.now())],
    )
  }

  async getErrorActivity(site: string, fingerprint: string, limit = 50): Promise<ErrorActivityRow[]> {
    const rows = await this._query(
      `SELECT id, site, fingerprint, action, actor, ts FROM error_activity
       WHERE site = ? AND fingerprint = ? ORDER BY ts DESC LIMIT ?`,
      [str(site), str(fingerprint), int(limit)],
    )
    return rows.map(r => ({
      id:          parseInt(r.id ?? '0'),
      site:        r.site!,
      fingerprint: r.fingerprint!,
      action:      r.action!,
      actor:       r.actor ?? null,
      ts:          parseInt(r.ts ?? '0'),
    }))
  }

  async getPagePerf(site: string, url?: string): Promise<PagePerfRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (url !== undefined) { conds.push('url = ?'); args.push(str(url)) }

    const rows = await this._query(
      `SELECT site, url, count, sum_ms, min_ms, max_ms, p50, p75, p95
       FROM page_perf
       WHERE ${conds.join(' AND ')}
       ORDER BY p75 DESC
       LIMIT 200`,
      args,
    )
    return rows.map(r => ({
      site:  r.site!,
      url:   r.url!,
      count: parseInt(r.count ?? '0'),
      avg:   Math.round(parseFloat(r.sum_ms ?? '0') / (parseInt(r.count ?? '1') || 1)),
      min:   Math.round(parseFloat(r.min_ms ?? '0')),
      max:   Math.round(parseFloat(r.max_ms ?? '0')),
      p50:   Math.round(parseFloat(r.p50 ?? '0')),
      p75:   Math.round(parseFloat(r.p75 ?? '0')),
      p95:   Math.round(parseFloat(r.p95 ?? '0')),
    }))
  }

  async getReleases(site: string): Promise<ReleaseRow[]> {
    const rows = await this._query(
      `SELECT release, site, COUNT(*) as groups, SUM(count) as events, MAX(last_seen) as last_seen
       FROM error_groups
       WHERE site = ? AND release IS NOT NULL
       GROUP BY release
       ORDER BY last_seen DESC
       LIMIT 50`,
      [str(site)],
    )
    return rows.map(r => ({
      release:  r.release!,
      site:     r.site!,
      groups:   parseInt(r.groups ?? '0'),
      events:   parseInt(r.events ?? '0'),
      lastSeen: parseInt(r.last_seen ?? '0'),
    }))
  }

  // ── Vitals ───────────────────────────────────────────────────────────────────

  async getVitals(site: string, url?: string): Promise<VitalRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (url !== undefined) { conds.push('url = ?'); args.push(str(url)) }

    const sql = `SELECT site, url, metric, good, needs_imp, poor, sum_value, total
                 FROM vitals_summary
                 WHERE ${conds.join(' AND ')}
                 ORDER BY metric, url`
    const rows = await this._query(sql, args)
    return rows.map(r => {
      const total    = parseInt(r.total ?? '0') || 1
      const sumValue = parseFloat(r.sum_value ?? '0')
      return {
        site:     r.site!,
        url:      r.url!,
        metric:   r.metric!,
        good:     parseInt(r.good ?? '0'),
        needsImp: parseInt(r.needs_imp ?? '0'),
        poor:     parseInt(r.poor ?? '0'),
        avg:      Math.round(sumValue / total * 10) / 10,
        total,
      }
    })
  }

  // ── Source maps ───────────────────────────────────────────────────────────────

  async upsertSourceMap(site: string, release: string, filename: string, content: string): Promise<void> {
    await this._execute(
      `INSERT INTO sourcemaps (release, filename, site, content, size, uploaded_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (site, release, filename) DO UPDATE SET
         content = excluded.content,
         size    = excluded.size,
         uploaded_at = excluded.uploaded_at`,
      [str(release), str(filename), str(site), str(content), int(content.length), int(Date.now())],
    )
  }

  async listSourceMaps(site: string, release = ''): Promise<SourceMapMeta[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (release) { conds.push('release = ?'); args.push(str(release)) }

    const rows = await this._query(
      `SELECT site, release, filename, size, uploaded_at FROM sourcemaps WHERE ${conds.join(' AND ')} ORDER BY uploaded_at DESC`,
      args,
    )
    return rows.map(r => ({
      site:       r.site!,
      release:    r.release!,
      filename:   r.filename!,
      size:       parseInt(r.size ?? '0'),
      uploadedAt: parseInt(r.uploaded_at ?? '0'),
    }))
  }

  async deleteSourceMap(site: string, release: string, filename: string): Promise<void> {
    await this._execute(
      'DELETE FROM sourcemaps WHERE site = ? AND release = ? AND filename = ?',
      [str(site), str(release), str(filename)],
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

  // ── Session errors ────────────────────────────────────────────────────────────
  // Returns distinct error events that occurred during a session, ordered by time.
  async getSessionErrors(sid: string, site: string): Promise<{ type: string; msg: string; url: string | null; ts: number }[]> {
    const sql = `SELECT type, payload, t
                 FROM analytics_events
                 WHERE sid = ? AND site = ? AND type IN ('js_error', 'network_error')
                 ORDER BY t ASC
                 LIMIT 200`
    const rows = await this._query(sql, [str(sid), str(site)])
    return rows.flatMap(r => {
      if (!r.payload) return []
      try {
        const p = JSON.parse(r.payload) as Record<string, unknown>
        const inner = (p.payload ?? p) as Record<string, unknown>
        return [{
          type: String(r.type ?? inner.type ?? 'js_error'),
          msg:  String(inner.msg ?? inner.url ?? '').slice(0, 200),
          url:  typeof inner.url === 'string' ? inner.url.slice(0, 200) : null,
          ts:   parseInt(r.t ?? '0'),
        }]
      } catch { return [] }
    })
  }

  async getAlertRules(site: string): Promise<AlertRuleRow[]> {
    const rows = await this._query(
      `SELECT site, rule_type, enabled, threshold, cooldown_ms, updated
       FROM alert_rules WHERE site = ? ORDER BY rule_type`,
      [str(site)],
    )
    return rows.map(r => ({
      site:       r.site!,
      ruleType:   r.rule_type!,
      enabled:    r.enabled === '1',
      threshold:  parseInt(r.threshold   ?? '5'),
      cooldownMs: parseInt(r.cooldown_ms ?? '3600000'),
      updated:    parseInt(r.updated     ?? '0'),
    }))
  }

  async upsertAlertRule(
    site: string,
    ruleType: string,
    rule: { enabled: boolean; threshold: number; cooldownMs: number },
  ): Promise<void> {
    await this._execute(
      `INSERT INTO alert_rules (site, rule_type, enabled, threshold, cooldown_ms, updated)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (site, rule_type) DO UPDATE SET
         enabled     = excluded.enabled,
         threshold   = excluded.threshold,
         cooldown_ms = excluded.cooldown_ms,
         updated     = excluded.updated`,
      [str(site), str(ruleType), int(rule.enabled ? 1 : 0), int(rule.threshold), int(rule.cooldownMs), int(Date.now())],
    )
  }

  async getAlertChannels(site: string): Promise<AlertChannelRow | null> {
    const rows = await this._query(
      `SELECT site, telegram_token, telegram_chat_id, slack_webhook_url, updated
       FROM alert_channels WHERE site = ?`,
      [str(site)],
    )
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      site:            r.site!,
      telegramToken:   r.telegram_token    ?? null,
      telegramChatId:  r.telegram_chat_id  ?? null,
      slackWebhookUrl: r.slack_webhook_url ?? null,
      updated:         parseInt(r.updated ?? '0'),
    }
  }

  async upsertAlertChannels(
    site: string,
    channels: { telegramToken?: string | null; telegramChatId?: string | null; slackWebhookUrl?: string | null },
  ): Promise<void> {
    await this._execute(
      `INSERT INTO alert_channels (site, telegram_token, telegram_chat_id, slack_webhook_url, updated)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (site) DO UPDATE SET
         telegram_token    = COALESCE(excluded.telegram_token,    telegram_token),
         telegram_chat_id  = COALESCE(excluded.telegram_chat_id,  telegram_chat_id),
         slack_webhook_url = COALESCE(excluded.slack_webhook_url, slack_webhook_url),
         updated           = excluded.updated`,
      [
        str(site),
        channels.telegramToken    != null ? str(channels.telegramToken)    : { type: 'null', value: null },
        channels.telegramChatId   != null ? str(channels.telegramChatId)   : { type: 'null', value: null },
        channels.slackWebhookUrl  != null ? str(channels.slackWebhookUrl)  : { type: 'null', value: null },
        int(Date.now()),
      ],
    )
  }

  async clearAlertChannelField(site: string, field: 'telegram' | 'slack'): Promise<void> {
    const sql = field === 'telegram'
      ? `UPDATE alert_channels SET telegram_token = NULL, telegram_chat_id = NULL, updated = ? WHERE site = ?`
      : `UPDATE alert_channels SET slack_webhook_url = NULL, updated = ? WHERE site = ?`
    await this._execute(sql, [int(Date.now()), str(site)])
  }

  async getFeedback(
    site: string,
    opts: { from?: number; to?: number; limit?: number } = {},
  ): Promise<FeedbackRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (opts.from !== undefined) { conds.push('ts >= ?'); args.push(int(opts.from)) }
    if (opts.to   !== undefined) { conds.push('ts <= ?'); args.push(int(opts.to))   }
    const limit = Math.min(opts.limit ?? 100, 500)
    args.push(int(limit))
    const rows = await this._query(
      `SELECT id, site, sid, uid, name, email, message, url, ts
       FROM user_feedback
       WHERE ${conds.join(' AND ')}
       ORDER BY ts DESC
       LIMIT ?`,
      args,
    )
    return rows.map(r => ({
      id:      parseInt(r.id ?? '0'),
      site:    r.site!,
      sid:     r.sid!,
      uid:     r.uid   ?? null,
      name:    r.name  ?? null,
      email:   r.email ?? null,
      message: r.message!,
      url:     r.url   ?? null,
      ts:      parseInt(r.ts ?? '0'),
    }))
  }

  // ── Audience: traffic / geo / devices ─────────────────────────────────────────

  async getTrafficSources(site: string, from?: number): Promise<TrafficSourceRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (from !== undefined) { conds.push('last_seen >= ?'); args.push(int(from)) }
    const rows = await this._query(
      `SELECT site, channel, referrer_host, utm_source, utm_medium, utm_campaign, sessions, last_seen
       FROM traffic_sources WHERE ${conds.join(' AND ')} ORDER BY sessions DESC LIMIT 500`,
      args,
    )
    return rows.map(r => ({
      site: r.site!, channel: r.channel!, referrerHost: r.referrer_host ?? '',
      utmSource: r.utm_source ?? '', utmMedium: r.utm_medium ?? '', utmCampaign: r.utm_campaign ?? '',
      sessions: parseInt(r.sessions ?? '0'), lastSeen: parseInt(r.last_seen ?? '0'),
    }))
  }

  async getGeoStats(site: string): Promise<GeoStatRow[]> {
    const rows = await this._query(
      `SELECT site, country, city, sessions FROM geo_stats WHERE site = ? ORDER BY sessions DESC LIMIT 500`,
      [str(site)],
    )
    return rows.map(r => ({
      site: r.site!, country: r.country ?? 'XX', city: r.city ?? '', sessions: parseInt(r.sessions ?? '0'),
    }))
  }

  async getDeviceStats(site: string): Promise<DeviceStatRow[]> {
    const rows = await this._query(
      `SELECT site, device_type, browser, os, sessions FROM device_stats WHERE site = ? ORDER BY sessions DESC LIMIT 500`,
      [str(site)],
    )
    return rows.map(r => ({
      site: r.site!, deviceType: r.device_type ?? 'desktop', browser: r.browser ?? 'Other',
      os: r.os ?? 'Other', sessions: parseInt(r.sessions ?? '0'),
    }))
  }

  async getConversions(site: string, from?: number): Promise<ConversionStatRow[]> {
    const conds = ['site = ?']
    const args: TursoArg[] = [str(site)]
    if (from !== undefined) { conds.push('last_seen >= ?'); args.push(int(from)) }
    const rows = await this._query(
      `SELECT site, kind, url, count, last_seen FROM conversions WHERE ${conds.join(' AND ')} ORDER BY count DESC LIMIT 500`,
      args,
    )
    return rows.map(r => ({
      site: r.site!, kind: r.kind!, url: r.url ?? '', count: parseInt(r.count ?? '0'), lastSeen: parseInt(r.last_seen ?? '0'),
    }))
  }

  async getSiteTotals(): Promise<SiteTotal[]> {
    const rows = await this._query(
      `SELECT site, COUNT(*) AS sessions, MAX(started) AS last_seen FROM sessions GROUP BY site ORDER BY sessions DESC LIMIT 200`,
      [],
    )
    return rows.map(r => ({ site: r.site!, sessions: parseInt(r.sessions ?? '0'), lastSeen: parseInt(r.last_seen ?? '0') }))
  }

  // ── Overview + 0–100 health score ──────────────────────────────────────────────

  async getOverview(site: string, from?: number): Promise<OverviewSummary> {
    const fromT = from ?? 0
    const [sess, vit, conv, perf, series] = await Promise.all([
      this._query(
        `SELECT COUNT(*) AS n, COALESCE(SUM(has_error),0) AS errs, COUNT(DISTINCT uid) AS users
         FROM sessions WHERE site = ? AND started >= ?`, [str(site), int(fromT)]),
      this._query(
        `SELECT COALESCE(SUM(good),0) AS g, COALESCE(SUM(total),0) AS t FROM vitals_summary WHERE site = ?`, [str(site)]),
      this._query(
        `SELECT COALESCE(SUM(count),0) AS c FROM conversions WHERE site = ? AND last_seen >= ?`, [str(site), int(fromT)]),
      this._query(
        `SELECT COALESCE(AVG(p75),0) AS p FROM page_perf WHERE site = ?`, [str(site)]),
      this._query(
        `SELECT started/86400000 AS day, COUNT(*) AS n, COALESCE(SUM(has_error),0) AS e
         FROM sessions WHERE site = ? AND started >= ? GROUP BY day ORDER BY day ASC LIMIT 120`, [str(site), int(fromT)]),
    ])

    const sessions = parseInt(sess[0]?.n ?? '0')
    const errorSessions = parseInt(sess[0]?.errs ?? '0')
    const users = parseInt(sess[0]?.users ?? '0')
    const conversions = parseInt(conv[0]?.c ?? '0')
    const vGood = parseInt(vit[0]?.g ?? '0')
    const vTotal = parseInt(vit[0]?.t ?? '0')
    const perfP75 = Math.round(parseFloat(perf[0]?.p ?? '0'))

    const vitalsGoodPct = vTotal > 0 ? Math.round((vGood / vTotal) * 100) : 0
    const errorRate = sessions > 0 ? Math.round((errorSessions / sessions) * 100) : 0

    // Health = blend of vitals (good %), reliability (1 - error rate), and speed
    // (p75 mapped: ≤1s→100, ≥6s→0). Each weighted; clamped to 0–100.
    const perfScore = perfP75 <= 0 ? 100 : Math.max(0, Math.min(100, Math.round(100 - ((perfP75 - 1000) / 5000) * 100)))
    const reliabilityScore = 100 - errorRate
    const vitalsScore = vTotal > 0 ? vitalsGoodPct : 100
    const health = Math.max(0, Math.min(100, Math.round(0.45 * vitalsScore + 0.35 * reliabilityScore + 0.20 * perfScore)))

    return {
      site, sessions, users, errorSessions, errorRate, conversions,
      vitalsGoodPct, perfP75, health,
      series: series.map(r => ({ day: parseInt(r.day ?? '0'), sessions: parseInt(r.n ?? '0'), errors: parseInt(r.e ?? '0') })),
    }
  }

  // ── Funnels ────────────────────────────────────────────────────────────────────

  async listFunnels(site: string): Promise<FunnelDef[]> {
    const rows = await this._query(
      `SELECT id, site, name, steps, updated FROM funnel_defs WHERE site = ? ORDER BY updated DESC`,
      [str(site)],
    )
    return rows.flatMap(r => {
      try {
        return [{ id: r.id!, site: r.site!, name: r.name!, steps: JSON.parse(r.steps ?? '[]') as FunnelStep[], updated: parseInt(r.updated ?? '0') }]
      } catch { return [] }
    })
  }

  async upsertFunnel(site: string, id: string, name: string, steps: FunnelStep[]): Promise<void> {
    await this._execute(
      `INSERT INTO funnel_defs (id, site, name, steps, updated) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (site, id) DO UPDATE SET name = excluded.name, steps = excluded.steps, updated = excluded.updated`,
      [str(id), str(site), str(name.slice(0, 80)), str(JSON.stringify(steps)), int(Date.now())],
    )
  }

  async deleteFunnel(site: string, id: string): Promise<void> {
    await this._execute('DELETE FROM funnel_defs WHERE site = ? AND id = ?', [str(site), str(id)])
  }

  // Sequential funnel: counts[i] = sessions that completed steps 0..i in order.
  // Computed on demand by scanning the session event stream (capped).
  async computeFunnel(site: string, steps: FunnelStep[], from?: number): Promise<FunnelResult> {
    const counts = new Array(steps.length).fill(0)
    if (steps.length === 0) return { counts, total: 0 }
    const rows = await this._query(
      `SELECT sid, t, type, payload FROM analytics_events WHERE site = ? AND t >= ? ORDER BY sid ASC, t ASC LIMIT 100000`,
      [str(site), int(from ?? 0)],
    )
    const sids = new Set<string>()
    let curSid = ''
    let ptr = 0
    const flush = () => { for (let i = 0; i < ptr; i++) counts[i]++ }
    for (const r of rows) {
      const sid = r.sid ?? ''
      if (sid !== curSid) { if (curSid) flush(); curSid = sid; ptr = 0; sids.add(sid) }
      if (ptr >= steps.length) continue
      let url = '', name = ''
      if (r.payload) {
        try {
          const p = JSON.parse(r.payload) as Record<string, unknown>
          const inner = (typeof p.payload === 'object' && p.payload ? p.payload : p) as Record<string, unknown>
          url = String(p.url ?? inner.url ?? '')
          name = String(p.name ?? inner.name ?? '')
        } catch { /* skip */ }
      }
      const step = steps[ptr]
      const m = step.match.toLowerCase()
      const hit = step.type === 'url'
        ? url.toLowerCase().includes(m)
        : String(r.type ?? '').toLowerCase() === 'custom' && name.toLowerCase().includes(m)
      if (hit) ptr++
    }
    if (curSid) flush()
    return { counts, total: sids.size }
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

    // vitals + sourcemaps tables
    const extra: TursoReq[] = [
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS vitals_summary (
          site      TEXT NOT NULL,
          url       TEXT NOT NULL,
          metric    TEXT NOT NULL,
          good      INTEGER NOT NULL DEFAULT 0,
          needs_imp INTEGER NOT NULL DEFAULT 0,
          poor      INTEGER NOT NULL DEFAULT 0,
          sum_value REAL NOT NULL DEFAULT 0,
          total     INTEGER NOT NULL DEFAULT 0,
          updated   INTEGER NOT NULL,
          PRIMARY KEY (site, url, metric)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS sourcemaps (
          release     TEXT NOT NULL,
          filename    TEXT NOT NULL,
          site        TEXT NOT NULL,
          content     TEXT NOT NULL,
          size        INTEGER NOT NULL DEFAULT 0,
          uploaded_at INTEGER NOT NULL,
          PRIMARY KEY (site, release, filename)
        )` }},
      { type: 'close' },
    ]
    await this._pipeline(extra)

    // page_perf — transaction performance aggregates
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS page_perf (
          site    TEXT NOT NULL,
          url     TEXT NOT NULL,
          count   INTEGER NOT NULL DEFAULT 0,
          sum_ms  REAL NOT NULL DEFAULT 0,
          min_ms  REAL NOT NULL DEFAULT 0,
          max_ms  REAL NOT NULL DEFAULT 0,
          p50     REAL NOT NULL DEFAULT 0,
          p75     REAL NOT NULL DEFAULT 0,
          p95     REAL NOT NULL DEFAULT 0,
          updated INTEGER NOT NULL,
          PRIMARY KEY (site, url)
        )` }},
      { type: 'close' },
    ])

    // error_daily_stats table
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS error_daily_stats (
          site        TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          date        TEXT NOT NULL,
          count       INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, fingerprint, date)
        )` }},
      { type: 'close' },
    ])

    // alert_rules — per-site configurable thresholds
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS alert_rules (
          site        TEXT NOT NULL,
          rule_type   TEXT NOT NULL,
          enabled     INTEGER NOT NULL DEFAULT 1,
          threshold   INTEGER NOT NULL DEFAULT 5,
          cooldown_ms INTEGER NOT NULL DEFAULT 3600000,
          updated     INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, rule_type)
        )` }},
      { type: 'close' },
    ])

    // user_feedback — raw feedback submissions
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS user_feedback (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          site    TEXT NOT NULL,
          sid     TEXT NOT NULL,
          uid     TEXT,
          name    TEXT,
          email   TEXT,
          message TEXT NOT NULL,
          url     TEXT,
          ts      INTEGER NOT NULL
        )` }},
      { type: 'execute', stmt: { sql: `CREATE INDEX IF NOT EXISTS idx_user_feedback_site ON user_feedback (site, ts DESC)` } },
      { type: 'close' },
    ])

    // error_activity — audit log for status changes
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS error_activity (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          site        TEXT NOT NULL,
          fingerprint TEXT NOT NULL,
          action      TEXT NOT NULL,
          actor       TEXT,
          ts          INTEGER NOT NULL
        )` }},
      { type: 'execute', stmt: { sql: `CREATE INDEX IF NOT EXISTS idx_error_activity_fp ON error_activity (site, fingerprint, ts DESC)` } },
      { type: 'close' },
    ])

    // alert_channels — per-site Telegram/Slack notification config
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS alert_channels (
          site              TEXT NOT NULL PRIMARY KEY,
          telegram_token    TEXT,
          telegram_chat_id  TEXT,
          slack_webhook_url TEXT,
          updated           INTEGER NOT NULL DEFAULT 0
        )` }},
      { type: 'close' },
    ])

    // heatmap_cells / zone_stats / sessions — must exist before processor INSERTs or query-api SELECTs
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS heatmap_cells (
          site    TEXT    NOT NULL,
          url     TEXT    NOT NULL,
          gx      INTEGER NOT NULL,
          gy      INTEGER NOT NULL,
          count   INTEGER NOT NULL DEFAULT 0,
          updated INTEGER NOT NULL,
          PRIMARY KEY (site, url, gx, gy)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS zone_stats (
          site      TEXT    NOT NULL,
          zone_id   TEXT    NOT NULL,
          url       TEXT    NOT NULL,
          enters    INTEGER NOT NULL DEFAULT 0,
          clicks    INTEGER NOT NULL DEFAULT 0,
          avg_dwell REAL    NOT NULL DEFAULT 0,
          updated   INTEGER NOT NULL,
          PRIMARY KEY (site, zone_id, url)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS sessions (
          sid         TEXT    NOT NULL PRIMARY KEY,
          site        TEXT    NOT NULL,
          uid         TEXT,
          started     INTEGER NOT NULL,
          ended       INTEGER NOT NULL,
          duration    INTEGER NOT NULL DEFAULT 0,
          url_count   INTEGER NOT NULL DEFAULT 0,
          event_count INTEGER NOT NULL DEFAULT 0,
          has_replay  INTEGER NOT NULL DEFAULT 0,
          has_error   INTEGER NOT NULL DEFAULT 0
        )` }},
      { type: 'close' },
    ])

    // Audience + conversions aggregates — must exist before query-api SELECTs
    await this._pipeline([
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS traffic_sources (
          site          TEXT    NOT NULL,
          channel       TEXT    NOT NULL,
          referrer_host TEXT    NOT NULL DEFAULT '',
          utm_source    TEXT    NOT NULL DEFAULT '',
          utm_medium    TEXT    NOT NULL DEFAULT '',
          utm_campaign  TEXT    NOT NULL DEFAULT '',
          sessions      INTEGER NOT NULL DEFAULT 0,
          last_seen     INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, channel, referrer_host, utm_source, utm_medium, utm_campaign)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS geo_stats (
          site TEXT NOT NULL, country TEXT NOT NULL, city TEXT NOT NULL DEFAULT '',
          sessions INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, country, city)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS device_stats (
          site TEXT NOT NULL, device_type TEXT NOT NULL, browser TEXT NOT NULL, os TEXT NOT NULL,
          sessions INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, device_type, browser, os)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS conversions (
          site TEXT NOT NULL, kind TEXT NOT NULL, url TEXT NOT NULL DEFAULT '',
          count INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, kind, url)
        )` }},
      { type: 'execute', stmt: { sql: `CREATE TABLE IF NOT EXISTS funnel_defs (
          id      TEXT NOT NULL,
          site    TEXT NOT NULL,
          name    TEXT NOT NULL,
          steps   TEXT NOT NULL,
          updated INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (site, id)
        )` }},
      { type: 'close' },
    ])

    // Column migrations — ignore if already exists
    for (const col of ['release TEXT', 'breadcrumbs TEXT', 'user_sample TEXT']) {
      await this._pipeline([
        { type: 'execute', stmt: { sql: `ALTER TABLE error_groups ADD COLUMN ${col}` } },
        { type: 'close' },
      ]).catch(() => { /* already exists */ })
    }
    await this._pipeline([
      { type: 'execute', stmt: { sql: `ALTER TABLE sessions ADD COLUMN has_error INTEGER NOT NULL DEFAULT 0` } },
      { type: 'close' },
    ]).catch(() => { /* already exists */ })
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
