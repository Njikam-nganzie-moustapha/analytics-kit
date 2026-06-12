import type { Channel } from './types'

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave|ask|qwant|naver|startpage)\./i
const SOCIAL = /(^|\.)(facebook|fb|instagram|twitter|x|t|linkedin|lnkd|reddit|youtube|youtu|pinterest|tiktok|snapchat|whatsapp|telegram|t\.me|threads|mastodon|bsky)\./i
// AI assistants that send referral traffic (distinct from AI *crawler* bots,
// which the collector already filters out before storage).
const AI = /(^|\.)(chat\.openai|chatgpt|perplexity|claude\.ai|gemini\.google|bard\.google|copilot\.microsoft|you\.com|poe\.com|phind)/i

export function hostOf(u: string | undefined): string {
  if (!u) return ''
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

export function classifyReferrer(referrer: string | undefined, selfHost?: string): Channel {
  const host = hostOf(referrer)
  if (!host) return 'direct'
  if (selfHost && host === selfHost) return 'direct'
  if (AI.test(host)) return 'ai'
  if (SEARCH.test(host)) return 'organic'
  if (SOCIAL.test(host)) return 'social'
  return 'referral'
}

export function parseUTM(url: string | undefined): { source: string; medium: string; campaign: string } {
  const empty = { source: '', medium: '', campaign: '' }
  if (!url) return empty
  try {
    const q = new URL(url, 'http://_').searchParams
    const g = (k: string) => (q.get(k) ?? '').slice(0, 80)
    return { source: g('utm_source'), medium: g('utm_medium'), campaign: g('utm_campaign') }
  } catch {
    return empty
  }
}
