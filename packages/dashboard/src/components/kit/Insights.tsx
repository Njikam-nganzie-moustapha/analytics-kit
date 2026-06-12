import { CheckCircle2, AlertTriangle, AlertCircle, Info, Lightbulb } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Insight, Severity } from '@/lib/insights'

const STYLE: Record<Severity, { icon: typeof Info; color: string }> = {
  good: { icon: CheckCircle2, color: 'text-success' },
  warn: { icon: AlertTriangle, color: 'text-[hsl(var(--brand-amber))]' },
  bad: { icon: AlertCircle, color: 'text-destructive' },
  info: { icon: Info, color: 'text-primary' },
}

export function Insights({ items }: { items: Insight[] }) {
  if (items.length === 0) return null
  return (
    <Card className="overflow-hidden">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Lightbulb className="size-4 text-[hsl(var(--brand-amber))]" />
        <h2 className="text-sm font-semibold">What this means</h2>
      </header>
      <ul className="divide-y divide-border">
        {items.map((it, i) => {
          const { icon: Icon, color } = STYLE[it.severity]
          return (
            <li key={i} className="flex gap-3 px-4 py-3">
              <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
              <div className="min-w-0">
                <p className="text-[13px] font-medium">{it.title}</p>
                <p className="text-[12px] text-muted-foreground">{it.detail}</p>
                {it.action && (
                  <p className="mt-1 text-[12px] font-medium text-primary">→ {it.action}</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
