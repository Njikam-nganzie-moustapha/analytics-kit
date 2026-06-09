import { ProcessorTurso } from './turso'
import { runPipeline } from './pipeline'

const TURSO_URL   = process.env.TURSO_URL   ?? ''
const TURSO_TOKEN = process.env.TURSO_TOKEN ?? ''
const INTERVAL_MS = parseInt(process.env.PROCESSOR_INTERVAL_MS ?? '30000')

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('[processor] TURSO_URL and TURSO_TOKEN are required')
  process.exit(1)
}

const db = new ProcessorTurso(TURSO_URL, TURSO_TOKEN)

async function tick(): Promise<void> {
  try {
    await runPipeline(db)
  } catch (err) {
    console.error('[processor] pipeline error:', err)
  }
}

// Ensure schema then start loop (or run once if --once flag passed)
await db.ensureSchema()

if (process.argv.includes('--once')) {
  console.log('[processor] --once mode: running single pass')
  await tick()
  process.exit(0)
} else {
  console.log(`[processor] running every ${INTERVAL_MS / 1000}s`)
  await tick()
  setInterval(tick, INTERVAL_MS)
}
