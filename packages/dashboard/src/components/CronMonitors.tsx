import { useState } from 'react'
import { motion } from 'framer-motion'
import type { CronMonitor } from '../types'
import { deleteCronMonitor } from '../api'

interface Props {
  monitors: CronMonitor[]
  site: string
  onDelete: (id: string) => void
}

function formatInterval(ms: number): string {
  if (ms < 60_000)   return `${ms / 1000}s`
  if (ms < 3_600_000) return `${ms / 60_000}m`
  return `${ms / 3_600_000}h`
}

function timeAgo(ms: number | null): string {
  if (ms == null) return 'never'
  const s = (Date.now() - ms) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

const STATUS_CFG = {
  ok:      { dot: 'dot-green',  label: 'healthy'  },
  late:    { dot: 'dot-warn',   label: 'late'     },
  missing: { dot: 'dot-red',    label: 'missing'  },
}

export function CronMonitors({ monitors, site, onDelete }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteCronMonitor(id, site)
      onDelete(id)
    } finally {
      setDeleting(null)
    }
  }

  if (monitors.length === 0) {
    return (
      <div>
        <div className="empty" style={{ height: 180 }}>
          <span className="empty-title">No cron monitors</span>
          <span>Send a checkin from your cron job to start monitoring.</span>
        </div>
        <div className="cron-snippet-wrap">
          <p className="cron-snippet-title">Integration</p>
          <pre className="cron-snippet">{`# Add to your cron job — replace YOUR_SITE and JOB_NAME
curl -X POST "https://<query-api>/cron/checkin?\\
  monitor=YOUR_SITE-JOB_NAME&\\
  site=YOUR_SITE&\\
  interval=300000&\\
  grace=60000" \\
  -H "X-Api-Key: <your-key>"`}</pre>
        </div>
      </div>
    )
  }

  const healthy = monitors.filter(m => m.status === 'ok').length
  const late    = monitors.filter(m => m.status === 'late').length
  const missing = monitors.filter(m => m.status === 'missing').length

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Monitors',  value: monitors.length },
          { label: 'Healthy',   value: healthy,  color: healthy > 0 ? 'var(--success)' : undefined },
          { label: 'Late',      value: late,     color: late > 0    ? 'var(--warn)'    : undefined },
          { label: 'Missing',   value: missing,  color: missing > 0 ? 'var(--error)'   : undefined },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.28 }}
          >
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="cron-list">
        {monitors.map((m, i) => {
          const cfg = STATUS_CFG[m.status]
          return (
            <motion.div
              key={m.monitorId}
              className="cron-card"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
            >
              <div className="cron-card-header">
                <span className={`cron-dot ${cfg.dot}`} title={cfg.label} />
                <span className="cron-id">{m.monitorId}</span>
                <span className={`badge ${m.status === 'ok' ? 'badge-green' : m.status === 'late' ? 'badge-warn' : 'badge-red'}`}>
                  {cfg.label}
                </span>
                <button
                  className="cron-delete-btn"
                  title="Remove monitor"
                  disabled={deleting === m.monitorId}
                  onClick={() => handleDelete(m.monitorId)}
                >
                  ✕
                </button>
              </div>
              <div className="cron-card-body">
                <span className="cron-meta">Expected every <strong>{formatInterval(m.intervalMs)}</strong></span>
                <span className="cron-meta">Grace <strong>{formatInterval(m.graceMs)}</strong></span>
                <span className="cron-meta" style={{ marginLeft: 'auto' }}>
                  Last checkin: <strong>{timeAgo(m.lastCheckin)}</strong>
                </span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
