import { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SidebarNav } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { LoadingState, ErrorState, EmptyState, ComingSoon } from '@/components/shell/states'
import { SavedViewsBar } from '@/components/shell/SavedViewsBar'
import type { View } from '@/components/shell/nav'
import { viewLabel } from '@/components/shell/nav'
import { resolveRange, type RangeKey } from '@/timerange'
import { useBranding } from '@/branding'
import { LoginScreen } from './components/LoginScreen'

const HeatmapOverlay   = lazy(() => import('./components/HeatmapOverlay').then(m => ({ default: m.HeatmapOverlay })))
const ZoneStats        = lazy(() => import('./components/ZoneStats').then(m => ({ default: m.ZoneStats })))
const SessionList      = lazy(() => import('./components/SessionList').then(m => ({ default: m.SessionList })))
const ErrorList        = lazy(() => import('./components/ErrorList').then(m => ({ default: m.ErrorList })))
const CronMonitors     = lazy(() => import('./components/CronMonitors').then(m => ({ default: m.CronMonitors })))
const SourceMapsTab    = lazy(() => import('./components/SourceMapsTab').then(m => ({ default: m.SourceMapsTab })))
const VitalsPanel      = lazy(() => import('./components/VitalsPanel').then(m => ({ default: m.VitalsPanel })))
const OverviewView     = lazy(() => import('./components/overview/OverviewView').then(m => ({ default: m.OverviewView })))
const TrafficView      = lazy(() => import('./components/audience/TrafficView').then(m => ({ default: m.TrafficView })))
const GeoView          = lazy(() => import('./components/audience/GeoView').then(m => ({ default: m.GeoView })))
const DevicesView      = lazy(() => import('./components/audience/DevicesView').then(m => ({ default: m.DevicesView })))
const BotsView         = lazy(() => import('./components/audience/BotsView').then(m => ({ default: m.BotsView })))
const ConversionsView  = lazy(() => import('./components/conversions/ConversionsView').then(m => ({ default: m.ConversionsView })))
const FunnelsView      = lazy(() => import('./components/behavior/FunnelsView').then(m => ({ default: m.FunnelsView })))
const PagesView        = lazy(() => import('./components/behavior/PagesView').then(m => ({ default: m.PagesView })))
const SeoView          = lazy(() => import('./components/audit/SeoView').then(m => ({ default: m.SeoView })))
const PageSpeedView    = lazy(() => import('./components/audit/PageSpeedView').then(m => ({ default: m.PageSpeedView })))
const BrandingView     = lazy(() => import('./components/settings/BrandingView').then(m => ({ default: m.BrandingView })))
const ReleasesTab      = lazy(() => import('./components/ReleasesTab').then(m => ({ default: m.ReleasesTab })))
const PerformancePanel = lazy(() => import('./components/PerformancePanel').then(m => ({ default: m.PerformancePanel })))
const FeedbackList     = lazy(() => import('./components/FeedbackList').then(m => ({ default: m.FeedbackList })))
const AlertsTab        = lazy(() => import('./components/AlertsTab').then(m => ({ default: m.AlertsTab })))
const ReplayModal      = lazy(() => import('./components/ReplayModal').then(m => ({ default: m.ReplayModal })))
import {
  fetchHeatmap, fetchZones, fetchSessions, fetchReplay,
  fetchErrors, fetchCronMonitors, fetchVitals,
  fetchSites, authStatus, clearToken, getToken,
} from './api'
import type { HeatmapCell, ZoneRow, SessionRow, ErrorGroup, CronMonitor, VitalRow, SavedView } from './types'

const VIEWS_KEY = 'analyticskit_views'
const RANGE_KEY = 'analyticskit_range'

function loadViews(): SavedView[] {
  try { return JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]') } catch { return [] }
}
function saveViews(v: SavedView[]): void {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(v.slice(0, 12)))
}
function initialRange(): RangeKey {
  const r = localStorage.getItem(RANGE_KEY)
  return (['24h', '7d', '14d', '30d', '90d'].includes(r ?? '') ? r : '7d') as RangeKey
}

const contentVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.1 } },
}

