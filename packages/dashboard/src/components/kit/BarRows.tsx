import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface BarRow {
  label: string
  value: number
  hint?: string
  color?: string
  /** Percentage change vs previous period (positive = up, negative = down). */
  delta?: number
}

interface Props {
  rows: BarRow[]
  total?: number          // denominator for % (defaults to sum)
  unit?: string
  emptyLabel?: string
  max?: number            // cap rows shown
}

// Accessible horizontal bar list — value + share rendered as text, not just a
// bar, so meaning never relies on width/color alone.
export function BarRows({ rows, total, unit = '', emptyLabel = 'No data', max = 12 }: Props) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
  const sum = (total ?? rows.reduce((a, r) => a + r.value, 0)) || 1
  const peak = Math.max(...rows.map(r => r.value), 1)
  return (
    <ul className="space-y-2.5">
      {rows.slice(0, max).map((r, i) => {
        const pct   = Math.round((r.value / sum) * 100)
        const width = Math.max(2, Math.round((r.value / peak) * 100))
        const hasDelta = typeof r.delta === 'number' && isFinite(r.delta)
        const up       = (r.delta ?? 0) >= 0
        return (
          <li key={`${r.label}-${i}`} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px]" title={r.hint ?? r.label}>{r.label}</span>
            </div>
            <span className="flex items-center gap-2 text-[12px] tabular-nums text-muted-foreground">
              {r.value.toLocaleString()}{unit}
              <span className="text-foreground/70">· {pct}%</span>
              {hasDelta && (
                <span className={cn('inline-flex items-center gap-0.5 font-medium',
                  up ? 'text-green-600 dark:text-green-400' : 'text-destructive')}>
                  {up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {Math.abs(r.delta!).toFixed(0)}%
                </span>
              )}
            </span>
            <div className="col-span-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn('h-full rounded-full', !r.color && 'bg-primary')}
                style={{ width: `${width}%`, background: r.color }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
