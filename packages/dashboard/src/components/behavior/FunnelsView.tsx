import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2, Play, Save, FilePlus, GripVertical } from 'lucide-react'
import { fetchFunnels, saveFunnel, deleteFunnel, computeFunnel } from '@/api'
import { Section } from '@/components/kit/Section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LoadingState, ErrorState, EmptyState } from '@/components/shell/states'
import { toast } from 'sonner'
import type { FunnelDef, FunnelResult, FunnelStep } from '@/types'

const DEFAULT_STEPS: FunnelStep[] = [
  { label: 'Landing', type: 'url', match: '/' },
  { label: 'Converted', type: 'event', match: 'signup' },
]

export function FunnelsView({ site, from }: { site: string; from?: number }) {
  const [funnels, setFunnels] = useState<FunnelDef[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')

  const [id, setId] = useState<string | null>(null)
  const [name, setName] = useState('New funnel')
  const [steps, setSteps] = useState<FunnelStep[]>(DEFAULT_STEPS)
  const [result, setResult] = useState<FunnelResult | null>(null)
  const [computing, setComputing] = useState(false)

  const compute = useCallback(async (s: FunnelStep[]) => {
    if (s.length < 2) return
    setComputing(true)
    try { setResult(await computeFunnel(site, s, from)) }
    catch (e) { toast.error(`Compute failed: ${e instanceof Error ? e.message : String(e)}`) }
    finally { setComputing(false) }
  }, [site, from])

  const selectFunnel = useCallback((f: FunnelDef) => {
    setId(f.id); setName(f.name); setSteps(f.steps); compute(f.steps)
  }, [compute])

  useEffect(() => {
    setListLoading(true); setListError('')
    fetchFunnels(site)
      .then(fs => {
        setFunnels(fs)
        if (fs.length > 0) selectFunnel(fs[0])
        else { setId(null); setName('New funnel'); setSteps(DEFAULT_STEPS); setResult(null) }
      })
      .catch(e => setListError(e instanceof Error ? e.message : String(e)))
      .finally(() => setListLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site])

  // Recompute when the time range changes and a funnel is loaded
  useEffect(() => { if (result) compute(steps); /* eslint-disable-next-line */ }, [from])

  function newFunnel() { setId(null); setName('New funnel'); setSteps(DEFAULT_STEPS); setResult(null) }
  function updateStep(i: number, patch: Partial<FunnelStep>) { setSteps(s => s.map((st, idx) => idx === i ? { ...st, ...patch } : st)) }
  function addStep() { if (steps.length < 8) setSteps(s => [...s, { label: `Step ${s.length + 1}`, type: 'url', match: '' }]) }
  function removeStep(i: number) { if (steps.length > 2) setSteps(s => s.filter((_, idx) => idx !== i)) }

  async function save() {
    if (steps.some(s => !s.match.trim())) { toast.error('Every step needs a match value'); return }
    try {
      const newId = await saveFunnel(site, name, steps, id ?? undefined)
      setId(newId)
      setFunnels(await fetchFunnels(site))
      toast.success('Funnel saved')
      compute(steps)
    } catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  async function remove() {
    if (!id) return
    try {
      await deleteFunnel(site, id)
      const fs = await fetchFunnels(site)
      setFunnels(fs)
      if (fs.length > 0) selectFunnel(fs[0]); else newFunnel()
      toast.success('Funnel deleted')
    } catch (e) { toast.error(`Delete failed: ${e instanceof Error ? e.message : String(e)}`) }
  }

  if (listLoading) return <LoadingState />
  if (listError) return <ErrorState message={listError} />

  return (
    <div className="space-y-6">
      <Section
        title="Funnel builder"
        desc="Define 2–8 ordered steps (a page URL or a custom event). We count sessions that complete them in order."
        action={
          <div className="flex items-center gap-2">
            {funnels.length > 0 && (
              <Select value={id ?? 'new'} onValueChange={v => { if (v === 'new') newFunnel(); else { const f = funnels.find(x => x.id === v); if (f) selectFunnel(f) } }}>
                <SelectTrigger className="h-9 w-[180px] text-[13px]"><SelectValue placeholder="Saved funnels" /></SelectTrigger>
                <SelectContent>
                  {funnels.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  <SelectItem value="new">+ New funnel</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={newFunnel}><FilePlus className="mr-1 size-4" /> New</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Funnel name" className="max-w-sm font-medium" />

          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/10 text-[12px] font-semibold text-primary">{i + 1}</span>
                <Input value={step.label} onChange={e => updateStep(i, { label: e.target.value })} placeholder="Label" className="h-9 w-[150px]" />
                <Select value={step.type} onValueChange={v => updateStep(i, { type: v as FunnelStep['type'] })}>
                  <SelectTrigger className="h-9 w-[120px] text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="url">Page URL</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={step.match}
                  onChange={e => updateStep(i, { match: e.target.value })}
                  placeholder={step.type === 'url' ? 'e.g. /checkout' : 'e.g. signup'}
                  className="h-9 flex-1 font-mono text-[13px]"
                />
                <Button variant="ghost" size="icon" onClick={() => removeStep(i)} disabled={steps.length <= 2} aria-label={`Remove step ${i + 1}`}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={addStep} disabled={steps.length >= 8}><Plus className="mr-1 size-4" /> Add step</Button>
            <div className="flex-1" />
            {id && <Button variant="ghost" size="sm" onClick={remove} className="text-destructive hover:text-destructive"><Trash2 className="mr-1 size-4" /> Delete</Button>}
            <Button variant="outline" size="sm" onClick={save}><Save className="mr-1 size-4" /> {id ? 'Save' : 'Save funnel'}</Button>
            <Button size="sm" onClick={() => compute(steps)} disabled={computing}><Play className="mr-1 size-4" /> {computing ? 'Computing…' : 'Run funnel'}</Button>
          </div>
        </div>
      </Section>

      {result && <FunnelResultView result={result} steps={steps} />}
    </div>
  )
}

function FunnelResultView({ result, steps }: { result: FunnelResult; steps: FunnelStep[] }) {
  const top = result.counts[0] || result.total || 0
  if (top === 0) return <EmptyState title="No sessions matched step 1" hint="Check the first step's match value, or widen the time range." />

  // Find the biggest drop-off to highlight
  let worstIdx = -1, worstDrop = 0
  for (let i = 1; i < result.counts.length; i++) {
    const drop = (result.counts[i - 1] - result.counts[i]) / (result.counts[i - 1] || 1)
    if (drop > worstDrop) { worstDrop = drop; worstIdx = i }
  }

  return (
    <Section title="Results" desc={`${result.total.toLocaleString()} sessions analysed · ${Math.round((result.counts[result.counts.length - 1] / top) * 100)}% complete the funnel`}>
      <ol className="space-y-3" role="list">
        {steps.map((step, i) => {
          const count = result.counts[i] ?? 0
          const prev = i === 0 ? top : (result.counts[i - 1] ?? top)
          const stepRate = prev > 0 ? Math.round((count / prev) * 100) : 0
          const overall = top > 0 ? Math.round((count / top) * 100) : 0
          const width = top > 0 ? Math.max(2, (count / top) * 100) : 2
          return (
            <li key={i}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">
                  <span className="mr-2 text-muted-foreground">{i + 1}.</span>{step.label}
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">{step.type === 'url' ? 'url~' : 'event~'}{step.match}</span>
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {count.toLocaleString()} · {overall}%{i > 0 && <span className={stepRate < 50 ? 'text-destructive' : 'text-success'}> ({stepRate}% from prev)</span>}
                </span>
              </div>
              <div className="h-8 overflow-hidden rounded bg-muted">
                <div className="h-full rounded bg-primary/80 transition-all" style={{ width: `${width}%` }} />
              </div>
              {i === worstIdx && worstDrop >= 0.3 && (
                <p className="mt-1 text-[12px] font-medium text-destructive">
                  ↘ Biggest drop-off here — {Math.round(worstDrop * 100)}% of sessions leave between “{steps[i - 1].label}” and “{step.label}”.
                </p>
              )}
            </li>
          )
        })}
      </ol>
    </Section>
  )
}
