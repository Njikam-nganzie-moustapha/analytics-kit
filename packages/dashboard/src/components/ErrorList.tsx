import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { ErrorGroup, ErrorStatus, Breadcrumb } from '../types'
import { updateError } from '../api'

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

const CRUMB_ICON: Record<string, string> = {
  navigation: '↗',
  click:      '◉',
  console:    '▸',
  http:       '⇄',
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

function StatusSelector({
  fingerprint, site, current, onDone,
}: { fingerprint: string; site: string; current: ErrorStatus; onDone: (s: ErrorStatus) => void }) {
  const [saving, setSaving] = useState(false)

  const handle = useCallback(async (next: ErrorStatus) => {
    if (next === current || saving) return
    setSaving(true)
    try {
      await updateError(fingerprint, site, { status: next })
      onDone(next)
    } finally {
      setSaving(false)
    }
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
    try {
      await updateError(fingerprint, site, { assignee: val.trim() })
      onDone(val.trim())
    } finally {
      setSaving(false)
    }
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

export function ErrorList({ errors, site, onUpdate }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const visible = statusFilter === 'all'
    ? errors
    : errors.filter(e => e.status === statusFilter)

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
          { label: 'Error types',   value: errors.length, color: 'var(--error)' },
          { label: 'Total events',  value: totalCount },
          { label: 'Open',          value: openCount,     color: openCount > 0 ? 'var(--error)' : undefined },
          { label: 'Resolved',      value: resolvedCount, color: resolvedCount > 0 ? 'var(--success)' : undefined },
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

      {/* Status filter toolbar */}
      <div className="toolbar" style={{ marginBottom: 16 }}>
        {['all', 'open', 'regressed', 'ignored', 'resolved'].map(f => (
          <button
            key={f}
            className={`filter-pill ${statusFilter === f ? 'active' : ''}`}
            onClick={() => setStatusFilter(f)}
          >
            {f}
          </button>
        ))}
        <span className="count-label">{visible.length} shown</span>
      </div>

      {/* Table */}
      <div className="error-wrap">
        <div className="error-header error-header-v2">
          <span>Type</span>
          <span>Message</span>
          <span>Status</span>
          <span style={{ textAlign: 'right' }}>Events</span>
          <span style={{ textAlign: 'right' }}>Sessions</span>
          <span style={{ textAlign: 'right' }}>Last seen</span>
        </div>

        {visible.map((err, idx) => {
          const isOpen = expanded === err.fingerprint
          return (
            <motion.div
              key={err.fingerprint}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.025, duration: 0.18, ease: 'easeOut' }}
            >
              <div
                className={`error-row error-row-v2 ${isOpen ? 'open' : ''} ${err.status === 'ignored' ? 'dimmed' : ''}`}
                onClick={() => setExpanded(isOpen ? null : err.fingerprint)}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`error-chevron ${isOpen ? 'open' : ''}`}>▶</span>
                  <TypeBadge type={err.eventType} />
                </span>
                <span className="error-message">{err.message}</span>
                <span onClick={e => e.stopPropagation()}>
                  <StatusBadge status={err.status} />
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
                    </div>

                    {/* Meta */}
                    {err.source && (
                      <p className="error-meta">source &nbsp;<span>{err.source}</span></p>
                    )}
                    <p className="error-meta">
                      first seen &nbsp;<span>{new Date(err.firstSeen).toLocaleString()}</span>
                      &nbsp;·&nbsp;
                      last seen &nbsp;<span>{new Date(err.lastSeen).toLocaleString()}</span>
                    </p>

                    {/* Stack trace */}
                    {err.stack && (
                      <pre className="error-stack">{err.stack}</pre>
                    )}

                    {/* Breadcrumbs */}
                    {err.breadcrumbs.length > 0 && (
                      <BreadcrumbList crumbs={err.breadcrumbs} />
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
