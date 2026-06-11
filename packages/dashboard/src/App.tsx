import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HeatmapOverlay  } from './components/HeatmapOverlay'
import { ZoneStats       } from './components/ZoneStats'
import { SessionList     } from './components/SessionList'
import { ErrorList       } from './components/ErrorList'
import { CronMonitors    } from './components/CronMonitors'
import { SourceMapsTab   } from './components/SourceMapsTab'
import { VitalsPanel     } from './components/VitalsPanel'
import { OverviewPanel   } from './components/OverviewPanel'
import { ReleasesTab       } from './components/ReleasesTab'
import { PerformancePanel  } from './components/PerformancePanel'
import { FeedbackList      } from './components/FeedbackList'
import { ReplayModal     } from './components/ReplayModal'
import { LoginScreen     } from './components/LoginScreen'
import {
  fetchHeatmap, fetchZones, fetchSessions, fetchReplay,
  fetchErrors, fetchCronMonitors, fetchVitals,
  authStatus, clearToken, getToken,
} from './api'
import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup, CronMonitor, VitalRow } from './types'

type Tab = 'overview' | 'heatmap' | 'zones' | 'sessions' | 'errors' | 'releases' | 'performance' | 'vitals' | 'cron' | 'sourcemaps' | 'feedback'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview',     label: 'Overview',     icon: '⬡' },
  { id: 'heatmap',      label: 'Heatmap',      icon: '◈' },
  { id: 'zones',        label: 'Zones',        icon: '⊡' },
  { id: 'sessions',     label: 'Sessions',     icon: '◉' },
  { id: 'errors',       label: 'Errors',       icon: '⊘' },
  { id: 'feedback',     label: 'Feedback',     icon: '✦' },
  { id: 'releases',     label: 'Releases',     icon: '⊛' },
  { id: 'performance',  label: 'Performance',  icon: '◎' },
  { id: 'vitals',       label: 'Vitals',       icon: '♡' },
  { id: 'cron',         label: 'Cron',         icon: '⏱' },
  { id: 'sourcemaps',   label: 'Source Maps',  icon: '⊞' },
]

const contentVariants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
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
  const [envInput,  setEnvInput]  = useState('production')
  const [tab,  setTab]  = useState<Tab>('overview')
  const [query, setQuery] = useState({ site: '', url: '' })

  const [loading,  setLoading]  = useState(false)
  const [loadError, setLoadError] = useState('')

  const [cells,    setCells]    = useState<HeatmapCell[]>([])
  const [zones,    setZones]    = useState<ZoneRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [errors,   setErrors]   = useState<ErrorGroup[]>([])
  const [monitors, setMonitors] = useState<CronMonitor[]>([])
  const [vitals,   setVitals]   = useState<VitalRow[]>([])

  // For overview, prefetch sessions + errors + vitals in parallel
  const [overviewReady, setOverviewReady] = useState(false)

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
    setLoadError('')
    try {
      if (t === 'overview') {
        const [s, e, v] = await Promise.all([
          fetchSessions(q.site, { limit: 200 }),
          fetchErrors(q.site, { limit: 200 }),
          fetchVitals(q.site),
        ])
        setSessions(s); setErrors(e); setVitals(v)
        setOverviewReady(true)
      }
      if (t === 'heatmap')  setCells(await fetchHeatmap(q.site, q.url || undefined))
      if (t === 'zones')    setZones(await fetchZones(q.site, q.url || undefined))
      if (t === 'sessions') setSessions(await fetchSessions(q.site, { limit: 200 }))
      if (t === 'errors')   setErrors(await fetchErrors(q.site, { limit: 200 }))
      if (t === 'vitals')   setVitals(await fetchVitals(q.site, q.url || undefined))
      if (t === 'cron')        setMonitors(await fetchCronMonitors(q.site))
      // sourcemaps tab fetches its own data internally (no global state needed)
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 401) { setAuthenticated(false); return }
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (query.site) load(query, tab)
  }, [tab, query, load])

  function effectiveSite(): string {
    const s = siteInput.trim()
    const e = envInput.trim()
    return e && e !== 'production' ? `${s}:${e}` : s
  }

  function handleLoad() {
    const q = { site: effectiveSite(), url: urlInput.trim() }
    setQuery(q)
    load(q, tab)
  }

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
    if (loadError) return (
      <div className="empty">
        <span className="empty-title" style={{ color: 'var(--error)' }}>Request failed</span>
        <span>{loadError}</span>
      </div>
    )
    if (tab === 'overview') return (
      <OverviewPanel sessions={sessions} errors={errors} vitals={vitals} />
    )
    if (tab === 'heatmap')  return <HeatmapOverlay cells={cells} />
    if (tab === 'zones')    return <ZoneStats zones={zones} />
    if (tab === 'sessions') return <SessionList sessions={sessions} site={query.site} onReplay={openReplay} />
    if (tab === 'errors')   return (
      <ErrorList errors={errors} site={query.site} onUpdate={handleErrorUpdate} />
    )
    if (tab === 'vitals')   return <VitalsPanel vitals={vitals} />
    if (tab === 'cron')       return (
      <CronMonitors
        monitors={monitors}
        site={query.site}
        onDelete={id => setMonitors(prev => prev.filter(m => m.monitorId !== id))}
      />
    )
    if (tab === 'releases')    return <ReleasesTab site={query.site} />
    if (tab === 'performance') return <PerformancePanel site={query.site} url={query.url || undefined} />
    if (tab === 'feedback')    return <FeedbackList site={query.site} />
    if (tab === 'sourcemaps')  return <SourceMapsTab site={query.site} />
  }

  if (!authChecked) return null
  if (authRequired && !authenticated) {
    return <LoginScreen onSuccess={() => setAuthenticated(true)} />
  }

  return (
    <div className="app">
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
          <select
            className="input input-env"
            value={envInput}
            onChange={e => setEnvInput(e.target.value)}
            title="Environment"
          >
            <option value="production">production</option>
            <option value="staging">staging</option>
            <option value="development">development</option>
          </select>
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
