import { fetchTraffic } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { LoadingState, ErrorState, EmptyState } from '@/components/shell/states'
import type { Channel, TrafficSource } from '@/types'

const CHANNEL_COLOR: Record<Channel, string> = {
  direct: '#64748b', organic: '#22c55e', social: '#3b82f6', referral: '#a855f7', ai: '#d97706',
}
const CHANNEL_LABEL: Record<Channel, string> = {
  direct: 'Direct', organic: 'Organic search', social: 'Social', referral: 'Referral', ai: 'AI assistants',
}

export function TrafficView({ site, from }: { site: string; from?: number }) {
  const { data, loading, error, reload } = useAsync(() => fetchTraffic(site, from), [site, from])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const sources = data ?? []
  if (sources.length === 0) return <EmptyState title="No traffic data yet" hint="Once visitors arrive, channels and campaigns appear here." />

  const byChannel = new Map<Channel, number>()
  const byReferrer = new Map<string, number>()
  const campaigns: TrafficSource[] = []
  for (const s of sources) {
    byChannel.set(s.channel, (byChannel.get(s.channel) ?? 0) + s.sessions)
    if (s.referrerHost) byReferrer.set(s.referrerHost, (byReferrer.get(s.referrerHost) ?? 0) + s.sessions)
    if (s.utmCampaign || s.utmSource) campaigns.push(s)
  }

  const channelRows: BarRow[] = [...byChannel.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([c, v]) => ({ label: CHANNEL_LABEL[c], value: v, color: CHANNEL_COLOR[c] }))
  const referrerRows: BarRow[] = [...byReferrer.entries()].sort((a, b) => b[1] - a[1]).map(([h, v]) => ({ label: h, value: v }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
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
                  <th className="pb-2 text-right font-medium">Sessions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.sort((a, b) => b.sessions - a.sessions).map((c, i) => (
                  <tr key={i} className="border-b border-border/50 last:border-0">
                    <td className="py-2">{c.utmSource || '—'}</td>
                    <td className="py-2 text-muted-foreground">{c.utmMedium || '—'}</td>
                    <td className="py-2">{c.utmCampaign || '—'}</td>
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
