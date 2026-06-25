import { useState, useEffect } from 'react'
import { Users, MousePointerClick, AlertTriangle, Target, Eye, TrendingDown, Clock, Radio } from 'lucide-react'
import { fetchOverview, fetchActivity, fetchRealtime } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { ContributionGraph } from '@/components/kit/ContributionGraph'
import { StatCard } from '@/components/kit/StatCard'
import { HealthGauge } from '@/components/kit/HealthGauge'
import { AreaTrend } from '@/components/kit/AreaTrend'
import { Section } from '@/components/kit/Section'
import { Insights } from '@/components/kit/Insights'
import { InfoTip, METRIC_HELP } from '@/components/kit/InfoTip'
import { deriveOverviewInsights } from '@/lib/insights'
import { Card } from '@/components/ui/card'
import { LoadingState, ErrorState } from '@/components/shell/states'

function dayLabel(day: number): string {
  return new Date(day * 86_400_000).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function fmtDuration(ms: number): string {
  if (ms <= 0) return '0s'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

function pctDelta(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined
  return Math.round(((curr - prev) / prev) * 100)
}

export function OverviewView({ site, from }: { site: string; from?: number }) {
  const { data, loading, error, reload } = useAsync(() => fetchOverview(site, from), [site, from])
  const activity = useAsync(() => fetchActivity(site, 365), [site])
  const [realtime, setRealtime] = useState<number | null>(null)

  useEffect(() => {
    if (!site) return
    fetchRealtime(site).then(setRealtime)
    const id = setInterval(() => fetchRealtime(site).then(setRealtime), 30_000)
    return () => clearInterval(id)
  }, [site])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const { summary, sites } = data
  const trend = summary.series.map(p => ({ label: dayLabel(p.day), value: p.sessions, value2: p.errors }))

  const dSessions    = pctDelta(summary.sessions,    summary.prevSessions)
  const dUsers       = pctDelta(summary.users,       summary.prevUsers)
  const dConversions = pctDelta(summary.conversions, summary.prevConversions)
  const dErrorRate   = summary.prevSessions > 0 ? summary.errorRate - summary.prevErrorRate : undefined

  return (
    <div className="space-y-6">
      {realtime !== null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
          </span>
          <Radio className="size-3 text-green-500" />
          <span className="font-semibold text-green-600 dark:text-green-400">{realtime}</span>
          <span className="text-muted-foreground">active in the last 5 min</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="flex flex-col items-center justify-center p-6">
          <HealthGauge score={summary.health} />
          <p className="mt-2 flex items-center gap-1 text-center text-[12px] text-muted-foreground">
            Blends Core Web Vitals, error rate &amp; load speed
            <InfoTip help={METRIC_HELP.health} label="health score" />
          </p>
        </Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sessions" value={summary.sessions.toLocaleString()} help={METRIC_HELP.sessions}
            icon={<MousePointerClick className="size-4" />} delta={dSessions} />
          <StatCard label="Visitors" value={summary.users.toLocaleString()} help={METRIC_HELP.visitors}
            icon={<Users className="size-4" />} delta={dUsers} />
          <StatCard label="Error rate" value={`${summary.errorRate}%`} deltaGood="down" help={METRIC_HELP.errorRate}
            sub={`${summary.errorSessions.toLocaleString()} sessions with errors`}
            icon={<AlertTriangle className="size-4" />}
            delta={typeof dErrorRate === 'number' ? dErrorRate : undefined} />
          <StatCard label="Conversions" value={summary.conversions.toLocaleString()} help={METRIC_HELP.conversions}
            icon={<Target className="size-4" />}
            sub={summary.sessions > 0 ? `${((summary.conversions / summary.sessions) * 100).toFixed(1)}% rate` : undefined}
            delta={dConversions} />
        </div>
      </div>

      {/* Secondary KPIs row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Page views" value={summary.pageviews.toLocaleString()} help={METRIC_HELP.pageviews}
          icon={<Eye className="size-4" />} />
        <StatCard label="Bounce rate" value={`${summary.bounceRate}%`} deltaGood="down" help={METRIC_HELP.bounceRate}
          icon={<TrendingDown className="size-4" />} />
        <StatCard label="Avg. duration" value={fmtDuration(summary.avgDuration)} help={METRIC_HELP.avgDuration}
          icon={<Clock className="size-4" />} />
        <StatCard label="Views / session"
          value={summary.sessions > 0 ? (summary.pageviews / summary.sessions).toFixed(1) : '—'}
          icon={<Eye className="size-4" />} />
      </div>

      <Insights items={deriveOverviewInsights(summary)} />

      <Section title="Sessions trend" desc="Sessions and error sessions over the selected range">
        {trend.length > 1 ? (
          <AreaTrend data={trend} series={[
            { key: 'value', name: 'Sessions', color: 'hsl(var(--primary))' },
            { key: 'value2', name: 'Errors', color: 'hsl(var(--destructive))' },
          ]} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Not enough data yet for a trend — keep collecting.</p>
        )}
      </Section>

      <Section title="Activity" desc="Daily sessions over the last year — greener means busier (GitHub-style)">
        <ContributionGraph data={activity.data ?? []} />
      </Section>

      <Section title="All sites" desc="Sessions across every tracked site">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[12px] uppercase tracking-wide text-muted-foreground">
                <th className="pb-2 font-medium">Site</th>
                <th className="pb-2 text-right font-medium">Sessions</th>
                <th className="pb-2 text-right font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {sites.map(s => (
                <tr key={s.site} className="border-b border-border/50 last:border-0">
                  <td className="py-2 font-mono text-[13px]">{s.site}</td>
                  <td className="py-2 text-right tabular-nums">{s.sessions.toLocaleString()}</td>
                  <td className="py-2 text-right text-[12px] text-muted-foreground">
                    {s.lastSeen ? new Date(s.lastSeen).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
