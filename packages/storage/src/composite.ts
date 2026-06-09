import type { StorageAdapter, QueryParams, AnalyticsEvent } from './types'

export class CompositeAdapter implements StorageAdapter {
  constructor(private readonly adapters: StorageAdapter[]) {}

  async init(): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.init?.()))
  }

  async write(events: AnalyticsEvent[]): Promise<void> {
    // Fan-out — failures in one adapter don't block others
    const results = await Promise.allSettled(this.adapters.map(a => a.write(events)))
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[composite] adapter[${i}] write failed:`, r.reason)
    })
  }

  async query(params: QueryParams): Promise<AnalyticsEvent[]> {
    // Use first adapter that supports query
    for (const a of this.adapters) {
      if (a.query) return a.query(params)
    }
    return []
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.adapters.map(a => a.close?.()))
  }
}
