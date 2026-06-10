import { describe, it, expect, mock } from 'bun:test'
import { MemoryQueue } from './memory'
import type { AnalyticsEvent } from '@analytics-kit/storage'

const ev: AnalyticsEvent = { t: 1000, type: 'pageview', sid: 's1', site: 'test' }

describe('MemoryQueue', () => {
  it('push adds events to buffer', async () => {
    const q = new MemoryQueue(async () => {}, 999_999, 1000)
    await q.push([ev])
    expect(q.size()).toBe(1)
    q.destroy()
  })

  it('push accumulates multiple batches', async () => {
    const q = new MemoryQueue(async () => {}, 999_999, 1000)
    await q.push([ev, ev])
    await q.push([ev])
    expect(q.size()).toBe(3)
    q.destroy()
  })

  it('drain removes and returns all events', async () => {
    const q = new MemoryQueue(async () => {}, 999_999, 1000)
    await q.push([ev, ev])
    const out = q.drain()
    expect(out).toHaveLength(2)
    expect(q.size()).toBe(0)
    q.destroy()
  })

  it('drain on empty queue returns []', () => {
    const q = new MemoryQueue(async () => {}, 999_999, 1000)
    expect(q.drain()).toHaveLength(0)
    q.destroy()
  })

  it('overflow: flushes immediately when maxSize reached', async () => {
    const handler = mock(async (_: AnalyticsEvent[]) => {})
    const q = new MemoryQueue(handler, 999_999, 2)
    await q.push([ev, ev])
    expect(handler).toHaveBeenCalledTimes(1)
    expect(q.size()).toBe(0)
    q.destroy()
  })

  it('overflow: flush receives all buffered events', async () => {
    let flushed: AnalyticsEvent[] = []
    const q = new MemoryQueue(async (batch) => { flushed = batch }, 999_999, 2)
    await q.push([ev, ev])
    expect(flushed).toHaveLength(2)
    q.destroy()
  })

  it('no overflow flush below maxSize', async () => {
    const handler = mock(async () => {})
    const q = new MemoryQueue(handler, 999_999, 10)
    await q.push([ev, ev])
    expect(handler).not.toHaveBeenCalled()
    q.destroy()
  })

  it('destroy clears the interval (no exception)', () => {
    const q = new MemoryQueue(async () => {}, 999_999, 1000)
    q.destroy()
    q.destroy() // second call should be safe
  })
})
