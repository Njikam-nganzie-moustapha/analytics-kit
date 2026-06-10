import { describe, it, expect } from 'bun:test'
import { buildErrorGroups } from './errors'
import type { RawEvent } from './types'

const mk = (o: Partial<RawEvent>): RawEvent => ({
  t: 1000, sid: 's1', site: 'test', type: 'js_error',
  msg: 'TypeError: Cannot read property',
  ...o,
})

describe('buildErrorGroups', () => {
  it('returns empty map for no events', () => {
    expect(buildErrorGroups([])).toHaveLength(0)
  })

  it('ignores non-error events', () => {
    expect(buildErrorGroups([mk({ type: 'pageview' })])).toHaveLength(0)
    expect(buildErrorGroups([mk({ type: 'click' })])).toHaveLength(0)
  })

  it('groups identical js errors into one entry', () => {
    const groups = buildErrorGroups([mk({}), mk({}), mk({})])
    expect(groups.size).toBe(1)
    expect([...groups.values()][0].count).toBe(3)
  })

  it('groups js errors by stripping line:col numbers', () => {
    const groups = buildErrorGroups([
      mk({ msg: 'ReferenceError at script.js:10:5' }),
      mk({ msg: 'ReferenceError at script.js:99:1' }),
    ])
    expect(groups.size).toBe(1)
  })

  it('groups network errors by method + normalized path', () => {
    const groups = buildErrorGroups([
      mk({ type: 'network_error', method: 'GET', url: '/api/users/123' }),
      mk({ type: 'network_error', method: 'GET', url: '/api/users/456' }),
    ])
    expect(groups.size).toBe(1)
  })

  it('separates network errors by HTTP method', () => {
    const groups = buildErrorGroups([
      mk({ type: 'network_error', method: 'GET', url: '/api/data' }),
      mk({ type: 'network_error', method: 'POST', url: '/api/data' }),
    ])
    expect(groups.size).toBe(2)
  })

  it('strips query string from network error URLs', () => {
    const groups = buildErrorGroups([
      mk({ type: 'network_error', method: 'GET', url: '/api/data?page=1' }),
      mk({ type: 'network_error', method: 'GET', url: '/api/data?page=2' }),
    ])
    expect(groups.size).toBe(1)
  })

  it('tracks unique sessions per group', () => {
    const groups = buildErrorGroups([
      mk({ sid: 's1' }),
      mk({ sid: 's2' }),
      mk({ sid: 's1' }),
    ])
    expect([...groups.values()][0].sessions.size).toBe(2)
  })

  it('tracks firstSeen and lastSeen timestamps', () => {
    const groups = buildErrorGroups([mk({ t: 1000 }), mk({ t: 9000 })])
    const g = [...groups.values()][0]
    expect(g.firstSeen).toBe(1000)
    expect(g.lastSeen).toBe(9000)
  })

  it('increments lastSeen when new occurrence arrives', () => {
    const groups = buildErrorGroups([mk({ t: 5000 }), mk({ t: 1000 }), mk({ t: 9000 })])
    expect([...groups.values()][0].lastSeen).toBe(9000)
  })

  it('stores correct eventType', () => {
    const groups = buildErrorGroups([mk({ type: 'network_error', method: 'GET', url: '/x' })])
    expect([...groups.values()][0].eventType).toBe('network_error')
  })

  it('stores site from event', () => {
    const groups = buildErrorGroups([mk({ site: 'my-site' })])
    expect([...groups.values()][0].site).toBe('my-site')
  })
})
