import type { Queue } from './types'
import type { AnalyticsEvent } from '@analytics-kit/storage'

const STREAM = 'ak:events'

// Optional Redis Streams queue — used when REDIS_URL is set.
// Processor (S3) reads from this stream via XREADGROUP.
export class RedisQueue implements Queue {
  private _client: import('ioredis').Redis | null = null

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    const { default: Redis } = await import('ioredis')
    this._client = new Redis(this.url, { lazyConnect: true, maxRetriesPerRequest: 3 })
    await this._client.connect()
  }

  async push(events: AnalyticsEvent[]): Promise<void> {
    if (!this._client) throw new Error('RedisQueue: call connect() first')
    const pipe = this._client.pipeline()
    for (const e of events) {
      // XADD ak:events * type <type> sid <sid> site <site> data <json>
      pipe.xadd(STREAM, '*', 'type', e.type, 'sid', e.sid, 'site', e.site, 'data', JSON.stringify(e))
    }
    await pipe.exec()
  }

  // Redis queue doesn't hold items in-process — processor reads from stream
  drain(): AnalyticsEvent[] { return [] }
  size(): number { return 0 }

  destroy(): void {
    this._client?.disconnect()
    this._client = null
  }
}
