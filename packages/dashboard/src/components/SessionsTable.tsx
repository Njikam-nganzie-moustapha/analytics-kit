import { useState } from 'react'
import type { SessionRow } from '../types'

type Col = 'started' | 'duration' | 'urlCount' | 'eventCount'
type Dir = 1 | -1

function fmtTime(ms: number) {
  return new Date(ms).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

function fmtDuration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

interface Props { sessions: SessionRow[]; onReplay: (sid: string) => void }

export function SessionsTable({ sessions, onReplay }: Props) {
  const [sort, setSort] = useState<{ col: Col; dir: Dir }>({ col: 'started', dir: -1 })

  if (sessions.length === 0) return <div className="empty">No sessions recorded yet.</div>

  function toggle(col: Col) {
    setSort(s => s.col === col ? { col, dir: -s.dir as Dir } : { col, dir: -1 })
  }

  const sorted = [...sessions].sort((a, b) => {
    const av = a[sort.col], bv = b[sort.col]
    return av < bv ? sort.dir : av > bv ? -sort.dir : 0
  })

  function Th({ col, label }: { col: Col; label: string }) {
    const active = sort.col === col
    return (
      <th onClick={() => toggle(col)} className={active ? 'sort-active' : ''}>
        {label}{active && <span className="sort-arrow">{sort.dir === -1 ? ' ↓' : ' ↑'}</span>}
      </th>
    )
  }

  const withReplay = sessions.filter(s => s.hasReplay).length

  return (
    <>
      {withReplay > 0 && (
        <p style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
          {withReplay} session{withReplay !== 1 ? 's' : ''} with replay available
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Session ID</th>
              <th>User</th>
              <Th col="started"    label="Time" />
              <Th col="duration"   label="Duration" />
              <Th col="urlCount"   label="Pages" />
              <Th col="eventCount" label="Events" />
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(s => (
              <tr key={s.sid}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{s.sid.slice(0, 8)}…</td>
                <td style={{ fontSize: 12, color: 'var(--muted)' }}>{s.uid ?? '—'}</td>
                <td>{fmtTime(s.started)}</td>
                <td className="col-r">{fmtDuration(s.duration)}</td>
                <td className="col-r">{s.urlCount}</td>
                <td className="col-r">{s.eventCount.toLocaleString()}</td>
                <td>
                  {s.hasReplay
                    ? <button className="play-btn" onClick={() => onReplay(s.sid)}>Play</button>
                    : <span className="badge badge-gray">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
