import type { AnalyticsEvent } from '@analytics-kit/storage'

const BOT_UA_RE = /bot|crawl|spider|slurp|yandex|baiduspider|bing|facebookexternalhit|twitterbot|linkedinbot|pinterestbot|semrush|ahrefs|mj12bot|dotbot|rogerbot|screaming.frog|wget|curl|python-requests|go-http|java\//i

const EXT_URL_RE = /^(chrome|moz|safari)-extension:/i

const FILTER_BOTS = (process.env.FILTER_BOTS ?? 'true') !== 'false'
const FILTER_EXTENSIONS = (process.env.FILTER_EXTENSIONS ?? 'true') !== 'false'

export function isBotUA(ua: string): boolean {
  return FILTER_BOTS && BOT_UA_RE.test(ua)
}

export function isFilteredEvent(e: AnalyticsEvent): boolean {
  if (!FILTER_EXTENSIONS) return false
  if (e.type !== 'js_error' && e.type !== 'network_error') return false

  const url    = typeof e.url    === 'string' ? e.url    : ''
  const source = typeof e.source === 'string' ? e.source : ''

  // Drop errors originating from browser extensions
  return EXT_URL_RE.test(url) || EXT_URL_RE.test(source)
}
