import { useState, useEffect, useCallback } from 'react'
import { HeatmapOverlay } from './components/HeatmapOverlay'
import { ZoneStats      } from './components/ZoneStats'
import { SessionList    } from './components/SessionList'
import { ReplayModal    } from './components/ReplayModal'
import { fetchHeatmap, fetchZones, fetchSessions, fetchReplay } from './api'
import type { HeatmapCell, ZoneRow, SessionRow } from './types'

type Tab = 'heatmap' | 'zones' | 'sessions'

export function App() {
  const [siteInput, setSiteInput] = useState('')
  const [urlInput,  setUrlInput]  = useState('')
  const [tab,  setTab]  = useState<Tab>('heatmap')

  // Committed query — only updates on Load click
  const [query, setQuery] = useState({ site: '', url: '' })

  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')
  const [cells,    setCells]    = useState<HeatmapCell[]>([])
  const [zones,    setZones]    = useState<ZoneRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])

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
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  // Refetch when tab changes (if query is set)
  useEffect(() => {
    if (query.site) load(query, tab)
  }, [tab, query, load])

  function handleLoad() {
    const q = { site: siteInput.trim(), url: urlInput.trim() }
    setQuery(q)
    load(q, tab)
  }

  function handleTabChange(t: Tab) {
    setTab(t)
  }

  function renderContent() {
    if (loading) return <div className="loading">Loading…</div>
    if (error)   return <div className="empty" style={{ color: '#f87171' }}>Error: {error}</div>
    if (tab === 'heatmap')  return <HeatmapOverlay cells={cells} />
    if (tab === 'zones')    return <ZoneStats zones={zones} />
    if (tab === 'sessions') return <SessionList sessions={sessions} onReplay={openReplay} />
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
          <input
            className="input input-url"
            placeholder="/url (optional)"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLoad()}
          />
          <button className="btn" onClick={handleLoad} disabled={!siteInput.trim() || loading}>
            Load
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(['heatmap', 'zones', 'sessions'] as Tab[]).map(t => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => handleTabChange(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      <main className="content">
        {!query.site
          ? <div className="empty">Enter a site ID above and click Load.</div>
          : renderContent()
        }
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
