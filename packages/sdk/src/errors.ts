import type { PushFn } from './types'

// Sauvegarder les refs originales avant de patcher
const _origFetch = window.fetch.bind(window)
let _patched = false

export function startErrorTracking(push: PushFn): void {
  // Erreurs JS synchrones
  window.addEventListener('error', (e) => {
    push({
      type: 'js_error',
      msg: e.message?.slice(0, 300),
      source: e.filename?.split('/').pop()?.slice(0, 80),
      line: e.lineno,
      col: e.colno,
      stack: e.error?.stack?.slice(0, 600),
    })
  })

  // Promises non gérées
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason
    push({
      type: 'js_error',
      msg: String(reason?.message ?? reason).slice(0, 300),
      stack: reason?.stack?.slice(0, 600),
      promise: true,
    })
  })

  // Capture console.error (sans le désactiver)
  const origConsoleError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    origConsoleError(...args)
    push({
      type: 'js_error',
      msg: args.map(String).join(' ').slice(0, 300),
      console: true,
    })
  }

  // Monkey-patch fetch pour capturer les erreurs réseau
  if (!_patched) {
    _patched = true
    window.fetch = (async function patchedFetch(input, init) {
      const url = typeof input === 'string'
        ? input
        : input instanceof URL ? input.toString() : (input as Request).url
      const shortUrl = url.split('?')[0].slice(0, 120)
      const start = Date.now()

      try {
        const res = await _origFetch(input, init)
        const ms = Date.now() - start
        if (!res.ok) {
          push({
            type: 'network_error',
            url: shortUrl,
            status: res.status,
            ms,
            method: (init?.method ?? 'GET').toUpperCase(),
          })
        }
        return res
      } catch (err: unknown) {
        push({
          type: 'network_error',
          url: shortUrl,
          status: 0,
          ms: Date.now() - start,
          msg: err instanceof Error ? err.message.slice(0, 200) : 'network_failure',
          method: (init?.method ?? 'GET').toUpperCase(),
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
