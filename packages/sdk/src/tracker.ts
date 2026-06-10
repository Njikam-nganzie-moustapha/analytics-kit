import type { TrackerConfig, AnalyticsEvent, PushFn, UserContext } from './types'
import { generateId, viewport } from './utils'
import { Transport } from './transport'
import { startMouseTracking, stopMouseTracking } from './mouse'
import { startErrorTracking, stopErrorTracking } from './errors'
import { startVitalsTracking } from './vitals'
import { startRageTracking } from './rage'
import { startRecorder, stopRecorder } from './recorder'
import { addBreadcrumb, clearBreadcrumbs } from './breadcrumbs'

let _transport: Transport | null = null
let _config: TrackerConfig | null = null
let _sessionId = ''
let _sessionStart = 0
let _initialized = false

export function init(cfg: TrackerConfig): void {
  // Guard: ne pas double-initialiser
  if (_initialized) return
  _initialized = true

  // Respecte le sampleRate — ex: 0.5 = 50% des sessions trackées
  if ((cfg.sampleRate ?? 1) < Math.random()) return

  _config = cfg
  _sessionId = generateId('sx')
  _sessionStart = Date.now()
  _transport = new Transport(cfg)

  const push = makePush()

  // Démarrer tous les modules
  startErrorTracking(push)
  startVitalsTracking(push)
  startRageTracking(push)
  startMouseTracking(cfg, push)

  if (cfg.replay !== false) {
    startRecorder(cfg, push)
  }

  // Session start
  push({
    type: 'session_start',
    url: location.href,
    referrer: document.referrer,
    ...viewport(),
    ua: navigator.userAgent.slice(0, 150),
  })

  // Page view initial
  addBreadcrumb({ category: 'navigation', message: location.href })
  push({ type: 'page_view', url: location.href, referrer: document.referrer })

  // Auto page load transaction
  if (cfg.tracing !== false) {
    autoPageLoad(push)
  }

  // SPA navigation — écoute pushState/replaceState
  patchHistory(push, cfg.tracing !== false)

  // Flush + session_end à la fermeture
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      push({ type: 'session_end', duration: Date.now() - _sessionStart })
      _transport?.flush(true)
    }
  })

  if (cfg.debug) console.log('[analytics-kit] init', { siteId: cfg.siteId, sessionId: _sessionId })
}

export function makePush(): PushFn {
  return function push(partial) {
    if (!_transport || !_config) return
    const env = _config.env && _config.env !== 'production' ? _config.env : undefined
    const event = {
      t: Date.now(),
      sid: _sessionId,
      site: env ? `${_config.siteId}:${env}` : _config.siteId,
      uid:        _config.userId,
      user_email: _config.userContext?.email,
      user_name:  _config.userContext?.name,
      env,
      release: _config.release,
      url: location.href,
      ...partial,
    } as unknown as AnalyticsEvent
    if (_config.debug) console.debug('[analytics-kit]', event.type, event)
    _transport.push(event)
  }
}

export function identify(userId: string, traits?: Record<string, unknown>): void {
  if (!_config) return
  _config.userId = userId
  makePush()({ type: 'identify', userId, ...traits })
}

export function setUser(user: string | UserContext, traits?: Record<string, unknown>): void {
  if (typeof user === 'string') {
    identify(user, traits)
  } else {
    if (!_config) return
    if (user.id) _config.userId = user.id
    _config.userContext = { ..._config.userContext, ...user }
    makePush()({ type: 'identify', userId: user.id ?? _config.userId, ...user, ...traits })
  }
}

export function setRelease(release: string): void {
  if (!_config) return
  _config.release = release
}

export function track(name: string, props?: Record<string, unknown>): void {
  makePush()({ type: 'custom', name, ...props })
}

export function startTransaction(name: string, op = 'custom'): {
  setName(n: string): void
  startSpan(spanOp: string, description?: string): { finish(): void }
  finish(): void
} {
  const push   = makePush()
  const spans: Array<{ op: string; description?: string; duration: number }> = []
  let txName   = name
  const start  = Date.now()

  return {
    setName(n: string) { txName = n },
    startSpan(spanOp: string, description?: string) {
      const spanStart = Date.now()
      return { finish() { spans.push({ op: spanOp, description, duration: Date.now() - spanStart }) } }
    },
    finish() {
      push({ type: 'transaction', name: txName, op, duration: Date.now() - start, spans })
    },
  }
}

export function destroy(): void {
  stopMouseTracking()
  stopErrorTracking()
  stopRecorder()
  clearBreadcrumbs()
  _transport?.destroy()
  _transport = null
  _initialized = false
}

// Intercepte pushState / replaceState pour SPA
function patchHistory(push: PushFn, tracing: boolean): void {
  const wrap = (orig: typeof history.pushState) =>
    function (this: History, ...args: Parameters<typeof history.pushState>) {
      orig.apply(this, args)
      addBreadcrumb({ category: 'navigation', message: location.href })
      push({ type: 'page_view', url: location.href })
      if (tracing) measureNavigation(push, location.href)
    }
  history.pushState = wrap(history.pushState)
  history.replaceState = wrap(history.replaceState)
  window.addEventListener('popstate', () => {
    addBreadcrumb({ category: 'navigation', message: location.href })
    push({ type: 'page_view', url: location.href })
    if (tracing) measureNavigation(push, location.href)
  })
}

// Measure SPA navigation duration — from route change to after-paint
function measureNavigation(push: PushFn, href: string): void {
  const start = Date.now()
  let pathname = href
  try { pathname = new URL(href).pathname } catch { /* keep href */ }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      push({ type: 'transaction', name: pathname, op: 'navigation', duration: Date.now() - start })
    })
  })
}

// Measure initial page load using Navigation Timing API
function autoPageLoad(push: PushFn): void {
  function measure(): void {
    let duration = 0
    const navEntries = performance.getEntriesByType('navigation')
    if (navEntries.length > 0) {
      const nav = navEntries[0] as PerformanceNavigationTiming
      duration = Math.round(nav.loadEventEnd - nav.startTime)
    } else if (performance.timing && performance.timing.loadEventEnd > 0) {
      duration = performance.timing.loadEventEnd - performance.timing.navigationStart
    }
    if (duration > 0 && duration < 120_000) {
      push({ type: 'transaction', name: location.pathname, op: 'pageload', duration })
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(measure, 0)
  } else {
    window.addEventListener('load', () => setTimeout(measure, 100), { once: true })
  }
}
