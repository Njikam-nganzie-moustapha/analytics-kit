import type { TrafficSource, DeviceStat, GeoStat, ConversionStat, OverviewSummary, Channel } from '@/types'

// A plain-language deduction drawn from the data, with a concrete next step.
// The point: the user shouldn't have to interpret raw numbers — the dashboard
// tells them what it means and what to do.
export type Severity = 'good' | 'warn' | 'bad' | 'info'
export interface Insight { severity: Severity; title: string; detail: string; action?: string }

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0)
const CHANNEL_NAME: Record<Channel, string> = {
  direct: 'Direct', organic: 'Organic search', social: 'Social', referral: 'Referral', ai: 'AI assistants',
}

export function deriveOverviewInsights(s: OverviewSummary): Insight[] {
  const out: Insight[] = []
  if (s.sessions === 0) return [{ severity: 'info', title: 'No sessions in this range', detail: 'Widen the time range or check that the tracker is installed and sending events.' }]

  // Health
  if (s.health >= 80) out.push({ severity: 'good', title: `Healthy site (${s.health}/100)`, detail: 'Vitals, reliability and speed are all in good shape.' })
  else if (s.health >= 50) out.push({ severity: 'warn', title: `Health needs attention (${s.health}/100)`, detail: 'One of Core Web Vitals, error rate or load speed is dragging the score down.', action: 'Open Performance and Errors to find the weakest contributor.' })
  else out.push({ severity: 'bad', title: `Health is critical (${s.health}/100)`, detail: 'Vitals, errors or speed are hurting real users right now.', action: 'Start with the Errors tab, then Performance.' })

  // Reliability
  if (s.errorRate >= 10) out.push({ severity: 'bad', title: `${s.errorRate}% of sessions hit an error`, detail: `${s.errorSessions.toLocaleString()} sessions saw a JS or network error — that is high.`, action: 'Triage the top error groups in Errors.' })
  else if (s.errorRate >= 3) out.push({ severity: 'warn', title: `${s.errorRate}% of sessions hit an error`, detail: 'Some users are running into problems.', action: 'Check the Errors tab for the most frequent issue.' })

  // Conversion rate
  const cr = pct(s.conversions, s.sessions)
  if (s.conversions > 0) out.push({ severity: cr >= 2 ? 'good' : 'info', title: `${cr}% conversion rate`, detail: `${s.conversions.toLocaleString()} conversions from ${s.sessions.toLocaleString()} sessions.`, action: cr < 2 ? 'See Conversions to find which pages convert best.' : undefined })

  // Trend (first vs second half of the series)
  if (s.series.length >= 4) {
    const half = Math.floor(s.series.length / 2)
    const a = s.series.slice(0, half).reduce((x, p) => x + p.sessions, 0) / half
    const b = s.series.slice(half).reduce((x, p) => x + p.sessions, 0) / (s.series.length - half)
    const change = a > 0 ? Math.round(((b - a) / a) * 100) : 0
    if (Math.abs(change) >= 15) {
      out.push(change > 0
        ? { severity: 'good', title: `Traffic trending up ${change}%`, detail: 'Sessions in the recent part of the range are higher than earlier.' }
        : { severity: 'warn', title: `Traffic trending down ${Math.abs(change)}%`, detail: 'Sessions are declining across this range.', action: 'Check Traffic sources for which channel dropped.' })
    }
  }
  return out
}

export function deriveTrafficInsights(sources: TrafficSource[]): Insight[] {
  const total = sources.reduce((a, s) => a + s.sessions, 0)
  if (total === 0) return [{ severity: 'info', title: 'No traffic yet', detail: 'Channels appear once visitors arrive.' }]
  const byChannel = new Map<Channel, number>()
  let tagged = 0
  for (const s of sources) {
    byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + s.sessions)
    if (s.utmSource || s.utmCampaign) tagged += s.sessions
  }
  const out: Insight[] = []
  const share = (c: Channel) => pct(byChannel.get(c) ?? 0, total)

  const direct = share('direct')
  if (direct >= 60) out.push({ severity: 'warn', title: `${direct}% of traffic is Direct`, detail: 'Either strong brand/loyalty — or your marketing links are not tagged, so you cannot attribute them.', action: 'Add utm_source/medium/campaign to your campaign links.' })

  const organic = share('organic')
  if (organic >= 30) out.push({ severity: 'good', title: `${organic}% from organic search`, detail: 'SEO is bringing in meaningful free traffic.' })

  const ai = share('ai')
  if ((byChannel.get('ai') ?? 0) > 0) out.push({ severity: 'info', title: `AI assistants sent ${(byChannel.get('ai') ?? 0).toLocaleString()} sessions (${ai}%)`, detail: 'ChatGPT / Claude / Perplexity etc. are now a referral channel — worth tracking as they grow.' })

  if (pct(tagged, total) < 10) out.push({ severity: 'info', title: 'Almost no campaigns are UTM-tagged', detail: 'Without UTM tags you cannot measure which campaigns or ads actually work.', action: 'Tag every marketing link with utm_* parameters.' })
  return out
}

