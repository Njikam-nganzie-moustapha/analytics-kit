import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { ReleaseRow } from '../types'
import { fetchReleases } from '../api'

interface Props { site: string }

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function ReleasesTab({ site }: Props) {
  const [releases, setReleases] = useState<ReleaseRow[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!site) return
    setLoading(true)
    setError('')
    fetchReleases(site)
      .then(setReleases)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [site])

  if (loading) return (
    <div className="empty"><span>Loading releases…</span></div>
  )
  if (error) return (
    <div className="empty">
      <span className="empty-title" style={{ color: 'var(--error)' }}>Failed to load</span>
      <span>{error}</span>
    </div>
  )
  if (releases.length === 0) return (
    <div className="empty">
      <span className="empty-title">No releases tracked</span>
      <span>Set a <code>release</code> in your SDK config to track versions.</span>
    </div>
  )

  const totalGroups = releases.reduce((s, r) => s + r.groups, 0)
  const totalEvents = releases.reduce((s, r) => s + r.events, 0)

  return (
    <div>
      <div className="stats-bar">
        {[
          { label: 'Releases',     value: releases.length },
          { label: 'Error groups', value: totalGroups },
          { label: 'Total events', value: totalEvents },
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

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Release</th>
              <th style={{ textAlign: 'right' }}>Error groups</th>
              <th style={{ textAlign: 'right' }}>Total events</th>
              <th style={{ textAlign: 'right' }}>% of groups</th>
              <th style={{ textAlign: 'right' }}>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {releases.map((r, i) => (
              <motion.tr
                key={r.release}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03, duration: 0.18 }}
              >
                <td>
                  <span className="release-tag">{r.release}</span>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error)' }}>
                  {r.groups.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                  {r.events.toLocaleString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                    <div className="rel-bar-bg">
                      <div
                        className="rel-bar-fill"
                        style={{ width: `${Math.round((r.groups / Math.max(totalGroups, 1)) * 100)}%` }}
                      />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 32, textAlign: 'right' }}>
                      {Math.round((r.groups / Math.max(totalGroups, 1)) * 100)}%
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
                  {timeAgo(r.lastSeen)}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
