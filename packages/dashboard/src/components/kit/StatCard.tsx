import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { InfoTip } from './InfoTip'

interface Props {
  label: string
  value: ReactNode
  sub?: ReactNode
  icon?: ReactNode
  help?: string           // plain-language explanation shown as an info tooltip
  delta?: number          // percentage change; sign drives color/arrow
  deltaGood?: 'up' | 'down' // which direction is "good" (default up)
}

export function StatCard({ label, value, sub, icon, help, delta, deltaGood = 'up' }: Props) {
  const hasDelta = typeof delta === 'number' && isFinite(delta)
  const positive = (delta ?? 0) >= 0
  const good = hasDelta && (deltaGood === 'up' ? positive : !positive)
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
          {help && <InfoTip help={help} label={label} />}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
        {hasDelta && (
          <span className={cn('mb-1 inline-flex items-center gap-0.5 text-[12px] font-medium tabular-nums',
            good ? 'text-success' : 'text-destructive')}>
            {positive ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
            {Math.abs(delta!).toFixed(0)}%
          </span>
        )}
      </div>
      {sub && <p className="mt-1 text-[12px] text-muted-foreground">{sub}</p>}
    </Card>
  )
}
