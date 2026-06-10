import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { PerfRow } from '../types'
import { fetchPerformance } from '../api'

interface Props { site: string; url?: string }

function fmtMs(ms: number): string {
  if (ms >= 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms >= 1000)   return `${(ms / 1000).toFixed(2)}s`
  return `${Math.round(ms)}ms`
}

function perfColor(p75: number): string {
  if (p75 < 1000) return '#22c55e'   // --success
  if (p75 < 3000) return '#fb923c'   // --warn
  return '#f87171'                    // --error
}

function perfLabel(p75: number): string {
  if (p75 < 1000) return 'fast'
  if (p75 < 3000) return 'ok'
  return 'slow'
}

export function PerformancePanel({ site, url }: Props) {
  const [rows,    setRows]    = useState<PerfRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  useEffect(() => {
    if (!site) return
    setLoading(true)
    setError('')
    fetchPerformance(site, url)
      .then(setRows)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [site, url])

  if (loading) return <div className="empty"><span>Loading performance data…</span></div>
  if (error) return (
    <div className="empty">
      <span className="empty-title" style={{ color: 'var(--error)' }}>Failed to load</span>
      <span>{error}</span>
    </div>
  )
  if (rows.length === 0) return (
    <div className="empty">
      <span className="empty-title">No transactions recorded</span>
      <span>Page load and SPA navigations are captured automatically. Custom spans require <code>startTransaction(name)</code>.</span>
    </div>
  )

  const maxP75     = Math.max(...rows.map(r => r.p75), 1)
  const slowCount  = rows.filter(r => r.p75 >= 3000).length
  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const avgAll     = rows.reduce((s, r) => s + r.avg * r.count, 0) / (totalCount || 1)

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Transactions',   value: totalCount.toLocaleString() },
          { label: 'URLs tracked',   value: rows.length.toLocaleString() },
          { label: 'Avg duration',   value: fmtMs(avgAll) },
          { label: 'Slow (p75 >3s)', value: slowCount.toLocaleString() },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.28, ease: 'easeOut' }}
          >
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>URL / Transaction</th>
              <th style={{ textAlign: 'right' }}>Samples</th>
              <th style={{ textAlign: 'right' }}>Avg</th>
              <th style={{ textAlign: 'right' }}>p50</th>
              <th style={{ textAlign: 'right' }}>p75</th>
              <th style={{ textAlign: 'right' }}>p95</th>
              <th>Performance</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const color = perfColor(r.p75)
              const pct   = Math.round((r.p75 / maxP75) * 100)
              return (
                <motion.tr
                  key={r.url}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02, duration: 0.18 }}
                >
                  <td className="perf-url">{r.url}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                    {r.count.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMs(r.avg)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmtMs(r.p50)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color }}>{fmtMs(r.p75)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{fmtMs(r.p95)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="perf-bar-bg">
                        <div className="perf-bar-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="perf-label" style={{ color }}>{perfLabel(r.p75)}</span>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
