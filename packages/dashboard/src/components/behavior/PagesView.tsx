import { useState } from 'react'
import { ArrowDownRight, ArrowUpRight, Download, Search } from 'lucide-react'
import { fetchPages } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { LoadingState, ErrorState } from '@/components/shell/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { PageRow } from '@/types'

function pctDelta(curr: number, prev: number): number | undefined {
  if (prev === 0) return undefined
  return Math.round(((curr - prev) / prev) * 100)
}

function DeltaChip({ delta }: { delta: number | undefined }) {
  if (typeof delta !== 'number' || !isFinite(delta)) return null
  const up = delta >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
      up ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
      {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
      {Math.abs(delta)}%
    </span>
  )
}

function pct(a: number, total: number) {
  return total > 0 ? `${Math.round((a / total) * 100)}%` : '0%'
}

function fmtDur(ms: number): string {
  if (ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function downloadCsv(rows: PageRow[], totalViews: number): void {
  const header = 'URL,Views,%,Entries,Exits,Bounce Rate,Avg Duration (s)'
  const lines = rows.map(r => [
    JSON.stringify(r.url),
    r.views,
    Math.round((r.views / (totalViews || 1)) * 100) + '%',
    r.entries,
    r.exits,
    r.bounceRate + '%',
    Math.round(r.avgDuration / 1000),
  ].join(','))
  const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'pages.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function PagesView({ site, from }: { site: string; from?: number }) {
  const now = Date.now()
  const prevFrom = from ? from - (now - from) : undefined
  const prevTo   = from

  const { data, loading, error, reload } = useAsync(() => fetchPages(site, from),                 [site, from])
  const { data: prevData }               = useAsync(() => prevFrom !== undefined
    ? fetchPages(site, prevFrom, prevTo)
    : Promise.resolve(undefined as PageRow[] | undefined),                                         [site, prevFrom, prevTo])

  const [search, setSearch] = useState('')

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />

  const rows       = data ?? []
  const prevRows   = prevData ?? []
  const totalViews = rows.reduce((a, r) => a + r.views, 0) || 1
  const prevTotal  = prevRows.reduce((a, r) => a + r.views, 0)
  const totalDelta = from ? pctDelta(totalViews - 1 /* undo the || 1 */, prevTotal) : undefined

  // Build prev-period view lookup keyed by URL
  const prevViewMap = new Map<string, number>(prevRows.map(r => [r.url, r.views]))

  const q       = search.toLowerCase().trim()
  const visible = q ? rows.filter(r => r.url.toLowerCase().includes(q)) : rows

  return (
    <div className="space-y-6">
      <Section
        title="Top pages"
        desc={
          <span className="flex items-center gap-2">
            Most viewed pages in the selected period
            {totalDelta !== undefined && <DeltaChip delta={totalDelta} />}
          </span>
        }
      >
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No page data yet — pageview events are processed every 5 minutes.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder="Filter by URL…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs"
                onClick={() => downloadCsv(visible, totalViews)}>
                <Download className="size-3" />
                CSV
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 font-medium">URL</th>
                    <th className="pb-2 pr-3 text-right font-medium">Views</th>
                    <th className="pb-2 pr-3 text-right font-medium">%</th>
                    <th className="pb-2 pr-3 text-right font-medium">Entries</th>
                    <th className="pb-2 pr-3 text-right font-medium">Exits</th>
                    <th className="pb-2 pr-3 text-right font-medium">Bounce</th>
                    <th className="pb-2 text-right font-medium">Avg time</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(r => {
                    const rowDelta = from ? pctDelta(r.views, prevViewMap.get(r.url) ?? 0) : undefined
                    return (
                      <tr key={r.url} className="group border-b border-border/50 last:border-0">
                        <td className="py-2 pr-4">
                          <div className="relative">
                            <div
                              className="absolute inset-y-0 left-0 rounded-sm bg-primary/10"
                              style={{ width: pct(r.views, totalViews) }}
                            />
                            <span className="relative truncate font-mono text-xs">{r.url}</span>
                          </div>
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className="mr-1">{r.views.toLocaleString()}</span>
                          <DeltaChip delta={rowDelta} />
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">{pct(r.views, totalViews)}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.entries.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{r.exits.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <span className={r.bounceRate > 70 ? 'text-destructive' : r.bounceRate > 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-green-600 dark:text-green-400'}>
                            {r.entries > 0 ? `${r.bounceRate}%` : '—'}
                          </span>
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">{fmtDur(r.avgDuration)}</td>
                      </tr>
                    )
                  })}
                  {visible.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">No pages match &ldquo;{search}&rdquo;</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Section>
    </div>
  )
}
