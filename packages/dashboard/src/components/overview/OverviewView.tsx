import { Users, MousePointerClick, AlertTriangle, Target } from 'lucide-react'
import { fetchOverview } from '@/api'
import { useAsync } from '@/hooks/useAsync'
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

export function OverviewView({ site, from }: { site: string; from?: number }) {
  const { data, loading, error, reload } = useAsync(() => fetchOverview(site, from), [site, from])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const { summary, sites } = data
  const trend = summary.series.map(p => ({ label: dayLabel(p.day), value: p.sessions, value2: p.errors }))

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card className="flex flex-col items-center justify-center p-6">
          <HealthGauge score={summary.health} />
          <p className="mt-2 flex items-center gap-1 text-center text-[12px] text-muted-foreground">
            Blends Core Web Vitals, error rate &amp; load speed
            <InfoTip help={METRIC_HELP.health} label="health score" />
          </p>
        </Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Sessions" value={summary.sessions.toLocaleString()} help={METRIC_HELP.sessions} icon={<MousePointerClick className="size-4" />} />
          <StatCard label="Visitors" value={summary.users.toLocaleString()} help={METRIC_HELP.visitors} icon={<Users className="size-4" />} />
          <StatCard label="Error rate" value={`${summary.errorRate}%`} deltaGood="down" help={METRIC_HELP.errorRate}
            sub={`${summary.errorSessions.toLocaleString()} sessions with errors`} icon={<AlertTriangle className="size-4" />} />
          <StatCard label="Conversions" value={summary.conversions.toLocaleString()} help={METRIC_HELP.conversions} icon={<Target className="size-4" />}
            sub={summary.sessions > 0 ? `${((summary.conversions / summary.sessions) * 100).toFixed(1)}% rate` : undefined} />
        </div>
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
