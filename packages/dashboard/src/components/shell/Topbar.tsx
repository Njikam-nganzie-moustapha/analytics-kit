import { useState } from 'react'
import { Check, ChevronsUpDown, Menu, Bookmark, LogOut, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/theme'
import { RANGE_OPTIONS, type RangeKey } from '@/timerange'
import { viewLabel, type View } from './nav'

interface Props {
  view: View
  sites: string[]
  site: string
  onSite: (s: string) => void
  url: string
  onUrl: (u: string) => void
  range: RangeKey
  onRange: (r: RangeKey) => void
  refreshEvery: number
  onRefreshEvery: (n: number) => void
  lastRefreshed: Date | null
  onSaveView: () => void
  authRequired: boolean
  onSignOut: () => void
  onMenu: () => void
}

function SitePicker({ sites, site, onSite }: { sites: string[]; site: string; onSite: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-9 w-[180px] justify-between font-mono text-[13px]">
          <span className="truncate">{site || 'Select site…'}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search or type site ID…" value={typed} onValueChange={setTyped} />
          <CommandList>
            <CommandEmpty>
              {typed ? (
                <button className="w-full px-2 py-1.5 text-left text-sm hover:text-primary" onClick={() => { onSite(typed.trim()); setOpen(false) }}>
                  Load “{typed.trim()}”
                </button>
              ) : 'No sites found.'}
            </CommandEmpty>
            <CommandGroup>
              {sites.map(s => (
                <CommandItem key={s} value={s} onSelect={() => { onSite(s); setOpen(false) }} className="font-mono text-[13px]">
                  <Check className={cn('mr-2 size-3.5', site === s ? 'opacity-100' : 'opacity-0')} />
                  {s}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function Topbar(p: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-xl md:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={p.onMenu} aria-label="Open navigation">
        <Menu className="size-5" />
      </Button>

      <h1 className="hidden text-sm font-semibold text-foreground/90 md:block">{viewLabel(p.view)}</h1>
      <Separator orientation="vertical" className="mx-1 hidden h-6 md:block" />

      <SitePicker sites={p.sites} site={p.site} onSite={p.onSite} />

      <Input
        value={p.url}
        onChange={e => p.onUrl(e.target.value)}
        placeholder="/url filter (optional)"
        className="hidden h-9 w-[200px] font-mono text-[13px] xl:block"
      />

      <div className="ml-auto flex items-center gap-1.5">
        <Select value={p.range} onValueChange={v => p.onRange(v as RangeKey)}>
          <SelectTrigger className="h-9 w-[130px] text-[13px]" aria-label="Time range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(p.refreshEvery)} onValueChange={v => p.onRefreshEvery(Number(v))}>
          <SelectTrigger className="hidden h-9 w-[44px] px-2 sm:flex" aria-label="Auto-refresh interval">
            <RefreshCw className={cn('size-3.5', p.refreshEvery > 0 && 'text-primary')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">Auto-refresh off</SelectItem>
            <SelectItem value="30">Every 30s</SelectItem>
            <SelectItem value="60">Every 1m</SelectItem>
            <SelectItem value="300">Every 5m</SelectItem>
          </SelectContent>
        </Select>

        {p.site && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={p.onSaveView} aria-label="Bookmark current view">
                <Bookmark className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Bookmark this view</TooltipContent>
          </Tooltip>
        )}

        <ThemeToggle />

        {p.authRequired && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={p.onSignOut} aria-label="Sign out">
                <LogOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        )}
      </div>
    </header>
  )
}
