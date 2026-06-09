import type { AnalyticsEvent } from '@analytics-kit/storage'

export type FlushHandler = (events: AnalyticsEvent[]) => Promise<void>

export interface Queue {
  push(events: AnalyticsEvent[]): Promise<void>
  /** Pull remaining items out (for graceful shutdown) */
  drain(): AnalyticsEvent[]
  size(): number
  destroy(): void
}
