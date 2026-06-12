import { Monitor, Smartphone, Tablet } from 'lucide-react'
import { fetchDevices } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { Insights } from '@/components/kit/Insights'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { StatCard } from '@/components/kit/StatCard'
import { deriveDeviceInsights } from '@/lib/insights'
import { LoadingState, ErrorState, EmptyState } from '@/components/shell/states'

export function DevicesView({ site }: { site: string }) {
  const { data, loading, error, reload } = useAsync(() => fetchDevices(site), [site])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const rows = data ?? []
  if (rows.length === 0) return <EmptyState title="No device data yet" hint="Device, browser and OS are parsed from visitor sessions." />

  const sumBy = (sel: (r: typeof rows[number]) => string): BarRow[] => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(sel(r), (m.get(sel(r)) ?? 0) + r.sessions)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }))
  }
  const byType = new Map<string, number>()
  for (const r of rows) byType.set(r.deviceType, (byType.get(r.deviceType) ?? 0) + r.sessions)
  const total = rows.reduce((a, r) => a + r.sessions, 0) || 1

  const browserRows = sumBy(r => r.browser)
  const osRows = sumBy(r => r.os)

  const pct = (t: string) => Math.round(((byType.get(t) ?? 0) / total) * 100)

  return (
    <div className="space-y-6">
      <Insights items={deriveDeviceInsights(rows)} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Desktop" value={`${pct('desktop')}%`} icon={<Monitor className="size-4" />} sub={`${(byType.get('desktop') ?? 0).toLocaleString()} sessions`} />
        <StatCard label="Mobile" value={`${pct('mobile')}%`} icon={<Smartphone className="size-4" />} sub={`${(byType.get('mobile') ?? 0).toLocaleString()} sessions`} />
        <StatCard label="Tablet" value={`${pct('tablet')}%`} icon={<Tablet className="size-4" />} sub={`${(byType.get('tablet') ?? 0).toLocaleString()} sessions`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Browsers" desc="Sessions by browser"><BarRows rows={browserRows} /></Section>
        <Section title="Operating systems" desc="Sessions by OS"><BarRows rows={osRows} /></Section>
      </div>
    </div>
  )
}
