import { X } from 'lucide-react'
import type { SavedView } from '@/types'

interface Props {
  views: SavedView[]
  onApply: (v: SavedView) => void
  onRemove: (id: string) => void
}

export function SavedViewsBar({ views, onApply, onRemove }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Saved</span>
      {views.map(v => (
        <span key={v.id} className="group inline-flex items-center rounded-full border border-border bg-card pl-3 pr-1 text-[12px] shadow-sm">
          <button onClick={() => onApply(v)} title={v.label} className="max-w-[220px] truncate py-1 text-foreground/80 hover:text-primary">
            {v.label}
          </button>
          <button onClick={() => onRemove(v.id)} aria-label={`Remove ${v.label}`} className="ml-1 grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}
