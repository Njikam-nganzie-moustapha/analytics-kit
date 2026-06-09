import type { Queue, FlushHandler } from './types'
import type { AnalyticsEvent } from '@analytics-kit/storage'

export class MemoryQueue implements Queue {
  private _buf: AnalyticsEvent[] = []
  private _timer: ReturnType<typeof setInterval> | null = null

  constructor(
    handler: FlushHandler,
    flushMs = 5_000,
    maxSize = 1_000,
  ) {
    this._timer = setInterval(async () => {
      const batch = this._buf.splice(0)
      if (batch.length === 0) return
      await handler(batch).catch(err => console.error('[queue] flush error:', err))
    }, flushMs)

    // Immediate flush when buffer hits maxSize
    const origPush = this.push.bind(this)
    this.push = async (events: AnalyticsEvent[]) => {
      await origPush(events)
      if (this._buf.length >= maxSize) {
        const batch = this._buf.splice(0)
        await handler(batch).catch(err => console.error('[queue] overflow flush error:', err))
      }
    }
  }

  async push(events: AnalyticsEvent[]): Promise<void> {
    this._buf.push(...events)
  }

  drain(): AnalyticsEvent[] {
    return this._buf.splice(0)
  }

  size(): number { return this._buf.length }

  destroy(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null }
  }
}