export function deriveDeviceInsights(devices: DeviceStat[]): Insight[] {
  const total = devices.reduce((a, d) => a + d.sessions, 0)
  if (total === 0) return [{ severity: 'info', title: 'No device data yet', detail: 'Device, browser and OS are read from visitor sessions.' }]
  const byType = new Map<string, number>()
  const byBrowser = new Map<string, number>()
  for (const d of devices) {
    byType.set(d.deviceType, (byType.get(d.deviceType) ?? 0) + d.sessions)
    byBrowser.set(d.browser, (byBrowser.get(d.browser) ?? 0) + d.sessions)
  }
  const out: Insight[] = []
  const mobile = pct(byType.get('mobile') ?? 0, total)
  const desktop = pct(byType.get('desktop') ?? 0, total)
  if (mobile >= 55) out.push({ severity: 'info', title: `${mobile}% of visitors are on mobile`, detail: 'Your audience is mobile-first.', action: 'Prioritise the mobile layout and test Core Web Vitals on a real phone.' })
  else if (desktop >= 70) out.push({ severity: 'info', title: `${desktop}% of visitors are on desktop`, detail: 'A desktop-heavy audience — larger layouts and data-dense views are fine here.' })

  const safari = pct(byBrowser.get('Safari') ?? 0, total)
  if (safari >= 20) out.push({ severity: 'warn', title: `${safari}% use Safari`, detail: 'Safari often lags on web features and has its own CSS quirks.', action: 'Test the key flows in Safari, not just Chrome.' })
  return out
}

export function deriveGeoInsights(geo: GeoStat[]): Insight[] {
  const total = geo.reduce((a, g) => a + g.sessions, 0)
  if (total === 0) return [{ severity: 'info', title: 'No geography data yet', detail: 'Country/city come from the Cloudflare edge on a deployed origin.' }]
  const byCountry = new Map<string, number>()
  for (const g of geo) byCountry.set(g.country, (byCountry.get(g.country) ?? 0) + g.sessions)
  const top = [...byCountry.entries()].sort((a, b) => b[1] - a[1])[0]
  const out: Insight[] = []
  if (top) {
    const sh = pct(top[1], total)
    out.push({ severity: 'info', title: `${sh}% of visitors are from ${top[0]}`, detail: `${byCountry.size} ${byCountry.size === 1 ? 'country' : 'countries'} in total.`, action: sh >= 60 ? 'Consider a CDN region and localized content for your main market.' : undefined })
  }
  return out
}

export function deriveConversionInsights(conversions: ConversionStat[], sessions?: number): Insight[] {
  const total = conversions.reduce((a, c) => a + c.count, 0)
  if (total === 0) return [{ severity: 'info', title: 'No conversions captured yet', detail: 'Phone/email link clicks and custom conversion events show up here.', action: 'Make sure contact links use tel:/mailto:, or fire a custom event on form submit.' }]
  const byKind = new Map<string, number>()
  for (const c of conversions) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + c.count)
  const top = [...byKind.entries()].sort((a, b) => b[1] - a[1])[0]
  const out: Insight[] = []
  if (top) out.push({ severity: 'good', title: `${top[0]} is your top conversion`, detail: `${top[1].toLocaleString()} of ${total.toLocaleString()} total conversions.` })
  if (sessions && sessions > 0) {
    const cr = pct(total, sessions)
    out.push({ severity: cr >= 2 ? 'good' : 'warn', title: `${cr}% of sessions convert`, detail: cr < 2 ? 'There is room to improve — look at where visitors drop off.' : 'A solid conversion rate.', action: cr < 2 ? 'Use Funnels to see the biggest drop-off.' : undefined })
  }
  return out
}
