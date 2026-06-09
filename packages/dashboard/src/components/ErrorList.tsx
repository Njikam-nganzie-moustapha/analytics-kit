import { useState } from 'react'
import type { ErrorGroup } from '../types'

interface Props { errors: ErrorGroup[] }

function timeAgo(ms: number): string {
  const s = (Date.now() - ms) / 1000
  if (s < 60)          return 'just now'
  if (s < 3600)        return `${Math.floor(s / 60)}m ago`
  if (s < 86400)       return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function TypeBadge({ type }: { type: string }) {
  const isNet = type === 'network_error'
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 7px',
      borderRadius: 4,
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.03em',
      background: isNet ? '#1e3a5f' : '#3b1f2b',
      color: isNet ? '#60a5fa' : '#f87171',
    }}>
      {isNet ? 'network' : 'js'}
    </span>
  )
}

export function ErrorList({ errors }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (errors.length === 0) {
    return <div className="empty">No errors recorded for this site.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '70px 1fr 64px 72px 90px',
        gap: '0 12px',
        padding: '6px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-muted, #6b7280)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        borderBottom: '1px solid var(--border)',
      }}>
        <span>Type</span>
        <span>Message</span>
        <span style={{ textAlign: 'right' }}>Events</span>
        <span style={{ textAlign: 'right' }}>Sessions</span>
        <span style={{ textAlign: 'right' }}>Last seen</span>
      </div>

      {errors.map(err => {
        const isOpen = expanded === err.fingerprint
        return (
          <div key={err.fingerprint} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Summary row */}
            <div
              onClick={() => setExpanded(isOpen ? null : err.fingerprint)}
              style={{
                display: 'grid',
                gridTemplateColumns: '70px 1fr 64px 72px 90px',
                gap: '0 12px',
                padding: '9px 12px',
                cursor: 'pointer',
                background: isOpen ? 'rgba(99,102,241,0.06)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => {
                if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
              }}
              onMouseLeave={e => {
                if (!isOpen) (e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              <span><TypeBadge type={err.eventType} /></span>
              <span style={{
                fontSize: 13,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                color: 'var(--text, #e2e8f0)',
              }}>
                {err.message}
              </span>
              <span style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#f87171' }}>
                {err.count.toLocaleString()}
              </span>
              <span style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-muted, #9ca3af)' }}>
                {err.sessions}
              </span>
              <span style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                {timeAgo(err.lastSeen)}
              </span>
            </div>

            {/* Expanded detail */}
            {isOpen && (
              <div style={{
                padding: '0 12px 14px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                {err.source && (
                  <div style={{ fontSize: 12, color: '#a5b4fc' }}>
                    <span style={{ color: 'var(--text-muted, #6b7280)', marginRight: 6 }}>source</span>
                    {err.source}
                  </div>
                )}
                <div style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)' }}>
                  <span style={{ marginRight: 6 }}>first seen</span>
                  {new Date(err.firstSeen).toLocaleString()}
                  <span style={{ margin: '0 10px' }}>·</span>
                  <span style={{ marginRight: 6 }}>last seen</span>
                  {new Date(err.lastSeen).toLocaleString()}
                </div>
                {err.stack && (
                  <pre style={{
                    margin: 0,
                    padding: '10px 12px',
                    background: 'rgba(0,0,0,0.35)',
                    borderRadius: 6,
                    fontSize: 11.5,
                    lineHeight: 1.6,
                    color: '#fca5a5',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    maxHeight: 260,
                    overflowY: 'auto',
                  }}>
                    {err.stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
