import type { StorageAdapter, QueryParams, AnalyticsEvent } from './types'
import { gzipSync, gunzipSync } from 'zlib'

interface TelegramConfig {
  botToken: string
  channelId: string   // '-1001234567890' or '@mychannel'
  indexPath?: string  // optional: path to persist message index
}

interface IndexEntry {
  fileId: string
  siteId: string
  count: number
  tsMin: number
  tsMax: number
}

// Max events per Telegram document — keeps files manageable
const CHUNK = 500

export class TelegramAdapter implements StorageAdapter {
  private readonly _api: string
  private readonly _index: IndexEntry[] = []

  constructor(private readonly cfg: TelegramConfig) {
    this._api = `https://api.telegram.org/bot${cfg.botToken}`
  }

  async write(events: AnalyticsEvent[]): Promise<void> {
    if (events.length === 0) return
    for (let i = 0; i < events.length; i += CHUNK) {
      await this._sendChunk(events.slice(i, i + CHUNK))
    }
  }

  async query(params: QueryParams): Promise<AnalyticsEvent[]> {
    const relevant = this._index.filter(e => {
      if (e.siteId !== params.siteId) return false
      if (params.from && e.tsMax < params.from) return false
      if (params.to   && e.tsMin > params.to)   return false
      return true
    })

    const results: AnalyticsEvent[] = []
    for (const entry of relevant) {
      const batch = await this._download(entry.fileId)
      if (!batch) continue
      for (const ev of batch) {
        if (params.type && ev.type !== params.type) continue
        if (params.sessionId && ev.sid !== params.sessionId) continue
        if (params.from && ev.t < params.from) continue
        if (params.to   && ev.t > params.to)   continue
        results.push(ev)
        if (results.length >= (params.limit ?? 1000)) return results
      }
    }
    return results
  }

  private async _sendChunk(events: AnalyticsEvent[]): Promise<void> {
    const json = JSON.stringify(events)
    const compressed = gzipSync(Buffer.from(json, 'utf8'))
    const tsMin = Math.min(...events.map(e => e.t))
    const tsMax = Math.max(...events.map(e => e.t))
    const siteId = events[0]?.site ?? 'unknown'
    // caption carries metadata for fast filtering (no download needed to check dates)
    const caption = JSON.stringify({ siteId, count: events.length, tsMin, tsMax, v: 1 })

    const form = new FormData()
    form.append('chat_id', this.cfg.channelId)
    form.append('caption', caption)
    form.append('document', new Blob([compressed], { type: 'application/gzip' }), `ak-${siteId}-${tsMin}.gz`)

    const res = await fetch(`${this._api}/sendDocument`, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Telegram sendDocument ${res.status}: ${await res.text()}`)

    const data = await res.json() as { result: { document: { file_id: string } } }
    this._index.push({ fileId: data.result.document.file_id, siteId, count: events.length, tsMin, tsMax })
  }

  private async _download(fileId: string): Promise<AnalyticsEvent[] | null> {
    try {
      const meta = await fetch(`${this._api}/getFile?file_id=${fileId}`)
      if (!meta.ok) return null
      const { result } = await meta.json() as { result: { file_path: string } }
      const dl = await fetch(`https://api.telegram.org/file/bot${this.cfg.botToken}/${result.file_path}`)
      if (!dl.ok) return null
      const buf = await dl.arrayBuffer()
      const json = gunzipSync(Buffer.from(buf)).toString('utf8')
      return JSON.parse(json) as AnalyticsEvent[]
    } catch { return null }
  }
}
