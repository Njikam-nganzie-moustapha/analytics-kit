import { createApp } from './app'
import type { StorageAdapter } from '@analytics-kit/storage'

async function loadStorage(): Promise<StorageAdapter> {
  const backend = process.env.STORAGE_BACKEND ?? 'noop'

  if (backend === 'turso') {
    const { TursoAdapter } = await import('@analytics-kit/storage')
    const adapter = new TursoAdapter({ url: process.env.TURSO_URL!, token: process.env.TURSO_TOKEN! })
    await adapter.init()
    return adapter
  }

  if (backend === 'telegram') {
    const { TelegramAdapter } = await import('@analytics-kit/storage')
    return new TelegramAdapter({
      botToken:  process.env.TELEGRAM_BOT_TOKEN!,
      channelId: process.env.TELEGRAM_CHANNEL_ID!,
    })
  }

  if (backend === 'clickhouse') {
    const { ClickHouseAdapter } = await import('@analytics-kit/storage')
    const adapter = new ClickHouseAdapter({
      url:      process.env.CLICKHOUSE_URL      ?? 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DB       ?? 'analytics',
      user:     process.env.CLICKHOUSE_USER     ?? 'default',
      password: process.env.CLICKHOUSE_PASSWORD ?? '',
    })
    await adapter.init()
    return adapter
  }

  if (backend === 'composite') {
    const { CompositeAdapter, TursoAdapter, TelegramAdapter } = await import('@analytics-kit/storage')
    const adapter = new CompositeAdapter([
      new TursoAdapter({ url: process.env.TURSO_URL!, token: process.env.TURSO_TOKEN! }),
      new TelegramAdapter({ botToken: process.env.TELEGRAM_BOT_TOKEN!, channelId: process.env.TELEGRAM_CHANNEL_ID! }),
    ])
    await adapter.init()
    return adapter
  }

  // noop — logs only, useful for development / smoke testing
  return {
    write: async events => console.log(`[noop] ${events.length} events — configure STORAGE_BACKEND`),
  }
}

const storage = await loadStorage()
const app = createApp(storage)
const port = parseInt(process.env.PORT ?? '4210')

console.log(`[collector] :${port}  backend=${process.env.STORAGE_BACKEND ?? 'noop'}`)

export default { port, fetch: app.fetch }
