import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ErrorGroup, ErrorStatus, Breadcrumb, ErrorOccurrence, UserSample } from '../types'
import { updateError, fetchErrorEvents } from '../api'

interface Props {
  errors: ErrorGroup[]
  site: string
  onUpdate: (fp: string, update: Partial<ErrorGroup>) => void
}

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`badge ${type === 'network_error' ? 'badge-blue' : 'badge-red'}`}>
      {type === 'network_error' ? 'network' : 'js'}
    </span>
  )
}

const STATUS_META: Record<ErrorStatus, { label: string; cls: string }> = {
  open:      { label: 'open',      cls: 'badge-red'   },
  ignored:   { label: 'ignored',   cls: 'badge-gray'  },
  resolved:  { label: 'resolved',  cls: 'badge-green' },
  regressed: { label: 'regressed', cls: 'badge-warn'  },
}

function StatusBadge({ status }: { status: ErrorStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.open
  return <span className={`badge ${m.cls}`}>{m.label}</span>
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ counts }: { counts: number[] }) {
  const max = Math.max(...counts, 1)
  return (
    <svg width={56} height={20} style={{ display: 'block', flexShrink: 0 }}>
      {counts.map((c, i) => {
        const h = Math.max(Math.round((c / max) * 18), c > 0 ? 2 : 0)
        return (
          <rect
            key={i}
            x={i * 4}
            y={20 - h}
            width={3}
            height={h}
            fill={c > 0 ? 'var(--error)' : 'var(--border-2)'}
            rx={1}
          />
        )
      })}
    </svg>
  )
}

// ── User badge ────────────────────────────────────────────────────────────────

function UserBadge({ user }: { user: UserSample }) {
  const label = user.email ?? user.name ?? user.id ?? '?'
  return (
    <span className="user-badge" title={[user.id, user.email, user.name].filter(Boolean).join(' · ')}>
      👤 {label.slice(0, 24)}
    </span>
  )
}

// ── Breadcrumbs ───────────────────────────────────────────────────────────────

const CRUMB_ICON: Record<string, string> = {
  navigation: '↗', click: '◉', console: '▸', http: '⇄',
}

function BreadcrumbList({ crumbs }: { crumbs: Breadcrumb[] }) {
  if (crumbs.length === 0) return null
  return (
    <div className="crumbs-wrap">
      <p className="crumbs-title">Breadcrumbs</p>
      {crumbs.map((c, i) => (
        <div key={i} className="crumb-row">
          <span className="crumb-icon">{CRUMB_ICON[c.category] ?? '·'}</span>
          <span className="crumb-cat">{c.category}</span>
          <span className="crumb-msg">{c.message}</span>
          <span className="crumb-time">{new Date(c.t).toLocaleTimeString()}</span>
        </div>
      ))}
    </div>
  )
}

// ── Individual occurrences ────────────────────────────────────────────────────

