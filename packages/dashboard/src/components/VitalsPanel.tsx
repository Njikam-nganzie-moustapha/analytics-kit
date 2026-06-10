import { motion } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'
import type { VitalRow } from '../types'

interface Props { vitals: VitalRow[] }

const METRIC_META: Record<string, { label: string; unit: string; desc: string }> = {
  lcp:  { label: 'LCP',  unit: 'ms',  desc: 'Largest Contentful Paint' },
  fcp:  { label: 'FCP',  unit: 'ms',  desc: 'First Contentful Paint'   },
  fid:  { label: 'FID',  unit: 'ms',  desc: 'First Input Delay'         },
  ttfb: { label: 'TTFB', unit: 'ms',  desc: 'Time to First Byte'        },
  cls:  { label: 'CLS',  unit: '',    desc: 'Cumulative Layout Shift'   },
}

const METRIC_ORDER = ['lcp', 'fcp', 'fid', 'ttfb', 'cls']

function overallRating(good: number, needsImp: number, poor: number): 'good' | 'needs-improvement' | 'poor' {
  const total = good + needsImp + poor || 1
  if (poor / total > 0.25)    return 'poor'
  if (needsImp / total > 0.5) return 'needs-improvement'
  return 'good'
}

const RATING_STYLE = {
  'good':             { dot: '#22c55e', label: 'Good' },
  'needs-improvement':{ dot: '#fb923c', label: 'Needs improvement' },
  'poor':             { dot: '#f87171', label: 'Poor' },
}

interface MetricCardProps { row: VitalRow; idx: number }

function MetricCard({ row, idx }: MetricCardProps) {
  const meta   = METRIC_META[row.metric] ?? { label: row.metric.toUpperCase(), unit: '', desc: '' }
  const total  = row.good + row.needsImp + row.poor || 1
  const rating = overallRating(row.good, row.needsImp, row.poor)
  const rs     = RATING_STYLE[rating]

  const goodPct    = Math.round(row.good / total * 100)
  const needsImpPct = Math.round(row.needsImp / total * 100)
  const poorPct    = 100 - goodPct - needsImpPct

  const isCls = row.metric === 'cls'

  return (
    <motion.div
      className="vital-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.06, duration: 0.25 }}
    >
      <div className="vital-card-header">
        <div>
          <span className="vital-label">{meta.label}</span>
          <span className="vital-desc">{meta.desc}</span>
        </div>
        <div className="vital-rating">
          <span className="vital-dot" style={{ background: rs.dot }} />
          <span className="vital-rating-label" style={{ color: rs.dot }}>{rs.label}</span>
        </div>
      </div>

      {/* Avg value */}
      <div className="vital-avg">
        <AnimatedNumber
          value={isCls ? Math.round(row.avg * 1000) / 1000 : Math.round(row.avg)}
          format={n => isCls ? (n / 1000).toFixed(3) : n.toLocaleString()}
        />
        <span className="vital-unit">{meta.unit}</span>
        <span className="vital-samples">avg · {row.total.toLocaleString()} samples</span>
      </div>

      {/* Distribution bar */}
      <div className="vital-bar-wrap">
        <div
          className="vital-bar-seg"
          style={{ width: `${goodPct}%`, background: '#22c55e' }}
          title={`Good: ${goodPct}%`}
        />
        <div
          className="vital-bar-seg"
          style={{ width: `${needsImpPct}%`, background: '#fb923c' }}
          title={`Needs improvement: ${needsImpPct}%`}
        />
        <div
          className="vital-bar-seg"
          style={{ width: `${poorPct}%`, background: '#f87171' }}
          title={`Poor: ${poorPct}%`}
        />
      </div>

      {/* Legend */}
      <div className="vital-legend">
        {[
          { label: 'Good',    pct: goodPct,     color: '#22c55e' },
          { label: 'Needs work', pct: needsImpPct, color: '#fb923c' },
          { label: 'Poor',    pct: poorPct,     color: '#f87171' },
        ].map(l => (
          <span key={l.label} className="vital-legend-item">
            <span className="vital-dot" style={{ background: l.color, width: 7, height: 7 }} />
            {l.label} {l.pct}%
          </span>
        ))}
      </div>
    </motion.div>
  )
}

export function VitalsPanel({ vitals }: Props) {
  if (vitals.length === 0) {
    return (
      <div className="empty">
        <span className="empty-title">No vitals recorded yet</span>
        <span>Core Web Vitals are captured automatically by the SDK (LCP, FCP, FID, CLS, TTFB).</span>
      </div>
    )
  }

  // Aggregate across all URLs for a site-wide view
  const byMetric = new Map<string, VitalRow>()
  for (const r of vitals) {
    const hit = byMetric.get(r.metric)
    if (hit) {
      hit.good     += r.good
      hit.needsImp += r.needsImp
      hit.poor     += r.poor
      hit.avg       = (hit.avg * hit.total + r.avg * r.total) / (hit.total + r.total)
      hit.total    += r.total
    } else {
      byMetric.set(r.metric, { ...r })
    }
  }

  const ordered = METRIC_ORDER
    .map(m => byMetric.get(m))
    .filter((r): r is VitalRow => r !== undefined)

  return (
    <div>
      <div className="vital-grid">
        {ordered.map((row, i) => (
          <MetricCard key={row.metric} row={row} idx={i} />
        ))}
      </div>
    </div>
  )
}
