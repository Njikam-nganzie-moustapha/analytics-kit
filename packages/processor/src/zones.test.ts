import { describe, it, expect } from 'bun:test'
import { buildZoneStats } from './zones'
import type { RawEvent } from './types'

const mk = (o: Partial<RawEvent> & { type: string }): RawEvent => ({
  t: 1000, sid: 's1', site: 'test', url: 'https://example.com/page', ...o,
})

describe('buildZoneStats', () => {
  it('returns empty for no events', () => {
    expect(buildZoneStats([])).toHaveLength(0)
  })

  it('ignores irrelevant event types', () => {
    expect(buildZoneStats([mk({ type: 'pageview', zoneId: 'hero' })])).toHaveLength(0)
    expect(buildZoneStats([mk({ type: 'scroll', zoneId: 'hero' })])).toHaveLength(0)
  })

  it('counts zone_enter events', () => {
    const stats = buildZoneStats([
      mk({ type: 'zone_enter', zoneId: 'hero' }),
      mk({ type: 'zone_enter', zoneId: 'hero' }),
      mk({ type: 'zone_enter', zoneId: 'hero' }),
    ])
    expect(stats.find(s => s.zoneId === 'hero')?.enters).toBe(3)
  })

  it('accumulates totalDwell from zone_leave', () => {
    const stats = buildZoneStats([
      mk({ type: 'zone_leave', zoneId: 'hero', dwellMs: 1000 }),
      mk({ type: 'zone_leave', zoneId: 'hero', dwellMs: 2500 }),
    ])
    const hero = stats.find(s => s.zoneId === 'hero')!
    expect(hero.totalDwell).toBe(3500)
    expect(hero.samples).toBe(2)
  })

  it('ignores zone_leave with no dwellMs', () => {
    const stats = buildZoneStats([mk({ type: 'zone_leave', zoneId: 'z1' })])
    const z = stats.find(s => s.zoneId === 'z1')!
    expect(z.totalDwell).toBe(0)
    expect(z.samples).toBe(0)
  })

  it('counts clicks via zoneIds array (SDK >= 0.1)', () => {
    const ev = { ...mk({ type: 'click' }), zoneIds: ['hero', 'cta'] }
    const stats = buildZoneStats([ev as RawEvent])
    expect(stats.find(s => s.zoneId === 'hero')?.clicks).toBe(1)
    expect(stats.find(s => s.zoneId === 'cta')?.clicks).toBe(1)
  })

  it('counts clicks via legacy zone string', () => {
    const ev = { ...mk({ type: 'click' }), zone: 'legacy-zone' }
    const stats = buildZoneStats([ev as RawEvent])
    expect(stats.find(s => s.zoneId === 'legacy-zone')?.clicks).toBe(1)
  })

  it('ignores clicks with no zone info', () => {
    expect(buildZoneStats([mk({ type: 'click' })])).toHaveLength(0)
  })

  it('aggregates across enter + leave + click for same zone', () => {
    const stats = buildZoneStats([
      mk({ type: 'zone_enter', zoneId: 'z1' }),
      mk({ type: 'zone_leave', zoneId: 'z1', dwellMs: 500 }),
      { ...mk({ type: 'click' }), zoneIds: ['z1'] } as RawEvent,
    ])
    const z = stats.find(s => s.zoneId === 'z1')!
    expect(z.enters).toBe(1)
    expect(z.totalDwell).toBe(500)
    expect(z.clicks).toBe(1)
  })

  it('strips query string from URL', () => {
    const stats = buildZoneStats([
      mk({ type: 'zone_enter', zoneId: 'z1', url: 'https://example.com/page?q=1' }),
      mk({ type: 'zone_enter', zoneId: 'z1', url: 'https://example.com/page?q=2' }),
    ])
    expect(stats).toHaveLength(1)
    expect(stats[0].enters).toBe(2)
  })

  it('keeps separate stats per site', () => {
    const stats = buildZoneStats([
      mk({ type: 'zone_enter', zoneId: 'z1', site: 'a' }),
      mk({ type: 'zone_enter', zoneId: 'z1', site: 'b' }),
    ])
    expect(stats).toHaveLength(2)
  })
})
