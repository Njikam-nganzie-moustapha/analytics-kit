import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { StorageAdapter } from '@analytics-kit/storage'
import { MemoryQueue } from './queue/memory'
import { eventsRouter } from './routes/events'

export function createApp(storage: StorageAdapter) {
  const flushMs  = parseInt(process.env.FLUSH_INTERVAL_MS ?? '5000')
  const maxQueue = parseInt(process.env.MAX_QUEUE_SIZE    ?? '1000')

  const queue = new MemoryQueue(
    events => storage.write(events),
    flushMs,
    maxQueue,
  )

  const app = new Hono()

  app.use('*', cors({
    origin: process.env.CORS_ORIGINS?.split(',') ?? '*',
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Site-Key', 'X-Compressed'],
    maxAge: 86400,
  }))

  app.get('/health', c => c.json({ ok: true, ts: Date.now(), queued: queue.size() }))
  app.route('/e', eventsRouter(queue))

  // Graceful shutdown — flush remaining events before exit
  const shutdown = async () => {
    console.log('[collector] shutting down — flushing...')
    const remaining = queue.drain()
    if (remaining.length > 0) {
      await storage.write(remaining).catch(err => console.error('[collector] final flush error:', err))
    }
    queue.destroy()
    await storage.close?.()
    process.exit(0)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT',  shutdown)

  return app
}
