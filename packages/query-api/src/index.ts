import { QueryTurso } from './turso'
import { createApp   } from './app'

const TURSO_URL   = process.env.TURSO_URL   ?? ''
const TURSO_TOKEN = process.env.TURSO_TOKEN ?? ''
const PORT        = parseInt(process.env.PORT ?? '4211')

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('[query-api] TURSO_URL and TURSO_TOKEN are required')
  process.exit(1)
}

const db  = new QueryTurso(TURSO_URL, TURSO_TOKEN)
const app = createApp(db)

console.log(`[query-api] listening on :${PORT}`)
export default { port: PORT, fetch: app.fetch }
