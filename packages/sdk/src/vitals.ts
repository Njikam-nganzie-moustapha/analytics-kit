import type { PushFn } from './types'

// Seuils officiels Google Web Vitals
// LCP: bon < 2500ms | moyen < 4000ms | mauvais > 4000ms
// FID: bon < 100ms  | moyen < 300ms  | mauvais > 300ms
// CLS: bon < 0.1   | moyen < 0.25   | mauvais > 0.25
// TTFB: bon < 800ms | moyen < 1800ms | mauvais > 1800ms

function rating(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds: Record<string, [number, number]> = {
    lcp:  [2500, 4000],
    fid:  [100, 300],
    cls:  [0.1, 0.25],
    ttfb: [800, 1800],
    fcp:  [1800, 3000],
  }
  const t = thresholds[metric]
  if (!t) return 'good'
  return value <= t[0] ? 'good' : value <= t[1] ? 'needs-improvement' : 'poor'
}

function safeObserve(
  type: string,
  callback: (entries: PerformanceEntryList) => void,
  buffered = true,
): void {
  try {
    const obs = new PerformanceObserver((list) => callback(list.getEntries()))
    obs.observe({ type, buffered })
  } catch {
    // API non supportée dans ce browser — ignorer silencieusement
  }
}

export function startVitalsTracking(push: PushFn): void {
  // LCP — Largest Contentful Paint
  safeObserve('largest-contentful-paint', (entries) => {
    const e = entries[entries.length - 1] as PerformanceEntry & {
      startTime: number; element?: Element
    }
    const value = Math.round(e.startTime)
    push({ type: 'lcp', value, rating: rating('lcp', value), element: e.element?.tagName })
  })

  // FID — First Input Delay
  safeObserve('first-input', (entries) => {
    const e = entries[0] as PerformanceEntry & {
      processingStart: number; startTime: number
    }
    const value = Math.round(e.processingStart - e.startTime)
    push({ type: 'fid', value, rating: rating('fid', value) })
  })

  // CLS — Cumulative Layout Shift (cumulé jusqu'à page hide)
  let clsTotal = 0
  safeObserve('layout-shift', (entries) => {
    for (const e of entries as Array<PerformanceEntry & { hadRecentInput: boolean; value: number }>) {
      if (!e.hadRecentInput) clsTotal += e.value
    }
  })
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const value = Math.round(clsTotal * 1000) / 1000
      push({ type: 'cls', value, rating: rating('cls', value) })
    }
  }, { once: true })

  // TTFB + FCP via Navigation Timing
  safeObserve('navigation', (entries) => {
    const e = entries[0] as PerformanceNavigationTiming
    const ttfb = Math.round(e.responseStart)
    const fcp = Math.round(e.domContentLoadedEventEnd)
    push({ type: 'ttfb', value: ttfb, rating: rating('ttfb', ttfb) })
    push({ type: 'fcp', value: fcp, rating: rating('fcp', fcp) })
  })

  // Long Tasks — tâches bloquant le main thread > 50ms
  safeObserve('longtask', (entries) => {
    for (const e of entries) {
      push({ type: 'long_task', duration: Math.round(e.duration), start: Math.round(e.startTime) })
    }
  })
}
