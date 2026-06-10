import type { PushFn } from './types'
import { addBreadcrumb, getBreadcrumbs } from './breadcrumbs'

const _origFetch = window.fetch.bind(window)
let _patched = false

export function startErrorTracking(push: PushFn): void {
  // Sync JS errors
  window.addEventListener('error', (e) => {
    push({
      type: 'js_error',
      msg: e.message?.slice(0, 300),
      source: e.filename?.split('/').pop()?.slice(0, 80),
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack?.slice(0, 600),
      breadcrumbs: getBreadcrumbs(),
    })
  })

  // Unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    push({
      type: 'js_error',
      msg: String(reason?.message ?? reason).slice(0, 300),
      stack: reason?.stack?.slice(0, 600),
      promise: true,
      breadcrumbs: getBreadcrumbs(),
    })
  })

  // console.error — add as breadcrumb AND forward to original
  const origConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    origConsoleError(...args)
    const msg = args.map(String).join(' ').slice(0, 300)
    addBreadcrumb({ category: 'console', message: msg, data: { level: 'error' } })
    push({ type: 'js_error', msg, console: true, breadcrumbs: getBreadcrumbs() })
  }

  // console.warn — breadcrumb only (not an error event)
  const origConsoleWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    origConsoleWarn(...args)
    addBreadcrumb({ category: 'console', message: args.map(String).join(' ').slice(0, 200), data: { level: 'warn' } })
  }

  // Monkey-patch fetch — record http breadcrumbs + network errors
  if (!_patched) {
    _patched = true
    window.fetch = (async function patchedFetch(input, init) {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : (input as Request).url
      const shortUrl = url.split('?')[0].slice(0, 120)
      const method = (init?.method ?? 'GET').toUpperCase()
      const start = Date.now()

      try {
        const res = await _origFetch(input, init)
        const ms = Date.now() - start
        addBreadcrumb({
          category: 'http',
          message: `${method} ${shortUrl}`,
          data: { status: res.status, ms },
        })
        if (!res.ok) {
          push({
            type: 'network_error',
            url: shortUrl,
            status: res.status,
            ms,
            method,
            breadcrumbs: getBreadcrumbs(),
          })
        }
        return res
      } catch (err: unknown) {
        const ms = Date.now() - start
        addBreadcrumb({
          category: 'http',
          message: `${method} ${shortUrl}`,
          data: { status: 0, ms, error: err instanceof Error ? err.message : 'network_failure' },
        })
        push({
          type: 'network_error',
          url: shortUrl,
          status: 0,
          ms,
          msg: err instanceof Error ? err.message.slice(0, 200) : 'network_failure',
          method,
          breadcrumbs: getBreadcrumbs(),
        })
        throw err
      }
    }) as typeof window.fetch
  }
}

export function stopErrorTracking(): void {
  if (_patched) {
    window.fetch = _origFetch
    _patched = false
  }
}
