import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'
import type { SessionRow } from '../types'
import { fetchSessionErrors } from '../api'

type SortKey = 'started' | 'duration' | 'urlCount' | 'eventCount'
type Dir     = 'desc' | 'asc'

type SessionError = { type: string; msg: string; url: string | null; ts: number }

interface Props {
  sessions:  SessionRow[]
  site:      string
  onReplay?: (sid: string) => void
}

function timeAgo(ms: number): string {
  const m = Math.floor((Date.now() - ms) / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const ERROR_TYPE_ICON: Record<string, string> = {
  js_error:      '🔴',
  network_error: '🟠',
}

const tbody = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
}
const rowVariant = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

export function SessionList({ sessions, site, onReplay }: Props) {
  const [sortKey,     setSortKey]     = useState<SortKey>('started')
  const [dir,         setDir]         = useState<Dir>('desc')
  const [replayOnly,  setReplayOnly]  = useState(false)
  const [errorOnly,   setErrorOnly]   = useState(false)
  const [urlFilter,   setUrlFilter]   = useState('')

  // expanded session → its errors (undefined = never fetched, null = loading, [] = loaded)
  const [expanded,      setExpanded]      = useState<string | null>(null)
  const [sessionErrors, setSessionErrors] = useState<Record<string, SessionError[] | null | undefined>>({})

  const toggleExpand = useCallback(async (sid: string) => {
    if (expanded === sid) { setExpanded(null); return }
    setExpanded(sid)
    if (sessionErrors[sid] !== undefined) return  // already fetched
    setSessionErrors(prev => ({ ...prev, [sid]: null }))  // null = loading
    try {
      const errs = await fetchSessionErrors(sid, site)
      setSessionErrors(prev => ({ ...prev, [sid]: errs }))
    } catch {
      setSessionErrors(prev => ({ ...prev, [sid]: [] }))
    }
  }, [expanded, sessionErrors, site])

  if (sessions.length === 0) {
    return (
      <div className="empty">
        <span className="empty-title">No sessions yet</span>
        <span>Sessions appear as visitors browse your site.</span>
      </div>
    )
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setDir('desc') }
  }

  const ulf = urlFilter.toLowerCase()
  const visible = sessions.filter(s => {
    if (replayOnly && !s.hasReplay) return false
    if (errorOnly  && !s.hasError)  return false
    if (ulf && !s.sid.toLowerCase().includes(ulf) && !(s.uid?.toLowerCase().includes(ulf))) return false
    return true
  })
  const sorted  = [...visible].sort((a, b) => {
    const sign = dir === 'desc' ? -1 : 1
    return (a[sortKey] - b[sortKey]) * sign
  })

  const withError   = sessions.filter(s => s.hasError).length
  const withReplay  = sessions.filter(s => s.hasReplay).length
  const avgDuration = sessions.length
    ? Math.round(sessions.reduce((s, r) => s + r.duration, 0) / sessions.length)
    : 0

  function arrow(k: SortKey) {
    if (k !== sortKey) return <span className="sort-arrow">↕</span>
    return <span className="sort-arrow">{dir === 'desc' ? '↓' : '↑'}</span>
  }

  function Th({ k, label, right }: { k: SortKey; label: string; right?: boolean }) {
    return (
      <th
        className={`${k === sortKey ? 'sort-active' : ''} ${right ? 'col-r' : ''}`}
        onClick={() => toggleSort(k)}
      >
        {label}{arrow(k)}
      </th>
    )
  }

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Sessions',     value: sessions.length, fmt: undefined },
          { label: 'With replay',  value: withReplay,     fmt: undefined },
          { label: 'With errors',  value: withError,      fmt: undefined },
          { label: 'Avg duration', value: avgDuration,    fmt: (n: number) => fmtDuration(n) },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.3, ease: 'easeOut' }}
          >
            <div className="stat-value">
              <AnimatedNumber value={s.value} format={s.fmt} />
            </div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <label className="toggle-label">
          <input type="checkbox" checked={replayOnly} onChange={e => setReplayOnly(e.target.checked)} />
          Replay only
        </label>
        <label className="toggle-label">
          <input type="checkbox" checked={errorOnly} onChange={e => setErrorOnly(e.target.checked)} />
          Has errors
        </label>
        <input
          className="input"
          placeholder="Filter by SID / user…"
          value={urlFilter}
          onChange={e => setUrlFilter(e.target.value)}
          style={{ width: 180, fontSize: 12, padding: '4px 10px' }}
        />
        <span className="count-label" style={{ marginLeft: 'auto' }}>
          {sorted.length.toLocaleString()} sessions
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 20 }} />
              <th>Session</th>
              <Th k="started"    label="Started"  />
              <Th k="duration"   label="Duration"  right />
              <Th k="urlCount"   label="Pages"     right />
              <Th k="eventCount" label="Events"    right />
              <th>Replay</th>
            </tr>
          </thead>
          <motion.tbody variants={tbody} initial="hidden" animate="show">
            {sorted.map(s => {
              const isOpen  = expanded === s.sid
              const errs    = sessionErrors[s.sid]
              const loading = errs === null
              const errList = Array.isArray(errs) ? errs : []

              return (
                <>
                  <motion.tr
                    key={s.sid}
                    variants={rowVariant}
                    onClick={() => toggleExpand(s.sid)}
                    style={{ cursor: 'pointer', background: isOpen ? 'var(--surface-1)' : undefined }}
                  >
                    <td style={{ textAlign: 'center', color: 'var(--text-2)', fontSize: 10, userSelect: 'none' }}>
                      {isOpen ? '▾' : '▸'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>
                      {s.sid.slice(0, 10)}<span style={{ opacity: .4 }}>…</span>
                      {errList.length > 0 && (
                        <span className="badge badge-error" style={{ marginLeft: 6, fontSize: 10 }}>
                          {errList.length} err
                        </span>
                      )}
                    </td>
                    <td title={new Date(s.started).toLocaleString()}>{timeAgo(s.started)}</td>
                    <td className="col-r">{fmtDuration(s.duration)}</td>
                    <td className="col-r">{s.urlCount}</td>
                    <td className="col-r">{s.eventCount.toLocaleString()}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {s.hasReplay
                        ? <button className="play-btn" onClick={() => onReplay?.(s.sid)}>▶ Play</button>
                        : <span className="badge badge-gray">—</span>
                      }
                    </td>
                  </motion.tr>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.tr
                        key={`${s.sid}-detail`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                      >
                        <td colSpan={7} style={{ padding: 0, background: 'var(--surface-0)' }}>
                          <div className="session-errors-wrap">
                            {loading ? (
                              <span className="session-errors-loading">Loading errors…</span>
                            ) : errList.length === 0 ? (
                              <span className="session-errors-empty">No errors in this session</span>
                            ) : (
                              <table className="session-errors-table">
                                <thead>
                                  <tr>
                                    <th>Type</th>
                                    <th>Message</th>
                                    <th>URL</th>
                                    <th>Time</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {errList.map((e, i) => (
                                    <tr key={i}>
                                      <td>
                                        <span style={{ marginRight: 4 }}>{ERROR_TYPE_ICON[e.type] ?? '⚪'}</span>
                                        <code style={{ fontSize: 11 }}>{e.type}</code>
                                      </td>
                                      <td style={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {e.msg}
                                      </td>
                                      <td style={{ color: 'var(--text-2)', fontSize: 11 }}>
                                        {e.url ? e.url.replace(/^https?:\/\/[^/]+/, '') : '—'}
                                      </td>
                                      <td style={{ color: 'var(--text-2)', fontSize: 11, whiteSpace: 'nowrap' }}>
                                        {fmtTime(e.ts)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </>
              )
            })}
          </motion.tbody>
        </table>
      </div>
    </div>
  )
}
