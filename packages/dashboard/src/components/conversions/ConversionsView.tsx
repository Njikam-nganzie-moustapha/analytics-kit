import { Phone, Mail, FileText, Target } from 'lucide-react'
import type { ReactNode } from 'react'
import { fetchConversions } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { Insights } from '@/components/kit/Insights'
import { StatCard } from '@/components/kit/StatCard'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { deriveConversionInsights } from '@/lib/insights'
import { LoadingState, ErrorState, EmptyState } from '@/components/shell/states'

const KIND_ICON: Record<string, ReactNode> = {
  phone: <Phone className="size-4" />, email: <Mail className="size-4" />, form: <FileText className="size-4" />,
}
function kindLabel(k: string) { return k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

export function ConversionsView({ site, from }: { site: string; from?: number }) {
  const { data, loading, error, reload } = useAsync(() => fetchConversions(site, from), [site, from])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const rows = data ?? []
  if (rows.length === 0) return <EmptyState icon={<Target className="size-8" />} title="No conversions yet"
    hint="Phone/email link clicks and custom conversion events appear here as visitors take action." />

  const byKind = new Map<string, number>()
  const byUrl = new Map<string, number>()
  for (const r of rows) {
    byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + r.count)
    if (r.url) byUrl.set(r.url, (byUrl.get(r.url) ?? 0) + r.count)
  }
  const kinds = [...byKind.entries()].sort((a, b) => b[1] - a[1])
  const urlRows: BarRow[] = [...byUrl.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))

  return (
    <div className="space-y-6">
      <Insights items={deriveConversionInsights(rows)} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {kinds.map(([kind, count]) => (
          <StatCard key={kind} label={kindLabel(kind)} value={count.toLocaleString()}
            icon={KIND_ICON[kind] ?? <Target className="size-4" />} />
        ))}
      </div>
      <Section title="Conversions by page" desc="Where conversions happen">
        <BarRows rows={urlRows} emptyLabel="No page-level conversion data" />
      </Section>
    </div>
  )
}
