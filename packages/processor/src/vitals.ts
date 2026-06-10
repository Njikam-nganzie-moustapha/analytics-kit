import type { RawEvent } from './types'

export type VitalMetric = 'lcp' | 'fcp' | 'fid' | 'cls' | 'ttfb'
export type VitalRating  = 'good' | 'needs-improvement' | 'poor'

const VITAL_TYPES = new Set<string>(['lcp', 'fcp', 'fid', 'cls', 'ttfb'])

export interface VitalBucket {
  site:    string
  url:     string
  metric:  VitalMetric
  good:    number
  needsImp: number
  poor:    number
  sumValue: number
  total:   number
}

export function buildVitalsBuckets(events: RawEvent[]): VitalBucket[] {
  const map = new Map<string, VitalBucket>()

  for (const e of events) {
    if (!VITAL_TYPES.has(e.type)) continue
    if (typeof e.value !== 'number') continue

    const url    = normalizeUrl(String(e.url ?? ''))
    const key    = `${e.site}\x00${url}\x00${e.type}`
    const rating = String(e.rating ?? rateLocally(e.type as VitalMetric, e.value))
    const hit    = map.get(key)

    if (hit) {
      if (rating === 'good')               hit.good++
      else if (rating === 'needs-improvement') hit.needsImp++
      else                                 hit.poor++
      hit.sumValue += e.value
      hit.total++
    } else {
      map.set(key, {
        site:     e.site,
        url,
        metric:   e.type as VitalMetric,
        good:     rating === 'good' ? 1 : 0,
        needsImp: rating === 'needs-improvement' ? 1 : 0,
        poor:     rating === 'poor' ? 1 : 0,
        sumValue: e.value,
        total:    1,
      })
    }
  }

  return [...map.values()]
}

function normalizeUrl(raw: string): string {
  try { const u = new URL(raw); return u.origin + u.pathname } catch { return raw.split('?')[0] }
}

function rateLocally(metric: VitalMetric, value: number): VitalRating {
  const t: Record<VitalMetric, [number, number]> = {
    lcp:  [2500, 4000],
    fid:  [100,  300],
    cls:  [0.1,  0.25],
    ttfb: [800,  1800],
    fcp:  [1800, 3000],
  }
  const [good, poor] = t[metric]
  return value <= good ? 'good' : value <= poor ? 'needs-improvement' : 'poor'
}