export function App() {
  const [authChecked, setAuthChecked] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [availableSites, setAvailableSites] = useState<string[]>([])

  const [view, setView] = useState<View>('overview')
  const [site, setSite] = useState('')
  const [url, setUrl] = useState('')
  const [query, setQuery] = useState<{ site: string; url: string }>({ site: '', url: '' })
  const [range, setRange] = useState<RangeKey>(initialRange)
  const [mobileNav, setMobileNav] = useState(false)

  const [savedViews, setSavedViews] = useState<SavedView[]>(loadViews)
  const [refreshEvery, setRefreshEvery] = useState(0)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [zones, setZones] = useState<ZoneRow[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [errors, setErrors] = useState<ErrorGroup[]>([])
  const [monitors, setMonitors] = useState<CronMonitor[]>([])
  const [vitals, setVitals] = useState<VitalRow[]>([])

  const [replaySid, setReplaySid] = useState('')
  const [replayEvents, setReplayEvents] = useState<unknown[]>([])
  const [replayLoading, setReplayLoading] = useState(false)

  useEffect(() => {
    authStatus()
      .then(({ required }) => {
        setAuthRequired(required)
        const isAuth = !required || getToken() !== ''
        setAuthenticated(isAuth)
        setAuthChecked(true)
        if (isAuth) {
          fetchSites().then(sites => {
            setAvailableSites(sites)
            if (sites.length > 0) { setSite(sites[0]); setQuery({ site: sites[0], url: '' }) }
          })
        }
      })
      .catch(() => setAuthChecked(true))
  }, [])

  useEffect(() => { localStorage.setItem(RANGE_KEY, range) }, [range])

  async function openReplay(sid: string) {
    setReplaySid(sid); setReplayLoading(true)
    try { setReplayEvents(await fetchReplay(sid)) }
    catch { setReplayEvents([]) }
    finally { setReplayLoading(false) }
  }
  function closeReplay() { setReplaySid(''); setReplayEvents([]) }

  // Time-window start for the selected range — stable until the range changes.
  const from = useMemo(() => resolveRange(range).from, [range])

  // Views that fetch their own data (self-contained, range-aware).
  const SELF_FETCH: ReadonlySet<View> = useMemo(
    () => new Set<View>(['overview', 'traffic', 'geo', 'devices', 'conversions', 'funnels', 'seo', 'pagespeed', 'branding']), [])

  // White-label branding for the selected site (applies the primary colour).
  const { branding, reload: reloadBranding } = useBranding(query.site)

  const load = useCallback(async (q: { site: string; url: string }, v: View, silent = false) => {
    if (!q.site || SELF_FETCH.has(v)) return
    if (!silent) setLoading(true)
    setLoadError('')
    try {
      if (v === 'behavior') {
        const [c, z] = await Promise.all([
          fetchHeatmap(q.site, q.url || undefined),
          fetchZones(q.site, q.url || undefined),
        ])
        setCells(c); setZones(z)
      }
      if (v === 'sessions') setSessions(await fetchSessions(q.site, { limit: 200 }))
      if (v === 'errors') setErrors(await fetchErrors(q.site, { limit: 200 }))
      if (v === 'performance') setVitals(await fetchVitals(q.site, q.url || undefined))
      if (v === 'cron') setMonitors(await fetchCronMonitors(q.site))
      setLastRefreshed(new Date())
    } catch (e: unknown) {
      if ((e as { status?: number }).status === 401) { setAuthenticated(false); return }
      setLoadError(String(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [SELF_FETCH])

  useEffect(() => { if (query.site) load(query, view) }, [view, query, load])

  useEffect(() => {
    if (refreshRef.current) clearInterval(refreshRef.current)
    if (!refreshEvery || !query.site) return
    refreshRef.current = setInterval(() => load(query, view, true), refreshEvery * 1000)
    return () => { if (refreshRef.current) clearInterval(refreshRef.current) }
  }, [refreshEvery, query, view, load])

  function selectSite(s: string) {
    setSite(s)
    const q = { site: s, url: url.trim() }
    setQuery(q)
  }

  function handleErrorUpdate(fp: string, update: Partial<ErrorGroup>) {
    setErrors(prev => prev.map(e => e.fingerprint === fp ? { ...e, ...update } : e))
  }

  function saveView() {
    if (!site.trim()) return
    const label = `${site}${url ? ` ${url}` : ''} → ${viewLabel(view)}`
    const v: SavedView = { id: `${Date.now()}`, label, site, env: 'production', url, tab: view }
    const next = [v, ...savedViews.filter(x => x.label !== label)].slice(0, 12)
    setSavedViews(next); saveViews(next)
  }
  function removeView(id: string) {
    const next = savedViews.filter(v => v.id !== id)
    setSavedViews(next); saveViews(next)
  }
  function applyView(v: SavedView) {
    setSite(v.site); setUrl(v.url); setView(v.tab as View)
    setQuery({ site: v.site, url: v.url })
  }

  function renderContent() {
    if (loading) return <LoadingState />
    if (loadError) return <ErrorState message={loadError} onRetry={() => load(query, view)} />

    switch (view) {
      case 'overview': return <OverviewView site={query.site} from={from} />
      case 'traffic': return <TrafficView site={query.site} from={from} />
      case 'geo': return <GeoView site={query.site} />
      case 'devices': return <DevicesView site={query.site} />
      case 'bots': return <BotsView site={query.site} />
      case 'conversions': return <ConversionsView site={query.site} from={from} />
      case 'pages': return <PagesView site={query.site} from={from} />
      case 'funnels': return <FunnelsView site={query.site} from={from} />
      case 'seo': return <SeoView />
      case 'pagespeed': return <PageSpeedView />
      case 'branding': return <BrandingView site={query.site} onSaved={reloadBranding} />
      case 'behavior': return (
        <div className="space-y-6">
          <HeatmapOverlay cells={cells} />
          <ZoneStats zones={zones} />
        </div>
      )
      case 'sessions': return <SessionList sessions={sessions} site={query.site} onReplay={openReplay} />
      case 'errors': return <ErrorList errors={errors} site={query.site} onUpdate={handleErrorUpdate} />
      case 'performance': return (
        <div className="space-y-6">
          <VitalsPanel vitals={vitals} />
          <PerformancePanel site={query.site} url={query.url || undefined} />
        </div>
      )
      case 'releases': return <ReleasesTab site={query.site} />
      case 'sourcemaps': return <SourceMapsTab site={query.site} />
      case 'cron': return (
        <CronMonitors monitors={monitors} site={query.site}
          onDelete={id => setMonitors(prev => prev.filter(m => m.monitorId !== id))} />
      )
      case 'alerts': return <AlertsTab site={query.site} />
      case 'feedback': return <FeedbackList site={query.site} />
      default: return <ComingSoon title={viewLabel(view)} />
    }
  }

  if (!authChecked) return null
  if (authRequired && !authenticated) return <LoginScreen onSuccess={() => setAuthenticated(true)} />

  return (
    <div className="flex h-dvh flex-col">
      <div className="flex flex-1 overflow-hidden">
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
          <SidebarNav active={view} onSelect={setView} brandName={branding?.productName} brandLogo={branding?.logoUrl} />
        </aside>

        <Sheet open={mobileNav} onOpenChange={setMobileNav}>
          <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
            <SidebarNav active={view} onSelect={setView} onNavigate={() => setMobileNav(false)} brandName={branding?.productName} brandLogo={branding?.logoUrl} />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            view={view}
            sites={availableSites}
            site={site}
            onSite={selectSite}
            url={url}
            onUrl={setUrl}
            range={range}
            onRange={setRange}
            refreshEvery={refreshEvery}
            onRefreshEvery={setRefreshEvery}
            lastRefreshed={lastRefreshed}
            onSaveView={saveView}
            authRequired={authRequired}
            onSignOut={() => { clearToken(); setAuthenticated(false) }}
            onMenu={() => setMobileNav(true)}
          />

          <main className="flex-1 overflow-y-auto p-4 md:p-6">
            {savedViews.length > 0 && (
              <SavedViewsBar views={savedViews} onApply={applyView} onRemove={removeView} />
            )}
            {!query.site ? (
              <EmptyState title="No site loaded" hint="Pick a site from the selector above to get started." />
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${query.site}--${view}`}
                  variants={contentVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                >
                  <Suspense fallback={<LoadingState />}>{renderContent()}</Suspense>
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>

      {replaySid && (
        <Suspense fallback={null}>
          <ReplayModal sid={replaySid} events={replayEvents} loading={replayLoading} onClose={closeReplay} />
        </Suspense>
      )}
    </div>
  )
}
