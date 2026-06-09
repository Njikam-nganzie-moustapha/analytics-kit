import { ProcessorTurso } from './turso'
import { buildHeatmapCells } from './heatmap'
import { buildZoneStats } from './zones'
import { buildSessionStats } from './sessions'
import { buildErrorGroups } from './errors'
import { checkAlerts } from './alerts'

const BATCH_LIMIT = 5_000   // events per run per site

export async function runPipeline(db: ProcessorTurso): Promise<void> {
  const sites = await db.fetchDistinctSites()
  if (sites.length === 0) return

  let processed = 0

  for (const site of sites) {
    const checkpoint  = await db.getCheckpoint(site)
    const hasHistory  = checkpoint > 0
    const events      = await db.fetchEventsSince(site, checkpoint, BATCH_LIMIT)

    if (events.length === 0) {
      // No new events — still check for traffic drop
      await checkAlerts(db, site, { newEvents: 0, errorGroups: new Map(), hasHistory }).catch(e =>
        console.error(`[processor] ${site} alert check failed:`, e),
      )
      continue
    }

    const maxT = Math.max(...events.map(e => e.t))

    // Compute all aggregates
    const heatmapCells = buildHeatmapCells(events)
    const zoneStats    = buildZoneStats(events)
    const sessionStats = buildSessionStats(events)
    const errorGroups  = buildErrorGroups(events)

    // Write to DB — each write is independent so one failure doesn't abort others
    await Promise.allSettled([
      db.upsertHeatmapCells(heatmapCells),
      db.upsertZoneStats(zoneStats),
      db.upsertSessions(sessionStats),
      db.upsertErrorGroups(errorGroups),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const names = ['heatmap', 'zones', 'sessions', 'errors']
          console.error(`[processor] ${site} ${names[i]} upsert failed:`, r.reason)
        }
      })
    })

    await db.saveCheckpoint(site, maxT)

    // Check for spikes / anomalies — non-blocking
    await checkAlerts(db, site, { newEvents: events.length, errorGroups, hasHistory }).catch(e =>
      console.error(`[processor] ${site} alert check failed:`, e),
    )

    processed += events.length
    console.log(`[processor] ${site}: ${events.length} events → ${heatmapCells.length} cells, ${zoneStats.length} zones, ${sessionStats.length} sessions, ${errorGroups.size} error groups`)
  }

  if (processed > 0) console.log(`[processor] total: ${processed} events processed`)
}
