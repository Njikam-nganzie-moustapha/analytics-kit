import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  desc?: ReactNode
  action?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}

export function Section({ title, desc, action, className, bodyClassName, children }: Props) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {desc && <p className="text-[12px] text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </header>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </Card>
  )
}
