export type RangeKey = '24h' | '7d' | '14d' | '30d' | '90d'

export interface TimeRange { key: RangeKey; from: number; to: number; granularity: 'hour' | 'day' }

const DAY = 86_400_000
const HOUR = 3_600_000

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: '24h', label: 'Last 24h' },
  { key: '7d', label: 'Last 7 days' },
  { key: '14d', label: 'Last 14 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
]

export function resolveRange(key: RangeKey, now = Date.now()): TimeRange {
  const spans: Record<RangeKey, number> = {
    '24h': HOUR * 24, '7d': DAY * 7, '14d': DAY * 14, '30d': DAY * 30, '90d': DAY * 90,
  }
  return {
    key,
    from: now - spans[key],
    to: now,
    granularity: key === '24h' ? 'hour' : 'day',
  }
}
