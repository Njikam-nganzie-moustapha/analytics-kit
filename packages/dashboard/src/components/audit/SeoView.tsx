import { useState } from 'react'
import { Search, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { fetchSeo } from '@/api'
import { Section } from '@/components/kit/Section'
import { HealthGauge } from '@/components/kit/HealthGauge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/shell/states'
import { cn } from '@/lib/utils'
import type { SeoReport, SeoCheck } from '@/types'

const ICON = {
  pass: { I: CheckCircle2, c: 'text-success' },
  warn: { I: AlertTriangle, c: 'text-[hsl(var(--brand-amber))]' },
  fail: { I: XCircle, c: 'text-destructive' },
}
const ORDER = { fail: 0, warn: 1, pass: 2 }

export function SeoView({ url: initialUrl }: { url?: string }) {
  const [url, setUrl] = useState(initialUrl || '')
  const [report, setReport] = useState<SeoReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    const target = url.trim()
    if (!target) return
    setLoading(true); setError(''); setReport(null)
    try { setReport(await fetchSeo(target)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setLoading(false) }
  }

  const checks = report ? [...report.checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : []
  const counts = report ? report.checks.reduce((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {} as Record<string, number>) : {}

  return (
    <div className="space-y-6">
      <Section title="SEO audit" desc="Fetches a page and checks it against on-page SEO best practices.">
        <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); run() }}>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://yoursite.com/page" className="h-9 flex-1 font-mono text-[13px]" inputMode="url" />
          <Button type="submit" disabled={loading || !url.trim()}><Search className="mr-1 size-4" /> {loading ? 'Auditing…' : 'Audit'}</Button>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Section>

      {!report && !loading && !error && (
        <EmptyState icon={<Search className="size-8" />} title="Audit any page" hint="Enter a full URL above to score its on-page SEO and get specific fixes." />
      )}

      {report && (
        <>
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <Card className="flex flex-col items-center justify-center p-6">
              <HealthGauge score={report.score} />
              <p className="mt-2 text-[12px] text-muted-foreground">SEO score</p>
            </Card>
            <Card className="p-4">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Title</dt>
                  <dd className="truncate">{report.title || <span className="text-destructive">missing</span>}</dd>
                </div>
                <div>
                  <dt className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Meta description</dt>
                  <dd className="text-muted-foreground">{report.description || <span className="text-destructive">missing</span>}</dd>
                </div>
                <div className="flex gap-4 pt-1 text-[13px]">
                  <span className="text-success">{counts.pass ?? 0} passed</span>
                  <span className="text-[hsl(var(--brand-amber))]">{counts.warn ?? 0} warnings</span>
                  <span className="text-destructive">{counts.fail ?? 0} failed</span>
                </div>
              </dl>
            </Card>
          </div>

          <Section title="Checks" desc="Failures first — each comes with a specific fix.">
            <ul className="divide-y divide-border">
              {checks.map((ck: SeoCheck) => {
                const { I, c } = ICON[ck.status]
                return (
                  <li key={ck.id} className="flex gap-3 py-3">
                    <I className={cn('mt-0.5 size-4 shrink-0', c)} />
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{ck.label}</p>
                      <p className="text-[12px] text-muted-foreground">{ck.detail}</p>
                      {ck.fix && <p className="mt-0.5 text-[12px] font-medium text-primary">→ {ck.fix}</p>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  )
}
