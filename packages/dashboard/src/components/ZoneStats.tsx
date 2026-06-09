import { useState } from 'react'
import type { ZoneRow } from '../types'

type SortKey = 'enters' | 'clicks' | 'ctr' | 'avgDwell'
type Dir = 'desc' | 'asc'

interface Props { zones: ZoneRow[] }

export function ZoneStats({ zones }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('enters')
  const [dir, setDir]         = useState<Dir>('desc')

  if (zones.length === 0) return <div className="empty">No zone data for this query.</div>

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setDir('desc') }
  }

  const rows = [...zones].map(z => ({ ...z, ctr: z.enters > 0 ? z.clicks / z.enters : 0 }))
  rows.sort((a, b) => {
    const sign = dir === 'desc' ? -1 : 1
    return (a[sortKey] - b[sortKey]) * sign
  })

  const totalEnters = zones.reduce((s, z) => s + z.enters, 0)
  const totalClicks = zones.reduce((s, z) => s + z.clicks, 0)
  const avgDwellAll = zones.length
    ? zones.reduce((s, z) => s + z.avgDwell, 0) / zones.length
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
        <div className="stat-card"><div className="stat-value">{zones.length}</div><div className="stat-label">Zones tracked</div></div>
        <div className="stat-card"><div className="stat-value">{totalEnters.toLocaleString()}</div><div className="stat-label">Total enters</div></div>
        <div className="stat-card"><div className="stat-value">{totalClicks.toLocaleString()}</div><div className="stat-label">Total clicks</div></div>
        <div className="stat-card"><div className="stat-value">{(avgDwellAll / 1000).toFixed(1)}s</div><div className="stat-label">Avg dwell</div></div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zone ID</th>
              <th>URL</th>
              <Th k="enters"   label="Enters"    right />
              <Th k="clicks"   label="Clicks"    right />
              <Th k="ctr"      label="CTR"       right />
              <Th k="avgDwell" label="Avg Dwell" right />
            </tr>
          </thead>
          <tbody>
            {rows.map((z, i) => (
              <tr key={i}>
                <td><span className="badge badge-blue">{z.zoneId}</span></td>
                <td><span className="url-chip" title={z.url}>{z.url}</span></td>
                <td className="col-r">{z.enters.toLocaleString()}</td>
                <td className="col-r">{z.clicks.toLocaleString()}</td>
                <td className="col-r">
                  <span className={`badge ${z.ctr > 0.2 ? 'badge-green' : 'badge-gray'}`}>
                    {(z.ctr * 100).toFixed(1)}%
                  </span>
                </td>
                <td className="col-r">{(z.avgDwell / 1000).toFixed(2)}s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
