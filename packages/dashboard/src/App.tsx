import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HeatmapOverlay  } from './components/HeatmapOverlay'
import { ZoneStats       } from './components/ZoneStats'
import { SessionList     } from './components/SessionList'
import { ErrorList       } from './components/ErrorList'
import { CronMonitors    } from './components/CronMonitors'
import { ReplayModal     } from './components/ReplayModal'
import { LoginScreen     } from './components/LoginScreen'
import {
  fetchHeatmap, fetchZones, fetchSessions, fetchReplay,
  fetchErrors, fetchCronMonitors,
  authStatus, clearToken, getToken,
} from './api'
import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup, CronMonitor } from './types'

type Tab = 'heatmap' | 'zones' | 'sessions' | 'errors' | 'cron'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'heatmap',  label: 'Heatmap',  icon: '◈' },
  { id: 'zones',    label: 'Zones',    icon: '⊡' },
  { id: 'sessions', label: 'Sessions', icon: '◉' },
  { id: 'errors',   label: 'Errors',   icon: '⊘' },
  { id: 'cron',     label: 'Cron',     icon: '⏱' },
]

const contentVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0,  transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, y: -6, transition: { duration: 0.12 } },
}

export function App() {
  const [authChecked,   setAuthChecked]   = useState(false)
  const [authRequired,  setAuthRequired]  = useState(false)
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    authStatus()
      .then(({ required }) => {
        setAuthRequired(required)
        setAuthenticated(!required || getToken() !== '')
        setAuthChecked(true)
      })
      .catch(() => setAuthChecked(true))
  }, [])

  const KNOWN_SITES = (import.meta.env.VITE_SITE_KEYS ?? '')
    .split(',').map((s: string) => s.trim()).filter(Boolean)

  const [siteInput, setSiteInput] = useState(KNOWN_SITES[0] ?? '')
  const [urlInput,  setUrlInput]  = useState('')
  const [tab,  setTab]  = useState<Tab>('heatmap')
  const [query, setQuery] = useState({ site: '', url: '' })

  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [cells,    setCells]    = useState<HeatmapCell[]>([])
  const [zones,    setZones]    = useState<ZoneRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [errors,   setErrors]   = useState<ErrorGroup[]>([])
  const [monitors, setMonitors] = useState<CronMonitor[]>([])

  const [replaySid,     setReplaySid]     = useState('')
  const [replayEvents,  setReplayEvents]  = useState<unknown[]>([])
  const [replayLoading, setReplayLoading] = useState(false)

  async function openReplay(sid: string) {
    setReplaySid(sid); setReplayLoading(true)
    try   { setReplayEvents(await fetchReplay(sid)) }
    catch { setReplayEvents([]) }
    finally { setReplayLoading(false) }
  }

  function closeReplay() { setReplaySid(''); setReplayEvents([]) }

  const load = useCallback(async (q: { site: string; url: string }, t: Tab) => {
    if (!q.site) return
    setLoading(true)
    setError('')
    try {
      if (t === 'heatmap')  setCells(await fetchHeatmap(q.site, q.url || undefined))
      if (t === 'zones')    setZones(await fetchZones(q.site, q.url || undefined))
      if (t === 'sessions') setSessions(await fetchSessions(q.site, { limit: 200 }))
      if (t === 'errors')   setErrors(await fetchErrors(q.site, { limit: 200 }))
      if (t === 'cron')     setMonitors(await fetchCronMonitors(q.site))
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 401) {
        setAuthenticated(false)
        return
      }
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (query.site) load(query, tab)
  }, [tab, query, load])

  function handleLoad() {
    const q = { site: siteInput.trim(), url: urlInput.trim() }
    setQuery(q)
    load(q, tab)
  }

  // Optimistic update for error status/assignee changes
  function handleErrorUpdate(fp: string, update: Partial<ErrorGroup>) {
    setErrors(prev => prev.map(e => e.fingerprint === fp ? { ...e, ...update } : e))
  }

  function renderContent() {
    if (loading) return (
      <div className="loading">
        <motion.div
          style={{ width: 30, height: 30, borderRadius: '50%', border: '2px solid var(--border-2)', borderTopColor: 'var(--accent)' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.65, repeat: Infinity, ease: 'linear' }}
        />
        <span>Loading…</span>
      </div>
    )
    if (error) return (
      <div className="empty">
        <span className="empty-title" style={{ color: 'var(--error)' }}>Request failed</span>
        <span>{error}</span>
      </div>
    )
    if (tab === 'heatmap')  return <HeatmapOverlay cells={cells} />
    if (tab === 'zones')    return <ZoneStats zones={zones} />
    if (tab === 'sessions') return <SessionList sessions={sessions} onReplay={openReplay} />
    if (tab === 'errors')   return (
      <ErrorList errors={errors} site={query.site} onUpdate={handleErrorUpdate} />
    )
    if (tab === 'cron') return (
      <CronMonitors
        monitors={monitors}
        site={query.site}
        onDelete={id => setMonitors(prev => prev.filter(m => m.monitorId !== id))}
      />
    )
  }

  if (!authChecked) return null

  if (authRequired && !authenticated) {
    return <LoginScreen onSuccess={() => setAuthenticated(true)} />
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <span className="header-logo">analytics<span>kit</span></span>
        <div className="header-form">
          <input
            className="input input-site"
            placeholder="site ID"
            value={siteInput}
            onChange={e => setSiteInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
          />
          <input
            className="input input-url"
            placeholder="/url (optional)"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
          />
          <button
            className="btn"
            onClick={handleLoad}
            disabled={!siteInput.trim() || loading}
          >
            Load
          </button>
          {authRequired && (
            <button
              className="btn btn-ghost"
              onClick={() => { clearToken(); setAuthenticated(false) }}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {/* Site quick-select chips */}
      {KNOWN_SITES.length > 0 && (
        <div className="site-chips">
          {KNOWN_SITES.map((s: string) => (
            <button
              key={s}
              className={`site-chip ${siteInput === s ? 'active' : ''}`}
              onClick={() => setSiteInput(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <nav className="tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            <span className="tab-icon">{t.icon}</span>
            {t.label}
            {tab === t.id && (
              <motion.span
                className="tab-indicator"
                layoutId="tab-indicator"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="content">
        {!query.site ? (
          <div className="empty">
            <span className="empty-title">No site loaded</span>
            <span>Enter a site ID above and press Load.</span>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${query.site}--${tab}`}
              variants={contentVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {replaySid && (
        <ReplayModal
          sid={replaySid}
          events={replayEvents}
          loading={replayLoading}
          onClose={closeReplay}
        />
      )}
    </div>
  )
}
