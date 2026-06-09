import { ProcessorTurso } from './turso'
import { buildHeatmapCells } from './heatmap'
import { buildZoneStats } from './zones'
import { buildSessionStats } from './sessions'

const BATCH_LIMIT = 5_000   // events per run per site

export async function runPipeline(db: ProcessorTurso): Promise<void> {
  const sites = await db.fetchDistinctSites()
  if (sites.length === 0) return

  let processed = 0

  for (const site of sites) {
    const checkpoint = await db.getCheckpoint(site)
    const events = await db.fetchEventsSince(site, checkpoint, BATCH_LIMIT)
    if (events.length === 0) continue

    const maxT = Math.max(...events.map(e => e.t))

    // Compute all aggregates
    const [heatmapCells, zoneStats, sessionStats] = [
      buildHeatmapCells(events),
      buildZoneStats(events),
      buildSessionStats(events),
    ]

    // Write to DB — each write is independent so one failure doesn't abort others
    await Promise.allSettled([
      db.upsertHeatmapCells(heatmapCells),
      db.upsertZoneStats(zoneStats),
      db.upsertSessions(sessionStats),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const names = ['heatmap', 'zones', 'sessions']
          console.error(`[processor] ${site} ${names[i]} upsert failed:`, r.reason)
        }
      })
    })

    await db.saveCheckpoint(site, maxT)

    processed += events.length
    console.log(`[processor] ${site}: ${events.length} events → ${heatmapCells.length} cells, ${zoneStats.length} zones, ${sessionStats.length} sessions`)
  }

  if (processed > 0) console.log(`[processor] total: ${processed} events processed`)
}
