import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FeedbackItem } from '../types'
import { fetchFeedback } from '../api'

interface Props { site: string }

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function avatar(item: FeedbackItem): string {
  const name = item.name ?? item.email ?? item.uid ?? '?'
  return name[0].toUpperCase()
}

function avatarColor(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#22c55e', '#3b82f6']
  return colors[h % colors.length]
}

export function FeedbackList({ site }: Props) {
  const [items,    setItems]    = useState<FeedbackItem[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => {
    if (!site) return
    setLoading(true)
    setError('')
    fetchFeedback(site, { limit: 200 })
      .then(setItems)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [site])

  if (loading) return (
    <div className="empty"><span>Loading feedback…</span></div>
  )
  if (error) return (
    <div className="empty">
      <span className="empty-title" style={{ color: 'var(--error)' }}>Failed to load</span>
      <span>{error}</span>
    </div>
  )
  if (items.length === 0) return (
    <div className="empty">
      <span className="empty-title">No feedback yet</span>
      <span>
        Call <code>Tracker.showReportDialog()</code> in your app to let users submit feedback.
      </span>
    </div>
  )

  const withEmail  = items.filter(i => i.email).length
  const thisWeek   = items.filter(i => Date.now() - i.ts < 7 * 86400_000).length

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Total reports',   value: items.length },
          { label: 'With email',      value: withEmail },
          { label: 'This week',       value: thisWeek },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.28, ease: 'easeOut' }}
          >
            <div className="stat-value">{s.value.toLocaleString()}</div>
            <div className="stat-label">{s.label}</div>
          </motion.div>
        ))}
      </div>

      <div className="feedback-list">
        {items.map((item, i) => {
          const key     = item.id
          const isOpen  = expanded === key
          const ident   = item.name ?? item.email ?? item.uid ?? 'Anonymous'
          const color   = avatarColor(ident)

          return (
            <motion.div
              key={key}
              className={`feedback-card ${isOpen ? 'feedback-card--open' : ''}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.025, duration: 0.2 }}
              onClick={() => setExpanded(isOpen ? null : key)}
            >
              <div className="feedback-row">
                <div className="feedback-avatar" style={{ background: color }}>
                  {avatar(item)}
                </div>

                <div className="feedback-body">
                  <div className="feedback-meta">
                    <span className="feedback-ident">{ident}</span>
                    {item.email && item.name && (
                      <span className="feedback-email">{item.email}</span>
                    )}
                    <span className="feedback-time" title={fmtDate(item.ts)}>
                      {timeAgo(item.ts)}
                    </span>
                    {item.url && (
                      <span className="feedback-url">{new URL(item.url).pathname}</span>
                    )}
                  </div>
                  <div className={`feedback-message ${isOpen ? '' : 'feedback-message--clamp'}`}>
                    {item.message}
                  </div>
                </div>

                <div className="feedback-actions">
                  <button
                    className="btn btn-xs btn-ghost"
                    onClick={e => {
                      e.stopPropagation()
                      setExpanded(isOpen ? null : key)
                    }}
                  >
                    {isOpen ? '▲' : '▼'}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    className="feedback-detail"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                  >
                    <div className="feedback-detail-inner">
                      {item.uid && (
                        <div className="feedback-kv">
                          <span className="feedback-k">User ID</span>
                          <span className="feedback-v feedback-mono">{item.uid}</span>
                        </div>
                      )}
                      {item.email && (
                        <div className="feedback-kv">
                          <span className="feedback-k">Email</span>
                          <a href={`mailto:${item.email}`} className="feedback-v feedback-link" onClick={e => e.stopPropagation()}>
                            {item.email}
                          </a>
                        </div>
                      )}
                      {item.url && (
                        <div className="feedback-kv">
                          <span className="feedback-k">Page</span>
                          <span className="feedback-v feedback-mono">{item.url.slice(0, 100)}</span>
                        </div>
                      )}
                      <div className="feedback-kv">
                        <span className="feedback-k">Session</span>
                        <span className="feedback-v feedback-mono">{item.sid}</span>
                      </div>
                      <div className="feedback-kv">
                        <span className="feedback-k">Submitted</span>
                        <span className="feedback-v">{fmtDate(item.ts)}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
