import { useMemo } from 'react'
import { fetchTraffic } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { Insights } from '@/components/kit/Insights'
import { AreaTrend } from '@/components/kit/AreaTrend'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { deriveTrafficInsights } from '@/lib/insights'
import { LoadingState, ErrorState } from '@/components/shell/states'
import type { Channel, TrafficSource } from '@/types'

const ALL_CHANNELS: Channel[] = ['organic', 'social', 'referral', 'ai', 'direct']

const CHANNEL_COLOR: Record<Channel, string> = {
  direct: '#64748b', organic: '#22c55e', social: '#3b82f6', referral: '#a855f7', ai: '#d97706',
}
const CHANNEL_LABEL: Record<Channel, string> = {
  direct: 'Direct', organic: 'Organic search', social: 'Social', referral: 'Referral', ai: 'AI assistants',
}

function pctDelta(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined
  return Math.round(((curr - prev) / prev) * 100)
}

export function TrafficView({ site, from }: { site: string; from?: number }) {
  const now = Date.now()
  // Previous period: same duration as the current window, immediately before it.
  const prevFrom = from ? from - (now - from) : undefined
  const prevTo   = from   // current period starts where prev ends

  const { data, loading, error, reload } = useAsync(() => fetchTraffic(site, from),              [site, from])
  const { data: prevData }               = useAsync(() => prevFrom !== undefined
    ? fetchTraffic(site, prevFrom, prevTo)
    : Promise.resolve(undefined),                                                                  [site, prevFrom, prevTo])

  const sources: TrafficSource[] = data?.sources ?? []
  const rawSeries = data?.series ?? []

  const byChannel = new Map<Channel, number>()
  const byReferrer = new Map<string, number>()
  const campaigns: TrafficSource[] = []
  for (const s of sources) {
    byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + s.sessions)
    if (s.referrerHost) byReferrer.set(s.referrerHost, (byReferrer.get(s.referrerHost) ?? 0) + s.sessions)
    if (s.utmCampaign || s.utmSource) campaigns.push(s)
  }

  // Build prev-period channel map for delta computation
  const prevByChannel = new Map<Channel, number>()
  for (const s of prevData?.sources ?? []) {
    prevByChannel.set(s.channel as Channel, (prevByChannel.get(s.channel as Channel) ?? 0) + s.sessions)
  }

  const channelRows: BarRow[] = ALL_CHANNELS
    .map(c => ({ c, v: byChannel.get(c) ?? 0 }))
    .sort((a, b) => b.v - a.v)
    .map(({ c, v }) => ({
      label: CHANNEL_LABEL[c],
      value: v,
      color: CHANNEL_COLOR[c],
      delta: from ? pctDelta(v, prevByChannel.get(c) ?? 0) : undefined,
    }))

  const referrerRows: BarRow[] = [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).map(([h, v]) => ({ label: h, value: v }))

  // Pivot daily series → chart-friendly format
  const chartData = useMemo(() => {
    const byDay = new Map<number, Record<string, number>>()
    for (const p of rawSeries) {
      let d = byDay.get(p.day)
      if (!d) { d = {}; byDay.set(p.day, d) }
      d[p.channel] = (d[p.channel] ?? 0) + p.sessions
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([day, vals]) => ({
        label: new Date(day * 86_400_000).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        ...Object.fromEntries(ALL_CHANNELS.map(c => [c, vals[c] ?? 0])),
      }))
  }, [rawSeries])

  const chartSeries = ALL_CHANNELS
    .filter(c => (byChannel.get(c) ?? 0) > 0)
    .map(c => ({ key: c, name: CHANNEL_LABEL[c], color: CHANNEL_COLOR[c] }))

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><Insights items={deriveTrafficInsights(sources)} /></div>

      {chartData.length > 1 && (
        <Section title="Channels over time" desc="Daily sessions by acquisition channel" className="lg:col-span-2">
          <AreaTrend data={chartData} series={chartSeries} />
        </Section>
      )}

      <Section title="Channels" desc="How visitors reach the site">
        <BarRows rows={channelRows} unit="" />
      </Section>
      <Section title="Top referrers" desc="External sites sending traffic">
        <BarRows rows={referrerRows} emptyLabel="No referral traffic" />
      </Section>
      <Section title="Campaigns (UTM)" desc="Tagged marketing campaigns" className="lg:col-span-2">
        {campaigns.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No UTM-tagged traffic in this range.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 font-medium">Medium</th>
                  <th className="pb-2 font-medium">Campaign</th>
                  <th className="pb-2 font-medium">Content</th>
                  <th className="pb-2 font-medium">Term</th>
                  <th className="pb-2 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.sort((a, b) => b.sessions - a.sessions).map((c, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2">{c.utmSource || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.utmMedium || '—'}</td>
                    <td className="py-2">{c.utmCampaign || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.utmContent || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.utmTerm || '—'}</td>
                    <td className="py-2 text-right tabular-nums">{c.sessions.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  )
}
