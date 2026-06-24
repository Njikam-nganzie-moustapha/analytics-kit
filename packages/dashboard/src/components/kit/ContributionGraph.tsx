import { useMemo } from 'react'
import type { ActivityDay } from '@/types'

// GitHub-style contribution calendar: one cell per day, greener with more traffic.
// Columns = weeks (Sun→Sat rows). Intensity is bucketed into 5 levels relative to
// the busiest day so the scale adapts to each site's volume.

const LEVEL_BG = [
  'bg-muted',                       // 0 — no traffic
  'bg-primary/25',
  'bg-primary/45',
  'bg-primary/70',
  'bg-primary',                     // 4 — busiest
]
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DOW = ['', 'Mon', '', 'Wed', '', 'Fri', '']

function level(sessions: number, max: number): number {
  if (sessions <= 0 || max <= 0) return 0
  const r = sessions / max
  if (r > 0.66) return 4
  if (r > 0.33) return 3
  if (r > 0.12) return 2
  return 1
}

export function ContributionGraph({ data }: { data: ActivityDay[] }) {
  const { weeks, max, total, monthCols } = useMemo(() => {
    const max = data.reduce((m, d) => Math.max(m, d.sessions), 0)
    const total = data.reduce((s, d) => s + d.sessions, 0)
    // Pad the head so the first column starts on Sunday.
    const first = data.length ? new Date(data[0].day + 'T00:00:00Z') : new Date()
    const pad = first.getUTCDay()
    const cells: (ActivityDay | null)[] = [...Array(pad).fill(null), ...data]
    const weeks: (ActivityDay | null)[][] = []
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
    // Month label per column (when the month changes at the top of the week).
    const monthCols: { col: number; label: string }[] = []
    let lastMonth = -1
    weeks.forEach((w, col) => {
      const d = w.find(Boolean) as ActivityDay | undefined
      if (!d) return
      const m = new Date(d.day + 'T00:00:00Z').getUTCMonth()
      if (m !== lastMonth) { monthCols.push({ col, label: MONTHS[m] }); lastMonth = m }
    })
    return { weeks, max, total, monthCols }
  }, [data])

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[12px] text-muted-foreground">
        <span>{total.toLocaleString()} sessions in the last {data.length} days</span>
        <span className="flex items-center gap-1">
          Less
          {LEVEL_BG.map((bg, i) => <span key={i} className={`size-[11px] rounded-[2px] ${bg}`} />)}
          More
        </span>
      </div>
      <div className="overflow-x-auto">
        <div className="inline-flex flex-col gap-1">
          {/* month header */}
          <div className="flex gap-[3px] pl-7 text-[10px] text-muted-foreground">
            {weeks.map((_, col) => {
              const m = monthCols.find(x => x.col === col)
              return <span key={col} className="w-[11px]">{m ? m.label : ''}</span>
            })}
          </div>
          <div className="flex gap-[3px]">
            {/* weekday labels */}
            <div className="mr-1 flex flex-col gap-[3px] text-[9px] leading-[11px] text-muted-foreground">
              {DOW.map((d, i) => <span key={i} className="h-[11px]">{d}</span>)}
            </div>
            {/* week columns */}
            {weeks.map((week, col) => (
              <div key={col} className="flex flex-col gap-[3px]">
                {Array.from({ length: 7 }, (_, row) => {
                  const cell = week[row]
                  if (!cell) return <span key={row} className="size-[11px]" />
                  return (
                    <span
                      key={row}
                      className={`size-[11px] rounded-[2px] ${LEVEL_BG[level(cell.sessions, max)]}`}
                      title={`${cell.day}: ${cell.sessions} session${cell.sessions === 1 ? '' : 's'}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
