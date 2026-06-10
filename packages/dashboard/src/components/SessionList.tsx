import { useState } from 'react'
import { motion } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'
import type { SessionRow } from '../types'

type SortKey = 'started' | 'duration' | 'urlCount' | 'eventCount'
type Dir     = 'desc' | 'asc'

interface Props {
  sessions:  SessionRow[]
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

const tbody = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.03, delayChildren: 0.05 } },
}
const row = {
  hidden: { opacity: 0, y: 6 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
}

export function SessionList({ sessions, onReplay }: Props) {
  const [sortKey,    setSortKey]    = useState<SortKey>('started')
  const [dir,        setDir]        = useState<Dir>('desc')
  const [replayOnly, setReplayOnly] = useState(false)

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

  const visible = replayOnly ? sessions.filter(s => s.hasReplay) : sessions
  const sorted  = [...visible].sort((a, b) => {
    const sign = dir === 'desc' ? -1 : 1
    return (a[sortKey] - b[sortKey]) * sign
  })

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
          { label: 'Sessions',     value: sessions.length,     fmt: undefined },
          { label: 'With replay',  value: withReplay,          fmt: undefined },
          { label: 'Avg duration', value: avgDuration, fmt: (n: number) => fmtDuration(n) },
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

      <div className="toolbar">
        <label className="toggle-label">
          <input
            type="checkbox"
            checked={replayOnly}
            onChange={e => setReplayOnly(e.target.checked)}
          />
          Replay only
        </label>
        <span className="count-label">
          {sorted.length.toLocaleString()} sessions
        </span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session</th>
              <Th k="started"    label="Started"  />
              <Th k="duration"   label="Duration"  right />
              <Th k="urlCount"   label="Pages"     right />
              <Th k="eventCount" label="Events"    right />
              <th>Replay</th>
            </tr>
          </thead>
          <motion.tbody variants={tbody} initial="hidden" animate="show">
            {sorted.map(s => (
              <motion.tr key={s.sid} variants={row}>
                <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)' }}>
                  {s.sid.slice(0, 10)}<span style={{ opacity: .4 }}>…</span>
                </td>
                <td title={new Date(s.started).toLocaleString()}>{timeAgo(s.started)}</td>
                <td className="col-r">{fmtDuration(s.duration)}</td>
                <td className="col-r">{s.urlCount}</td>
                <td className="col-r">{s.eventCount.toLocaleString()}</td>
                <td>
                  {s.hasReplay
                    ? <button className="play-btn" onClick={() => onReplay?.(s.sid)}>▶ Play</button>
                    : <span className="badge badge-gray">—</span>
                  }
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  )
}
