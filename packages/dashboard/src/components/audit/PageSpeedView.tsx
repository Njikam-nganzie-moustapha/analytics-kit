import { useState } from 'react'
import { Gauge } from 'lucide-react'
import { fetchPageSpeed } from '@/api'
import { Section } from '@/components/kit/Section'
import { HealthGauge } from '@/components/kit/HealthGauge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shell/states'
import { cn } from '@/lib/utils'
import type { PageSpeedResult } from '@/types'

function ScoreBadge({ label, score }: { label: string; score: number }) {
  const color = score >= 90 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-destructive'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('text-2xl font-bold tabular-nums', color)}>{score}</span>
      <span className="text-center text-[11px] text-muted-foreground">{label}</span>
    </div>
  )
}

export function PageSpeedView({ url: initialUrl }: { url?: string }) {
  const [url, setUrl] = useState(initialUrl || '')
  const [strategy, setStrategy] = useState<'mobile' | 'desktop'>('mobile')
  const [result, setResult] = useState<PageSpeedResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run(s: 'mobile' | 'desktop' = strategy) {
    const target = url.trim()
    if (!target) return
    setStrategy(s); setLoading(true); setError(''); setResult(null)
    try { setResult(await fetchPageSpeed(target, s)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      <Section title="PageSpeed (Google Lighthouse)" desc="Lab performance scores from Google PageSpeed Insights — complements your real-user vitals.">
        <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); run() }}>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yoursite.com/page" className="h-9 flex-1 font-mono text-[13px]" inputMode="url" />
          <div className="inline-flex overflow-hidden rounded-md border border-border">
            {(['mobile', 'desktop'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStrategy(s)}
                className={cn('px-3 py-1.5 text-[13px] capitalize', strategy === s ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {s}
              </button>
            ))}
          </div>
          <Button type="submit" disabled={loading || !url.trim()}><Gauge className="mr-1 size-4" /> {loading ? 'Testing…' : 'Test'}</Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Section>

      {!result && !loading && !error && (
        <EmptyState icon={<Gauge className="size-8" />} title="Test a page" hint="Runs Google Lighthouse on the URL and reports scores across Performance, Accessibility, SEO and Best Practices." />
      )}

      {result && (
        <div className="space-y-4">
          {/* 4 category score cards */}
          {result.categories && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                { key: 'performance',   label: 'Performance' },
                { key: 'accessibility', label: 'Accessibility' },
                { key: 'seo',           label: 'SEO' },
                { key: 'bestPractices', label: 'Best Practices' },
              ] as { key: keyof typeof result.categories; label: string }[]).map(({ key, label }) => (
                <Card key={key} className="flex flex-col items-center justify-center p-4">
                  <ScoreBadge label={label} score={result.categories![key]} />
                </Card>
              ))}
            </div>
          )}

          {/* Detailed metrics */}
          <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
            {!result.categories && (
              <Card className="flex flex-col items-center justify-center p-6">
                <HealthGauge score={result.score} />
                <p className="mt-2 text-[12px] capitalize text-muted-foreground">{result.strategy} performance</p>
              </Card>
            )}
            <Card className={cn('p-4', !result.categories && '')}>
              <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Lab metrics ({result.strategy})</p>
              <ul className="divide-y divide-border">
                {result.metrics.map(m => (
                  <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                    <span>{m.label}</span>
                    <span className="font-mono tabular-nums">{m.display}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}
