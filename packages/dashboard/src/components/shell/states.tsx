import type { ReactNode } from 'react'
import { AlertTriangle, Inbox, Hammer } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

export function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <Skeleton className="h-48 rounded-xl" />
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="grid place-items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-16 text-center">
      <AlertTriangle className="mb-3 size-8 text-destructive" />
      <p className="font-semibold text-destructive">Request failed</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Retry</Button>}
    </div>
  )
}

export function EmptyState({ title, hint, icon }: { title: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border px-6 py-16 text-center">
      <span className="mb-3 text-muted-foreground">{icon ?? <Inbox className="size-8" />}</span>
      <p className="font-semibold">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function ComingSoon({ title }: { title: string }) {
  return (
    <EmptyState
      icon={<Hammer className="size-8" />}
      title={`${title} — wiring up`}
      hint="This view lands in the current milestone once its backend aggregation ships."
    />
  )
}
