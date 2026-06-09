import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { requireAuth, authRouter } from './auth'
import { heatmapRouter  } from './routes/heatmap'
import { zonesRouter    } from './routes/zones'
import { sessionsRouter } from './routes/sessions'
import { replayRouter   } from './routes/replay'
import { errorsRouter   } from './routes/errors'
import type { QueryTurso } from './turso'

export function createApp(db: QueryTurso) {
  const app = new Hono()

  const rawOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()) ?? ['*']
  const origin = rawOrigins.length === 1 && rawOrigins[0] === '*'
    ? '*'
    : rawOrigins

  app.use('*', cors({
    origin,
    allowMethods: ['GET', 'OPTIONS'],
    allowHeaders: ['content-type', 'x-api-key'],
    maxAge: 600,
  }))

  app.get('/health', c => c.json({ ok: true }))
  app.route('/auth', authRouter())

  app.use('*', requireAuth)

  app.route('/heatmap',  heatmapRouter(db))
  app.route('/zones',    zonesRouter(db))
  app.route('/sessions', sessionsRouter(db))
  app.route('/replay',   replayRouter(db))
  app.route('/errors',   errorsRouter(db))

  return app
}
