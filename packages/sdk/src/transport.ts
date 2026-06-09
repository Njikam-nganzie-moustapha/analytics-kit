import type { TrackerConfig, AnalyticsEvent } from './types'
import { compressStr } from './compress'

const FLUSH_INTERVAL = 2000
const MAX_BATCH = 50
const MAX_RETRIES = 2
const RETRY_DELAY = 3000

interface Batch {
  events: AnalyticsEvent[]
  attempt: number
}

export class Transport {
  private queue: AnalyticsEvent[] = []
  private retryQueue: Batch[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private cfg: TrackerConfig

  constructor(cfg: TrackerConfig) {
    this.cfg = cfg
    this.timer = setInterval(() => this.flush(), cfg.flushInterval ?? FLUSH_INTERVAL)
  }

  push(event: AnalyticsEvent): void {
    this.queue.push(event)
    if (this.queue.length >= (this.cfg.maxBatchSize ?? MAX_BATCH)) {
      this.flush()
    }
  }

  flush(beacon = false): void {
    if (this.queue.length) {
      const batch = this.queue.splice(0)
      this.send({ events: batch, attempt: 0 }, beacon)
    }

    // Réessayer les batches échoués
    const toRetry = this.retryQueue.splice(0)
    for (const batch of toRetry) {
      this.send(batch, false)
    }
  }

  private async send(batch: Batch, useBeacon: boolean): Promise<void> {
    const payload = JSON.stringify({ v: 1, events: batch.events })
    const body = this.cfg.compress !== false ? compressStr(payload) : payload
    const compressed = this.cfg.compress !== false

    const url = `${this.cfg.collectorUrl}/e`
    const headers: Record<string, string> = {
      'X-Site-Key': this.cfg.siteId,
      'X-Compressed': compressed ? '1' : '0',
      'Content-Type': compressed ? 'application/octet-stream' : 'application/json',
    }

    // sendBeacon = fire-and-forget garanti même en page unload
    if (useBeacon && navigator.sendBeacon) {
      const blob = new Blob([body], { type: headers['Content-Type'] })
      navigator.sendBeacon(url, blob)
      return
    }

    try {
      const res = await fetch(url, { method: 'POST', headers, body, keepalive: true })
      if (!res.ok && batch.attempt < MAX_RETRIES) {
        this.scheduleRetry({ ...batch, attempt: batch.attempt + 1 })
      }
    } catch {
      if (batch.attempt < MAX_RETRIES) {
        this.scheduleRetry({ ...batch, attempt: batch.attempt + 1 })
      }
      // Après MAX_RETRIES — on abandonne silencieusement, jamais d'erreur visible user
    }
  }

  private scheduleRetry(batch: Batch): void {
    setTimeout(() => this.retryQueue.push(batch), RETRY_DELAY * batch.attempt)
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer)
    this.flush(true)
  }
}
