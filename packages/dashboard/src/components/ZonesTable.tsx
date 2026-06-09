import { useState } from 'react'
import type { ZoneRow } from '../types'

type Col = keyof ZoneRow
type Dir = 1 | -1

export function ZonesTable({ zones }: { zones: ZoneRow[] }) {
  const [sort, setSort] = useState<{ col: Col; dir: Dir }>({ col: 'enters', dir: -1 })

  if (zones.length === 0) return <div className="empty">No zone data for this site.</div>

  function toggle(col: Col) {
    setSort(s => s.col === col ? { col, dir: -s.dir as Dir } : { col, dir: -1 })
  }

  const sorted = [...zones].sort((a, b) => {
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

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <Th col="zoneId" label="Zone" />
            <Th col="url"    label="URL" />
            <Th col="enters" label="Enters" />
            <Th col="clicks" label="Clicks" />
            <Th col="avgDwell" label="Avg Dwell" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((z, i) => (
            <tr key={i}>
              <td><span className="badge badge-blue">{z.zoneId}</span></td>
              <td><span className="url-chip">{z.url}</span></td>
              <td className="col-r">{z.enters.toLocaleString()}</td>
              <td className="col-r">{z.clicks.toLocaleString()}</td>
              <td className="col-r">{z.avgDwell.toFixed(1)}s</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
