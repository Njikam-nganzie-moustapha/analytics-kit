import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { bodyLimit } from 'hono/body-limit'
import type { MiddlewareHandler } from 'hono'
import type { StorageAdapter } from '@analytics-kit/storage'
import { MemoryQueue } from './queue/memory'
import { eventsRouter } from './routes/events'
import { honeypotsMiddleware } from '../../security/src/honeypots'
import { threatDetector } from '../../security/src/threatDetector'

const BODY_LIMIT = parseInt(process.env.BODY_LIMIT_BYTES ?? String(256 * 1024)) // 256 KB default

const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  c.header('Cache-Control', 'no-store')
}

export function createApp(storage: StorageAdapter) {
  const flushMs  = parseInt(process.env.FLUSH_INTERVAL_MS ?? '5000')
  const maxQueue = parseInt(process.env.MAX_QUEUE_SIZE    ?? '1000')

  const corsOrigins = process.env.CORS_ORIGINS?.split(',') ?? '*'
  if (process.env.NODE_ENV === 'production' && corsOrigins === '*') {
    console.warn('[collector] WARNING: CORS_ORIGINS not set — allowing all origins. Set CORS_ORIGINS in production.')
  }

  const queue = new MemoryQueue(
    events => storage.write(events),
    flushMs,
    maxQueue,
  )

  const app = new Hono()

  app.use('*', securityHeaders)
  app.use('*', cors({
    origin: corsOrigins,
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-Site-Key', 'X-Compressed'],
    maxAge: 86400,
  }))
  app.use('*', honeypotsMiddleware)
  app.use('*', threatDetector)
  app.use('/e/*', bodyLimit({
    maxSize: BODY_LIMIT,
    onError: c => c.json({ error: 'payload_too_large' }, 413),
  }))

  app.get('/health', c => c.json({ ok: true, ts: Date.now(), queued: queue.size() }))
  app.route('/e', eventsRouter(queue))
  app.notFound(c => c.json({ message: 'Not found' }, 404))

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
