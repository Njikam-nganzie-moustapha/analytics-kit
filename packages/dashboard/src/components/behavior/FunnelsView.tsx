import { fetchOverview, fetchConversions } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { LoadingState, ErrorState, EmptyState } from '@/components/shell/states'

function kindLabel(k: string) { return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

// Per-goal conversion funnel: Sessions → goal, with rate + drop-off. Derived
// from existing aggregates (no extra collection), with a clear linear-list
// fallback so it reads without relying on the bar widths alone.
export function FunnelsView({ site, from }: { site: string; from?: number }) {
  const { data, loading, error, reload } = useAsync(
    () => Promise.all([fetchOverview(site, from), fetchConversions(site, from)]),
    [site, from],
  )
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const [{ summary }, conversions] = data
  const sessions = summary.sessions
  if (sessions === 0) return <EmptyState title="No sessions in range" hint="Funnels need session traffic to compute conversion rates." />

  const byKind = new Map<string, number>()
  for (const c of conversions) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + c.count)
  const goals = [...byKind.entries()].sort((a, b) => b[1] - a[1])

  const Funnel = ({ label, top, bottom }: { label: string; top: number; bottom: number }) => {
    const rate = top > 0 ? (bottom / top) * 100 : 0
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{label}</span>
          <span className="tabular-nums text-muted-foreground">{rate.toFixed(2)}% conversion</span>
        </div>
        <div className="space-y-1" role="list">
          <div role="listitem" className="flex items-center gap-3">
            <div className="h-7 rounded bg-primary/80" style={{ width: '100%' }} />
            <span className="w-28 shrink-0 text-[12px] tabular-nums text-muted-foreground">Sessions · {top.toLocaleString()}</span>
          </div>
          <div role="listitem" className="flex items-center gap-3">
            <div className="h-7 rounded bg-success" style={{ width: `${Math.max(2, rate)}%` }} />
            <span className="w-28 shrink-0 text-[12px] tabular-nums text-muted-foreground">{label} · {bottom.toLocaleString()}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Section title="Overall conversion funnel" desc="Sessions that complete any conversion">
        <Funnel label="Any conversion" top={sessions} bottom={summary.conversions} />
      </Section>
      {goals.length > 0 && (
        <Section title="Funnels by goal" desc="Conversion rate per goal type">
          <div className="space-y-6">
            {goals.map(([kind, count]) => <Funnel key={kind} label={kindLabel(kind)} top={sessions} bottom={count} />)}
          </div>
        </Section>
      )}
    </div>
  )
}
