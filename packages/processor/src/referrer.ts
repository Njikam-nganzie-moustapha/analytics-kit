import type { Channel } from './types'

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|baidu|yandex|ecosia|brave|ask|qwant|naver|startpage)\./i
const SOCIAL = /(^|\.)(facebook|fb|instagram|twitter|x|t|linkedin|lnkd|reddit|youtube|youtu|pinterest|tiktok|snapchat|whatsapp|telegram|t\.me|threads|mastodon|bsky)\./i
// AI assistants that send referral traffic (distinct from AI *crawler* bots,
// which don't run our JS tracker — those are captured server-side, see ai_bots).
const AI = /(^|\.)(chat\.openai|chatgpt|openai|perplexity|claude\.ai|anthropic|gemini\.google|bard\.google|aistudio\.google|copilot\.microsoft|bing\.com\/chat|duckduckgo\.com\/aichat|you\.com|poe\.com|phind|deepseek|mistral|lechat|chat\.mistral|grok|x\.ai|meta\.ai|character\.ai|huggingface\.co\/chat|kagi\.com\/assistant|andisearch|komo\.ai|exa\.ai|felo\.ai|genspark)/i

// Friendly name for an AI-assistant referrer host (for the per-assistant breakdown).
export function aiSource(host: string): string {
  const h = host.toLowerCase()
  if (/openai|chatgpt/.test(h))       return 'ChatGPT'
  if (/perplexity/.test(h))           return 'Perplexity'
  if (/claude|anthropic/.test(h))     return 'Claude'
  if (/gemini|bard|aistudio/.test(h)) return 'Gemini'
  if (/copilot/.test(h))              return 'Copilot'
  if (/deepseek/.test(h))             return 'DeepSeek'
  if (/mistral|lechat/.test(h))       return 'Le Chat (Mistral)'
  if (/grok|x\.ai/.test(h))           return 'Grok'
  if (/meta\.ai/.test(h))             return 'Meta AI'
  if (/character\.ai/.test(h))        return 'Character.AI'
  if (/huggingface/.test(h))          return 'HuggingChat'
  if (/kagi/.test(h))                 return 'Kagi Assistant'
  if (/you\.com/.test(h))             return 'You.com'
  if (/poe\.com/.test(h))             return 'Poe'
  if (/phind/.test(h))                return 'Phind'
  if (/duckduckgo/.test(h))           return 'DuckDuckGo AI'
  return host || 'AI assistant'
}

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

export function parseUTM(url: string | undefined): { source: string; medium: string; campaign: string; content: string; term: string } {
  const empty = { source: '', medium: '', campaign: '', content: '', term: '' }
  if (!url) return empty
  try {
    const q = new URL(url, 'http://_').searchParams
    const g = (k: string) => (q.get(k) ?? '').slice(0, 80)
    return { source: g('utm_source'), medium: g('utm_medium'), campaign: g('utm_campaign'), content: g('utm_content'), term: g('utm_term') }
  } catch {
    return empty
  }
}
