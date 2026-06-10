import { motion } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'
import type { SessionRow, ErrorGroup, VitalRow } from '../types'

interface Props {
  sessions: SessionRow[]
  errors:   ErrorGroup[]
  vitals:   VitalRow[]
}

function MetaStat({ label, value, color, sub }: {
  label: string; value: number; color?: string; sub?: string
}) {
  return (
    <div className="stat-card">
      <div className="stat-value" style={{ color }}>
        <AnimatedNumber value={value} />
      </div>
      <div className="stat-label">{label}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function SparkBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ background: 'var(--surface-3)', borderRadius: 2, height: 4, width: '100%', overflow: 'hidden' }}>
      <motion.div
        style={{ height: '100%', borderRadius: 2, background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, pct)}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  )
}

const VITAL_THRESHOLDS: Record<string, { good: number; label: string; unit: string }> = {
  lcp:  { good: 2500, label: 'LCP',  unit: 'ms' },
  fcp:  { good: 1800, label: 'FCP',  unit: 'ms' },
  fid:  { good: 100,  label: 'FID',  unit: 'ms' },
  ttfb: { good: 800,  label: 'TTFB', unit: 'ms' },
}

export function OverviewPanel({ sessions, errors, vitals }: Props) {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  const sessionsToday   = sessions.filter(s => now - s.started < day).length
  const activeUsers     = new Set(sessions.filter(s => now - s.started < day).map(s => s.uid).filter(Boolean)).size
  const replaySessions  = sessions.filter(s => s.hasReplay).length
  const avgDuration     = sessions.length > 0
    ? Math.round(sessions.reduce((s, r) => s + r.duration, 0) / sessions.length / 1000)
    : 0

  const openErrors      = errors.filter(e => e.status === 'open' || e.status === 'regressed').length
  const errorRate       = sessions.length > 0 ? Math.round(openErrors / sessions.length * 100) : 0
  const regressedErrors = errors.filter(e => e.status === 'regressed').length

  // Vitals summary — aggregate good% for each metric
  const vitalsByMetric = new Map<string, VitalRow>()
  for (const v of vitals) {
    const hit = vitalsByMetric.get(v.metric)
    if (hit) {
      hit.good += v.good; hit.needsImp += v.needsImp; hit.poor += v.poor; hit.total += v.total
    } else { vitalsByMetric.set(v.metric, { ...v }) }
  }

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Total Sessions',   value: sessions.length,   sub: `${sessionsToday} today` },
          { label: 'Identified Users', value: activeUsers },
          { label: 'Avg Duration',     value: avgDuration,       sub: 'seconds' },
          { label: 'With Replay',      value: replaySessions },
          { label: 'Open Errors',      value: openErrors,        color: openErrors > 0 ? 'var(--error)' : undefined },
          { label: 'Error Rate',       value: errorRate,         sub: 'per session %', color: errorRate > 5 ? 'var(--error)' : undefined },
          { label: 'Regressed',        value: regressedErrors,   color: regressedErrors > 0 ? 'var(--warn)' : undefined },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
          >
            <MetaStat label={s.label} value={s.value} color={s.color} sub={s.sub} />
          </motion.div>
        ))}
      </div>

      {/* Vitals quick bars */}
      {vitalsByMetric.size > 0 && (
        <div className="overview-section">
          <h3 className="overview-section-title">Core Web Vitals — Good %</h3>
          <div className="overview-vitals">
            {['lcp', 'fcp', 'fid', 'ttfb'].map(m => {
              const v = vitalsByMetric.get(m)
              if (!v) return null
              const total   = v.good + v.needsImp + v.poor || 1
              const goodPct = Math.round(v.good / total * 100)
              const meta    = VITAL_THRESHOLDS[m]
              const color   = goodPct >= 75 ? '#22c55e' : goodPct >= 50 ? '#fb923c' : '#f87171'
              return (
                <div key={m} className="overview-vital-row">
                  <span className="overview-vital-label">{meta.label}</span>
                  <SparkBar pct={goodPct} color={color} />
                  <span className="overview-vital-pct" style={{ color }}>{goodPct}%</span>
                  <span className="overview-vital-avg">{Math.round(v.avg)}{meta.unit}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent errors */}
      {errors.length > 0 && (
        <div className="overview-section">
          <h3 className="overview-section-title">Top Errors</h3>
          <div className="overview-errors">
            {errors.filter(e => e.status === 'open' || e.status === 'regressed').slice(0, 5).map((e, i) => (
              <motion.div
                key={e.fingerprint}
                className="overview-error-row"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <span className={`badge ${e.eventType === 'network_error' ? 'badge-blue' : 'badge-red'}`} style={{ flexShrink: 0 }}>
                  {e.eventType === 'network_error' ? 'net' : 'js'}
                </span>
                <span className="overview-error-msg">{e.message}</span>
                <span className="overview-error-count">{e.count.toLocaleString()}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
