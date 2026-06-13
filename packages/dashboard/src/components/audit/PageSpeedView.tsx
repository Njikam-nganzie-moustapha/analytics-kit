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
      <Section title="PageSpeed (Google Lighthouse)" desc="Lab performance score from Google PageSpeed Insights — complements your real-user vitals.">
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
        <EmptyState icon={<Gauge className="size-8" />} title="Test a page" hint="Runs Google Lighthouse on the URL and reports the lab performance score and metrics." />
      )}

      {result && (
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <Card className="flex flex-col items-center justify-center p-6">
            <HealthGauge score={result.score} />
            <p className="mt-2 text-[12px] capitalize text-muted-foreground">{result.strategy} performance</p>
          </Card>
          <Card className="p-4">
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
      )}
    </div>
  )
}
