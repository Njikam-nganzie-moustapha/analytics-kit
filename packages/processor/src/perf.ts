import type { RawEvent } from './types'

export interface PagePerfStat {
  site:  string
  url:   string
  count: number
  sumMs: number
  minMs: number
  maxMs: number
  p50:   number
  p75:   number
  p95:   number
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (p / 100) * (sorted.length - 1)
  const lo  = Math.floor(idx)
  const hi  = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

export function buildPagePerf(events: RawEvent[]): PagePerfStat[] {
  const groups = new Map<string, { site: string; url: string; durations: number[] }>()

  for (const e of events) {
    if (e.type !== 'transaction') continue
    const duration = typeof e.duration === 'number' ? e.duration : undefined
    if (duration === undefined || duration <= 0 || duration > 120_000) continue

    let url: string
    if (e.op === 'custom' && typeof e.name === 'string') {
      url = e.name.slice(0, 200) || 'unknown'
    } else if (typeof e.url === 'string') {
      try { url = new URL(e.url).pathname || '/' } catch { url = e.url.slice(0, 200) || '/' }
    } else {
      url = '/'
    }

    const key = `${e.site}\0${url}`
    if (!groups.has(key)) groups.set(key, { site: e.site, url, durations: [] })
    groups.get(key)!.durations.push(duration)
  }

  return [...groups.values()].map(({ site, url, durations }) => {
    durations.sort((a, b) => a - b)
    const sum = durations.reduce((acc, d) => acc + d, 0)
    return {
      site,
      url,
      count: durations.length,
      sumMs: sum,
      minMs: durations[0],
      maxMs: durations[durations.length - 1],
      p50: Math.round(percentile(durations, 50)),
      p75: Math.round(percentile(durations, 75)),
      p95: Math.round(percentile(durations, 95)),
    }
  })
}
