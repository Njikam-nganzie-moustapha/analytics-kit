import { Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { NAV, type View } from './nav'

interface Props {
  active: View
  onSelect: (v: View) => void
  onNavigate?: () => void
  brandName?: string | null
  brandLogo?: string | null
}

export function SidebarNav({ active, onSelect, onNavigate, brandName, brandLogo }: Props) {
  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto px-3 py-4" aria-label="Primary">
      <div className="mb-4 flex items-center gap-2 px-2">
        {brandLogo ? (
          <img src={brandLogo} alt="" className="size-8 rounded-lg object-cover" />
        ) : (
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Activity className="size-4" />
          </span>
        )}
        <span className="truncate text-[15px] font-bold tracking-tight">
          {brandName ? brandName : <>analytics<span className="text-primary">kit</span></>}
        </span>
      </div>

      {NAV.map((group, gi) => (
        <div key={gi} className="mb-1">
          {group.label && (
            <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.label}
            </p>
          )}
          {group.items.map(item => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => { onSelect(item.id); onNavigate?.() }}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground',
                )}
              >
                <Icon className={cn('size-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
