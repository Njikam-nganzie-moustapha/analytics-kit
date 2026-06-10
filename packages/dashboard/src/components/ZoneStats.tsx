import { useState } from 'react'
import { motion } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'
import type { ZoneRow } from '../types'

type SortKey = 'enters' | 'clicks' | 'ctr' | 'avgDwell'
type Dir     = 'desc' | 'asc'

interface Props { zones: ZoneRow[] }

const tbody = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.025, delayChildren: 0.04 } },
}
const row = {
  hidden: { opacity: 0, y: 5 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
}

export function ZoneStats({ zones }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('enters')
  const [dir,     setDir]     = useState<Dir>('desc')

  if (zones.length === 0) {
    return (
      <div className="empty">
        <span className="empty-title">No zone data</span>
        <span>Add data-zone attributes to your HTML elements to track them.</span>
      </div>
    )
  }

  function toggleSort(k: SortKey) {
    if (k === sortKey) setDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(k); setDir('desc') }
  }

  const rows = [...zones]
    .map(z => ({ ...z, ctr: z.enters > 0 ? z.clicks / z.enters : 0 }))
    .sort((a, b) => {
      const sign = dir === 'desc' ? -1 : 1
      return (a[sortKey] - b[sortKey]) * sign
    })

  const maxCtr      = Math.max(...rows.map(r => r.ctr), 0.001)
  const totalEnters = zones.reduce((s, z) => s + z.enters, 0)
  const totalClicks = zones.reduce((s, z) => s + z.clicks, 0)
  const avgDwellAll = zones.length
    ? zones.reduce((s, z) => s + z.avgDwell, 0) / zones.length
    : 0
  const overallCtr  = totalEnters > 0 ? totalClicks / totalEnters : 0

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
          { label: 'Zones',        value: zones.length,  fmt: undefined },
          { label: 'Total enters', value: totalEnters,   fmt: undefined },
          { label: 'Total clicks', value: totalClicks,   fmt: undefined },
          { label: 'Overall CTR',  value: Math.round(overallCtr * 1000) / 10, fmt: (n: number) => `${n.toFixed(1)}%` },
          { label: 'Avg dwell',    value: Math.round(avgDwellAll / 100) / 10, fmt: (n: number) => `${n.toFixed(1)}s` },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.28, ease: 'easeOut' }}
          >
            <div className="stat-value">
              <AnimatedNumber value={s.value} format={s.fmt} />
            </div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
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
              <Th k="avgDwell" label="Avg dwell" right />
            </tr>
          </thead>
          <motion.tbody variants={tbody} initial="hidden" animate="show">
            {rows.map((z, i) => (
              <motion.tr key={i} variants={row}>
                <td><span className="badge badge-blue">{z.zoneId}</span></td>
                <td><span className="url-chip" title={z.url}>{z.url}</span></td>
                <td className="col-r">{z.enters.toLocaleString()}</td>
                <td className="col-r">{z.clicks.toLocaleString()}</td>
                <td className="col-r">
                  <div className="prog-wrap">
                    <div className="prog-bar">
                      <div
                        className={`prog-fill ${z.ctr > 0.15 ? 'accent' : ''}`}
                        style={{ width: `${(z.ctr / maxCtr) * 100}%` }}
                      />
                    </div>
                    <span style={{ minWidth: 36, fontSize: 12 }}>
                      {(z.ctr * 100).toFixed(1)}%
                    </span>
                  </div>
                </td>
                <td className="col-r" style={{ color: 'var(--text-2)' }}>
                  {(z.avgDwell / 1000).toFixed(2)}s
                </td>
              </motion.tr>
            ))}
          </motion.tbody>
        </table>
      </div>
    </div>
  )
}
