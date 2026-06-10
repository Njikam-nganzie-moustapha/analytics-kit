import { describe, it, expect } from 'bun:test'
import { buildSessionStats } from './sessions'
import type { RawEvent } from './types'

const mk = (o: Partial<RawEvent>): RawEvent => ({
  t: 1000, type: 'pageview', sid: 's1', site: 'test', url: '/page', ...o,
})

describe('buildSessionStats', () => {
  it('returns empty array for no events', () => {
    expect(buildSessionStats([])).toHaveLength(0)
  })

  it('groups events by sid', () => {
    const stats = buildSessionStats([mk({ sid: 's1' }), mk({ sid: 's2' }), mk({ sid: 's1', t: 2000 })])
    expect(stats).toHaveLength(2)
  })

  it('sets started to min timestamp', () => {
    const stats = buildSessionStats([mk({ t: 5000 }), mk({ t: 1000 }), mk({ t: 3000 })])
    expect(stats[0].started).toBe(1000)
  })

  it('sets ended to max timestamp', () => {
    const stats = buildSessionStats([mk({ t: 5000 }), mk({ t: 1000 }), mk({ t: 3000 })])
    expect(stats[0].ended).toBe(5000)
  })

  it('calculates duration from min/max timestamps when no session_end', () => {
    const stats = buildSessionStats([mk({ t: 1000 }), mk({ t: 5000 })])
    expect(stats[0].duration).toBe(4000)
  })

  it('prefers session_end.duration over timestamp diff', () => {
    const stats = buildSessionStats([mk({ t: 1000 }), mk({ t: 5000, type: 'session_end', duration: 12345 })])
    expect(stats[0].duration).toBe(12345)
  })

  it('counts unique URLs only', () => {
    const stats = buildSessionStats([mk({ url: '/a' }), mk({ url: '/b' }), mk({ url: '/a' })])
    expect(stats[0].urlCount).toBe(2)
  })

  it('counts all events', () => {
    const stats = buildSessionStats([mk({}), mk({}), mk({})])
    expect(stats[0].eventCount).toBe(3)
  })

  it('sets hasReplay true when rrweb_chunk present', () => {
    const stats = buildSessionStats([mk({}), mk({ type: 'rrweb_chunk' })])
    expect(stats[0].hasReplay).toBe(true)
  })

  it('sets hasReplay false with no rrweb events', () => {
    const stats = buildSessionStats([mk({}), mk({ type: 'click' })])
    expect(stats[0].hasReplay).toBe(false)
  })

  it('includes uid from first event', () => {
    const stats = buildSessionStats([mk({ uid: 'user-42' })])
    expect(stats[0].uid).toBe('user-42')
  })

  it('includes site from first event', () => {
    const stats = buildSessionStats([mk({ site: 'my-site' })])
    expect(stats[0].site).toBe('my-site')
  })

  it('single event: duration is 0', () => {
    const stats = buildSessionStats([mk({ t: 3000 })])
    expect(stats[0].duration).toBe(0)
    expect(stats[0].started).toBe(3000)
    expect(stats[0].ended).toBe(3000)
  })
})
