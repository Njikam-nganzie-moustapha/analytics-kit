import type { RawEvent, ConversionRow } from './types'

const CONVERSION_CUSTOM = /^(lead|signup|sign_up|purchase|checkout|contact|subscribe|conversion|form_submit|booking|demo)/i
const DOWNLOAD_EXT = /\.(pdf|zip|xlsx?|docx?|pptx?|csv|mp3|mp4|avi|mov|dmg|exe|pkg|deb|rpm)(\?.*)?$/i

function normUrl(url: unknown): string {
  if (typeof url !== 'string') return ''
  try {
    const u = new URL(url, 'http://_')
    return (u.pathname || '/').slice(0, 200)
  } catch {
    return String(url).split('?')[0].slice(0, 200)
  }
}

// Conversions are derived from:
//  • link clicks whose href is tel:/mailto: (phone/email contact)
//  • custom events named like a conversion (form_submit, signup, purchase…)
export function buildConversions(events: RawEvent[]): ConversionRow[] {
  const agg = new Map<string, ConversionRow>()
  const bump = (site: string, kind: string, url: string, t: number) => {
    const key = `${site}|${kind}|${url}`
    const row = agg.get(key)
    if (row) { row.count += 1; row.lastSeen = Math.max(row.lastSeen, t) }
    else agg.set(key, { site, kind, url, count: 1, lastSeen: t })
  }

  for (const e of events) {
    if (e.type === 'click') {
      const href = typeof e.href === 'string' ? e.href : ''
      if (href.startsWith('tel:')) bump(e.site, 'phone', normUrl(e.url), e.t)
      else if (href.startsWith('mailto:')) bump(e.site, 'email', normUrl(e.url), e.t)
      else if (DOWNLOAD_EXT.test(href)) bump(e.site, 'download', normUrl(e.url), e.t)
    } else if (e.type === 'custom') {
      const name = typeof e.name === 'string' ? e.name : ''
      if (CONVERSION_CUSTOM.test(name)) bump(e.site, name.slice(0, 40).toLowerCase(), normUrl(e.url), e.t)
    }
  }
  return [...agg.values()]
}
