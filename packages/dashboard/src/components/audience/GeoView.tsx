import { fetchGeo } from '@/api'
import { useAsync } from '@/hooks/useAsync'
import { Section } from '@/components/kit/Section'
import { Insights } from '@/components/kit/Insights'
import { BarRows, type BarRow } from '@/components/kit/BarRows'
import { deriveGeoInsights } from '@/lib/insights'
import { LoadingState, ErrorState } from '@/components/shell/states'

// alpha-2 → flag emoji via regional indicator symbols
function flag(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc)) return '🏳️'
  return String.fromCodePoint(...[...cc.toUpperCase()].map(c => 0x1f1e6 + c.charCodeAt(0) - 65))
}

const REGION = new Intl.DisplayNames(['en'], { type: 'region' })
function countryName(cc: string): string {
  try { return REGION.of(cc.toUpperCase()) ?? cc } catch { return cc }
}

export function GeoView({ site }: { site: string }) {
  const { data, loading, error, reload } = useAsync(() => fetchGeo(site), [site])
  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} onRetry={reload} />
  const rows = data ?? []

  const byCountry = new Map<string, number>()
  for (const r of rows) byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + r.sessions)
  const countryRows: BarRow[] = [...byCountry.entries()].sort((a, b) => b[1] - a[1])
    .map(([cc, v]) => ({ label: `${flag(cc)}  ${countryName(cc)}`, value: v, hint: cc }))

  const cities = rows.filter(r => r.city).sort((a, b) => b.sessions - a.sessions).slice(0, 30)

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="lg:col-span-2"><Insights items={deriveGeoInsights(rows)} /></div>
      <Section title="Countries" desc="Sessions by country">
        <BarRows rows={countryRows} emptyLabel="No geography data yet — country/city come from the Cloudflare edge on a deployed origin." />
      </Section>
      <Section title="Top cities" desc="Sessions by city">
        {cities.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No city-level data.</p>
        ) : (
          <ul className="space-y-2">
            {cities.map((c, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="truncate">{flag(c.country)} {c.city}<span className="ml-1 text-[12px] text-muted-foreground">{countryName(c.country)}</span></span>
                <span className="tabular-nums text-muted-foreground">{c.sessions.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
