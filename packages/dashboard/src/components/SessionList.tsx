import { useState } from 'react'
import type { SessionRow } from '../types'

type SortKey = 'started' | 'duration' | 'urlCount' | 'eventCount'
type Dir = 'desc' | 'asc'

interface Props {
  sessions: SessionRow[]
  onReplay?: (sid: string) => void
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60_000)
  if (m < 1)   return 'just now'
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function SessionList({ sessions, onReplay }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('started')
  const [dir, setDir]         = useState<Dir>('desc')
  const [replayOnly, setReplayOnly] = useState(false)

  if (sessions.length === 0) return <div className="empty">No sessions found.</div>

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setDir('desc') }
  }

  const visible = replayOnly ? sessions.filter(s => s.hasReplay) : sessions
  const sorted  = [...visible].sort((a, b) => {
    const sign = dir === 'desc' ? -1 : 1
    return (a[sortKey] - b[sortKey]) * sign
  })

  const withReplay = sessions.filter(s => s.hasReplay).length
  const avgDuration = sessions.length
    ? Math.round(sessions.reduce((s, r) => s + r.duration, 0) / sessions.length)
    : 0

  function arrow(k: SortKey) {
    if (k !== sortKey) return <span className="sort-arrow">↕</span>
    return <span className="sort-arrow">{dir === 'desc' ? '↓' : '↑'}</span>
  }

  function Th({ k, label, right }: { k: SortKey; label: string; right?: boolean }) {
    return (
      <th className={`${k === sortKey ? 'sort-active' : ''} ${right ? 'col-r' : ''}`}
          onClick={() => toggleSort(k)}>
        {label}{arrow(k)}
      </th>
    )
  }

  return (
    <div>
      <div className="stats-bar">
        <div className="stat-card"><div className="stat-value">{sessions.length}</div><div className="stat-label">Sessions</div></div>
        <div className="stat-card"><div className="stat-value">{withReplay}</div><div className="stat-label">With replay</div></div>
        <div className="stat-card"><div className="stat-value">{fmtDuration(avgDuration)}</div><div className="stat-label">Avg duration</div></div>
      </div>

      <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={replayOnly} onChange={e => setReplayOnly(e.target.checked)} />
          Replay only
        </label>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {sorted.length.toLocaleString()} shown
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
          <tbody>
            {sorted.map(s => (
              <tr key={s.sid}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.sid.slice(0, 12)}…</td>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
