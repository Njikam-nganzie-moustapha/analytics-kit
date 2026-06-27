import { useMemo, useState } from 'react'
import { Monitor, Smartphone, MousePointerClick } from 'lucide-react'
import { fetchClickElements, fetchHeatmap } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { HeatmapOverlay } from '@/components/HeatmapOverlay'
import { cn } from '@/lib/utils'
import { LoadingState, ErrorState } from '@/components/shell/states'

type Device = 'all' | 'desktop' | 'mobile'

export function ClickMapView({ site }: { site: string }) {
  const els = useAsync(() => fetchClickElements(site), [site])
  const hm  = useAsync(() => fetchHeatmap(site), [site])
  const [url, setUrl] = useState<string>('')
  const [device, setDevice] = useState<Device>('all')

  const elements = els.data ?? []
  const cells = hm.data ?? []

  // URLs that actually have click data, busiest first.
  const urls = useMemo(() => {
    const byUrl = new Map<string, number>()
    for (const e of elements) byUrl.set(e.url, (byUrl.get(e.url) ?? 0) + e.count)
    for (const c of cells) byUrl.set(c.url, byUrl.get(c.url) ?? 0)
    return [...byUrl.entries()].sort((a, b) => b[1] - a[1]).map(([u]) => u)
  }, [elements, cells])

  const activeUrl = url || urls[0] || ''

  // Most-clicked elements for the active URL + device, aggregated by label.
  const elementRows: BarRow[] = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of elements) {
      if (activeUrl && e.url !== activeUrl) continue
      if (device !== 'all' && e.device !== device) continue
      m.set(e.el, (m.get(e.el) ?? 0) + e.count)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([label, value]) => ({ label, value }))
  }, [elements, activeUrl, device])

  const heatCells = useMemo(() => cells.filter(c => !activeUrl || c.url === activeUrl), [cells, activeUrl])

  const deviceCounts = useMemo(() => {
    let d = 0, m = 0
    for (const e of elements) { if (activeUrl && e.url !== activeUrl) continue; if (e.device === 'mobile') m += e.count; else d += e.count }
    return { desktop: d, mobile: m }
  }, [elements, activeUrl])

  if (els.loading || hm.loading) return <LoadingState />
  if (els.error) return <ErrorState message={els.error} onRetry={els.reload} />

  return (
    <div className="space-y-4">
      {/* Toolbar: URL picker + device toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={activeUrl}
          onChange={e => setUrl(e.target.value)}
          className="h-9 max-w-[420px] rounded-md border border-border bg-background px-2 font-mono text-[13px]"
        >
          {urls.length === 0 && <option value="">No click data yet</option>}
          {urls.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <div className="inline-flex rounded-md border border-border p-0.5">
          {([['all', 'All', null], ['desktop', 'Desktop', <Monitor className="size-3.5" />], ['mobile', 'Mobile', <Smartphone className="size-3.5" />]] as const).map(([d, label, icon]) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-colors',
                device === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {icon}{label}
            </button>
          ))}
        </div>

        <span className="ml-auto text-[12px] text-muted-foreground">
          <Monitor className="mr-1 inline size-3.5" />{deviceCounts.desktop.toLocaleString()} ·
          <Smartphone className="mx-1 inline size-3.5" />{deviceCounts.mobile.toLocaleString()} clicks
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Heatmap canvas */}
        <Section title="Click density" desc={activeUrl ? `Hot zones on ${activeUrl}` : 'Pick a page above'}>
          <HeatmapOverlay cells={heatCells} />
        </Section>

        {/* Most-clicked elements — the interpretable "what was touched" */}
        <Section title="Most-clicked elements" desc={device === 'all' ? 'All devices' : device === 'mobile' ? 'Mobile only' : 'Desktop only'}>
          {elementRows.length === 0 ? (
            <p className="flex items-center gap-2 py-8 text-center text-sm text-muted-foreground">
              <MousePointerClick className="size-4" /> No clicks recorded {device !== 'all' ? `on ${device}` : ''} yet.
            </p>
          ) : (
            <BarRows rows={elementRows} unit="" />
          )}
        </Section>
      </div>

      <p className="text-[12px] text-muted-foreground">
        Element labels come from each click's nearest button/link text — the clearest signal of what visitors actually tap.
        Mobile vs Desktop are tracked separately. A visual overlay on the real page is coming next.
      </p>
    </div>
  )
}
