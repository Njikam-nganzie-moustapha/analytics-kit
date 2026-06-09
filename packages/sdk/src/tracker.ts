import type { TrackerConfig, AnalyticsEvent, PushFn } from './types'
import { generateId, viewport } from './utils'
import { Transport } from './transport'
import { startMouseTracking, stopMouseTracking } from './mouse'
import { startErrorTracking, stopErrorTracking } from './errors'
import { startVitalsTracking } from './vitals'
import { startRageTracking } from './rage'
import { startRecorder, stopRecorder } from './recorder'

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
  push({ type: 'page_view', url: location.href, referrer: document.referrer })

  // SPA navigation — écoute pushState/replaceState
  patchHistory(push)

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
    // `partial` contient toujours `type` (garanti par PushFn)
    // L'assertion est nécessaire car TS perd le type à travers l'index signature [key:string]
    const event = {
      t: Date.now(),
      sid: _sessionId,
      site: _config.siteId,
      uid: _config.userId,
      url: location.href,   // captured at push time — correct for SPA
      ...partial,           // caller's url overrides (e.g. page_view passes its own)
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

export function track(name: string, props?: Record<string, unknown>): void {
  makePush()({ type: 'custom', name, ...props })
}

export function destroy(): void {
  stopMouseTracking()
  stopErrorTracking()
  stopRecorder()
  _transport?.destroy()
  _transport = null
  _initialized = false
}

// Intercepte pushState / replaceState pour SPA
function patchHistory(push: PushFn): void {
  const wrap = (orig: typeof history.pushState) =>
    function (this: History, ...args: Parameters<typeof history.pushState>) {
      orig.apply(this, args)
      push({ type: 'page_view', url: location.href })
    }
  history.pushState = wrap(history.pushState)
  history.replaceState = wrap(history.replaceState)
  window.addEventListener('popstate', () => push({ type: 'page_view', url: location.href }))
}