function OccurrenceList({ events }: { events: ErrorOccurrence[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  if (events.length === 0) return (
    <div className="occ-empty">No individual occurrences found in recent events.</div>
  )
  return (
    <div className="occ-list">
      <div className="occ-header">
        <span>Time</span><span>URL</span><span>User</span><span>Release</span>
      </div>
      {events.map((e, i) => (
        <div key={i}>
          <div
            className={`occ-row ${expanded === i ? 'open' : ''}`}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <span className="occ-ts" title={new Date(e.ts).toLocaleString()}>{timeAgo(e.ts)}</span>
            <span className="occ-url">{e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') || '/' : '—'}</span>
            <span className="occ-user">{e.user ?? '—'}</span>
            <span className="occ-release">{e.release ?? '—'}</span>
          </div>
          {expanded === i && e.stack && (
            <pre className="occ-stack">{e.stack}</pre>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Status selector ───────────────────────────────────────────────────────────

function StatusSelector({
  fingerprint, site, current, onDone,
}: { fingerprint: string; site: string; current: ErrorStatus; onDone: (s: ErrorStatus) => void }) {
  const [saving, setSaving] = useState(false)
  const handle = useCallback(async (next: ErrorStatus) => {
    if (next === current || saving) return
    setSaving(true)
    try { await updateError(fingerprint, site, { status: next }); onDone(next) }
    finally { setSaving(false) }
  }, [fingerprint, site, current, saving, onDone])
  return (
    <select
      className="status-select"
      value={current}
      disabled={saving}
      onChange={e => handle(e.target.value as ErrorStatus)}
      onClick={e => e.stopPropagation()}
    >
      {(Object.keys(STATUS_META) as ErrorStatus[]).map(s => (
        <option key={s} value={s}>{STATUS_META[s].label}</option>
      ))}
    </select>
  )
}

function AssigneeInput({
  fingerprint, site, current, onDone,
}: { fingerprint: string; site: string; current: string | null; onDone: (a: string) => void }) {
  const [val, setVal] = useState(current ?? '')
  const [saving, setSaving] = useState(false)
  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try { await updateError(fingerprint, site, { assignee: val.trim() }); onDone(val.trim()) }
    finally { setSaving(false) }
  }, [fingerprint, site, val, saving, onDone])
  return (
    <input
      className="assignee-input"
      placeholder="assign to…"
      value={val}
      disabled={saving}
      onClick={e => e.stopPropagation()}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => e.key === 'Enter' && save()}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function ErrorList({ errors, site, onUpdate }: Props) {
  const [expanded,      setExpanded]      = useState<string | null>(null)
  const [statusFilter,  setStatusFilter]  = useState<string>('all')
  const [searchQuery,   setSearchQuery]   = useState('')

  // Per-fingerprint event occurrences cache
  const [occCache,     setOccCache]     = useState<Record<string, ErrorOccurrence[] | null>>({})
  const [activeTab,    setActiveTab]    = useState<Record<string, 'detail' | 'events'>>({})

  const searchRef = useRef<HTMLInputElement>(null)

  const getTab = (fp: string) => activeTab[fp] ?? 'detail'
  const setTab = (fp: string, t: 'detail' | 'events') =>
    setActiveTab(prev => ({ ...prev, [fp]: t }))

  const loadEvents = useCallback(async (fp: string) => {
    if (occCache[fp] !== undefined) return
    setOccCache(prev => ({ ...prev, [fp]: null }))  // null = loading
    try {
      const evs = await fetchErrorEvents(fp, site)
      setOccCache(prev => ({ ...prev, [fp]: evs }))
    } catch {
      setOccCache(prev => ({ ...prev, [fp]: [] }))
    }
  }, [occCache, site])

  const handleTabChange = useCallback((fp: string, tab: 'detail' | 'events') => {
    setTab(fp, tab)
    if (tab === 'events') loadEvents(fp)
  }, [loadEvents])

  // Client-side filtering
  const ql = searchQuery.toLowerCase()
  const visible = errors.filter(e => {
    if (statusFilter !== 'all' && e.status !== statusFilter) return false
    if (ql && !e.message.toLowerCase().includes(ql) && !e.eventType.includes(ql)) return false
    return true
  })

  if (errors.length === 0) {
    return (
      <div className="empty">
        <span className="empty-title">No errors recorded</span>
        <span>Errors captured by the SDK will appear here.</span>
      </div>
    )
  }

  const totalCount    = errors.reduce((s, e) => s + e.count, 0)
  const openCount     = errors.filter(e => e.status === 'open' || e.status === 'regressed').length
  const resolvedCount = errors.filter(e => e.status === 'resolved').length

  return (
    <div>
      {/* Stats */}
      <div className="stats-bar">
        {[
          { label: 'Error types',  value: errors.length, color: 'var(--error)' },
          { label: 'Total events', value: totalCount },
          { label: 'Open',         value: openCount,     color: openCount > 0 ? 'var(--error)' : undefined },
          { label: 'Resolved',     value: resolvedCount, color: resolvedCount > 0 ? 'var(--success)' : undefined },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.28, ease: 'easeOut' }}
          >
            <div className="stat-value" style={{ color: s.color }}>{s.value.toLocaleString()}</div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Toolbar: status pills + search */}
      <div className="toolbar" style={{ marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', 'open', 'regressed', 'ignored', 'resolved'].map(f => (
            <button
              key={f}
              className={`filter-pill ${statusFilter === f ? 'active' : ''}`}
              onClick={() => setStatusFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
          <input
            ref={searchRef}
            className="input"
            placeholder="Search errors…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{ width: 200, fontSize: 12, padding: '4px 10px' }}
          />
          <span className="count-label">{visible.length} shown</span>
        </div>
      </div>

      {/* Table */}
      <div className="error-wrap">
        <div className="error-header error-header-v2" style={{ gridTemplateColumns: '60px 1fr 90px 56px 72px 72px 80px' }}>
          <span>Type</span>
          <span>Message</span>
          <span>Status</span>
          <span>14d</span>
          <span style={{ textAlign: 'right' }}>Events</span>
          <span style={{ textAlign: 'right' }}>Sessions</span>
          <span style={{ textAlign: 'right' }}>Last seen</span>
        </div>

        {visible.map((err, idx) => {
          const isOpen = expanded === err.fingerprint
          const tab    = getTab(err.fingerprint)
          const occ    = occCache[err.fingerprint]
          return (
            <motion.div
              key={err.fingerprint}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.02, duration: 0.18, ease: 'easeOut' }}
            >
              <div
                className={`error-row error-row-v2 ${isOpen ? 'open' : ''} ${err.status === 'ignored' ? 'dimmed' : ''}`}
                onClick={() => setExpanded(isOpen ? null : err.fingerprint)}
                style={{ gridTemplateColumns: '60px 1fr 90px 56px 72px 72px 80px' }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`error-chevron ${isOpen ? 'open' : ''}`}>▶</span>
                  <TypeBadge type={err.eventType} />
                </span>
                <span className="error-message">{err.message}</span>
                <span onClick={e => e.stopPropagation()}>
                  <StatusBadge status={err.status} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <Sparkline counts={err.recentCounts} />
                </span>
                <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--error)' }}>
                  {err.count.toLocaleString()}
                </span>
                <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-2)' }}>
                  {err.sessions}
                </span>
                <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                  {timeAgo(err.lastSeen)}
                </span>
              </div>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="error-detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                  >
                    {/* Actions row */}
                    <div className="error-actions">
                      <StatusSelector
                        fingerprint={err.fingerprint}
                        site={site}
                        current={err.status}
                        onDone={s => onUpdate(err.fingerprint, { status: s })}
                      />
                      <AssigneeInput
                        fingerprint={err.fingerprint}
                        site={site}
                        current={err.assignee}
                        onDone={a => onUpdate(err.fingerprint, { assignee: a })}
                      />
                      {err.release && (
                        <span className="release-badge">v{err.release}</span>
                      )}
                      {err.userSample && (
                        <UserBadge user={err.userSample} />
                      )}
                    </div>

                    {/* Tab switcher */}
                    <div className="error-tabs">
                      {(['detail', 'events'] as const).map(t => (
                        <button
                          key={t}
                          className={`error-tab-btn ${tab === t ? 'active' : ''}`}
                          onClick={e => { e.stopPropagation(); handleTabChange(err.fingerprint, t) }}
                        >
                          {t === 'detail' ? 'Details' : 'Occurrences'}
                        </button>
                      ))}
                    </div>

                    {/* Detail tab */}
                    {tab === 'detail' && (
                      <>
                        {err.source && (
                          <p className="error-meta">source &nbsp;<span>{err.source}</span></p>
                        )}
                        <p className="error-meta">
                          first seen &nbsp;<span>{new Date(err.firstSeen).toLocaleString()}</span>
                          &nbsp;·&nbsp;
                          last seen &nbsp;<span>{new Date(err.lastSeen).toLocaleString()}</span>
                        </p>
                        {err.stack && <pre className="error-stack">{err.stack}</pre>}
                        {err.breadcrumbs.length > 0 && <BreadcrumbList crumbs={err.breadcrumbs} />}
                      </>
                    )}

                    {/* Occurrences tab */}
                    {tab === 'events' && (
                      occ === null
                        ? <div className="occ-loading">Loading occurrences…</div>
                        : <OccurrenceList events={occ ?? []} />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
