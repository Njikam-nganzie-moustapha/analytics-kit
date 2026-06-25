import type { RawEvent } from './types'

export interface BotStatRow {
  site: string
  bot: string          // friendly name e.g. "GPTBot"
  category: string     // 'ai' | 'search' | 'seo' | 'social' | 'other'
  hits: number
  lastSeen: number
}

// Known AI / LLM crawlers (the webful-style "LLM traffic" view) + a few common
// non-AI crawlers so the breakdown is useful. Order matters: first match wins.
const BOTS: { re: RegExp; name: string; category: string }[] = [
  { re: /gptbot/i,                     name: 'GPTBot (OpenAI)',        category: 'ai' },
  { re: /oai-searchbot/i,              name: 'OAI-SearchBot (OpenAI)', category: 'ai' },
  { re: /chatgpt-user/i,               name: 'ChatGPT-User',           category: 'ai' },
  { re: /claudebot/i,                  name: 'ClaudeBot (Anthropic)',  category: 'ai' },
  { re: /claude-web/i,                 name: 'Claude-Web (Anthropic)', category: 'ai' },
  { re: /anthropic-ai/i,               name: 'Anthropic-AI',           category: 'ai' },
  { re: /perplexitybot|perplexity-user/i, name: 'PerplexityBot',       category: 'ai' },
  { re: /google-extended/i,            name: 'Google-Extended',        category: 'ai' },
  { re: /googleother/i,                name: 'GoogleOther',            category: 'ai' },
  { re: /bytespider/i,                 name: 'Bytespider (TikTok)',    category: 'ai' },
  { re: /ccbot/i,                      name: 'CCBot (Common Crawl)',   category: 'ai' },
  { re: /meta-externalagent|facebookbot|meta-externalfetcher/i, name: 'Meta AI', category: 'ai' },
  { re: /amazonbot/i,                  name: 'Amazonbot',              category: 'ai' },
  { re: /applebot-extended/i,          name: 'Applebot-Extended',      category: 'ai' },
  { re: /cohere-ai|cohere-training-data-crawler/i, name: 'Cohere',     category: 'ai' },
  { re: /diffbot/i,                    name: 'Diffbot',                category: 'ai' },
  { re: /timpibot|omgili|webzio/i,     name: 'Timpibot',               category: 'ai' },
  { re: /youbot/i,                     name: 'YouBot (You.com)',       category: 'ai' },
  { re: /mistralai-user|mistral/i,     name: 'MistralAI',              category: 'ai' },
  { re: /googlebot/i,                  name: 'Googlebot',              category: 'search' },
  { re: /bingbot/i,                    name: 'Bingbot',                category: 'search' },
  { re: /duckduckbot/i,                name: 'DuckDuckBot',            category: 'search' },
  { re: /yandex(bot)?/i,               name: 'YandexBot',              category: 'search' },
  { re: /baiduspider/i,                name: 'Baiduspider',            category: 'search' },
  { re: /ahrefsbot/i,                  name: 'AhrefsBot',              category: 'seo' },
  { re: /semrushbot/i,                 name: 'SemrushBot',             category: 'seo' },
  { re: /mj12bot/i,                    name: 'MJ12bot',                category: 'seo' },
  { re: /dotbot/i,                     name: 'DotBot',                 category: 'seo' },
  { re: /facebookexternalhit/i,        name: 'Facebook',               category: 'social' },
  { re: /twitterbot/i,                 name: 'Twitterbot',             category: 'social' },
  { re: /linkedinbot/i,                name: 'LinkedInBot',            category: 'social' },
]

// Classify a UA string into a known bot, or null if not a recognised crawler.
export function classifyBot(ua: string | undefined): { name: string; category: string } | null {
  const s = ua ?? ''
  if (!s) return null
  for (const b of BOTS) if (b.re.test(s)) return { name: b.name, category: b.category }
  if (/bot|crawler|spider|crawl/i.test(s)) return { name: 'Other crawler', category: 'other' }
  return null
}

// Returns true for AI/LLM crawlers specifically — used by the origin beacon to
// decide whether a request is worth reporting.
export function isAiCrawler(ua: string | undefined): boolean {
  return classifyBot(ua)?.category === 'ai'
}

// Aggregate `bot_hit` events into per-bot hit counts.
export function buildBotStats(events: RawEvent[]): BotStatRow[] {
  const agg = new Map<string, BotStatRow>()
  for (const e of events) {
    if (e.type !== 'bot_hit') continue
    const explicit = typeof e.bot === 'string' && e.bot ? e.bot : ''
    const cls = explicit
      ? (classifyBot(explicit) ?? classifyBot(typeof e.ua === 'string' ? e.ua : '') ?? { name: explicit, category: 'other' })
      : classifyBot(typeof e.ua === 'string' ? e.ua : '')
    if (!cls) continue
    const key = `${e.site}|${cls.name}`
    const prev = agg.get(key)
    if (prev) { prev.hits += 1; prev.lastSeen = Math.max(prev.lastSeen, e.t) }
    else agg.set(key, { site: e.site, bot: cls.name, category: cls.category, hits: 1, lastSeen: e.t })
  }
  return [...agg.values()]
}
