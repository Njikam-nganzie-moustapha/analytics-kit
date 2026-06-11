import { ProcessorTurso } from './turso'
import { buildHeatmapCells } from './heatmap'
import { buildZoneStats } from './zones'
import { buildSessionStats } from './sessions'
import { buildErrorGroups } from './errors'
import { buildVitalsBuckets } from './vitals'
import { buildPagePerf } from './perf'
import { createConsumer, symbolicateStack, type SourceMapConsumer } from './symbolicate'
import { checkAlerts } from './alerts'

const BATCH_LIMIT = 5_000

export async function runPipeline(db: ProcessorTurso): Promise<void> {
  const sites = await db.fetchDistinctSites()
  if (sites.length === 0) return

  let processed = 0

  for (const site of sites) {
    const checkpoint  = await db.getCheckpoint(site)
    const hasHistory  = checkpoint > 0
    const events      = await db.fetchEventsSince(site, checkpoint, BATCH_LIMIT)

    if (events.length === 0) {
      await checkAlerts(db, site, { newEvents: 0, errorGroups: new Map(), hasHistory }).catch(e =>
        console.error(`[processor] ${site} alert check failed:`, e),
      )
      continue
    }

    const maxT = Math.max(...events.map(e => e.t))

    const heatmapCells  = buildHeatmapCells(events)
    const zoneStats     = buildZoneStats(events)
    const sessionStats  = buildSessionStats(events)
    const errorGroups   = buildErrorGroups(events)
    const vitalsBuckets = buildVitalsBuckets(events)
    const pagePerf      = buildPagePerf(events)

    const feedback = events
      .filter(e => e.type === 'user_feedback' && typeof e.message === 'string' && e.message.trim())
      .map(e => ({
        site:    e.site,
        sid:     e.sid,
        uid:     typeof e.uid     === 'string' ? e.uid     : undefined,
        name:    typeof e.name    === 'string' ? e.name    : undefined,
        email:   typeof e.email   === 'string' ? e.email   : undefined,
        message: (e.message as string).trim().slice(0, 2000),
        url:     typeof e.url     === 'string' ? e.url     : undefined,
        ts:      e.t,
      }))

    await Promise.allSettled([
      db.upsertHeatmapCells(heatmapCells),
      db.upsertZoneStats(zoneStats),
      db.upsertSessions(sessionStats),
      db.upsertErrorGroups(errorGroups),
      db.upsertVitalsBuckets(vitalsBuckets),
      db.upsertErrorDailyStats(errorGroups),
      db.upsertPagePerf(pagePerf),
      db.insertFeedback(feedback),
    ]).then(results => {
      results.forEach((r, i) => {
        if (r.status === 'rejected') {
          const names = ['heatmap', 'zones', 'sessions', 'errors', 'vitals', 'error_daily', 'perf', 'feedback']
          console.error(`[processor] ${site} ${names[i]} upsert failed:`, r.reason)
        }
      })
    })

    // Source map symbolication — enrich error stacks with original positions
    await symbolicateErrorGroups(db, site, errorGroups).catch(e =>
      console.warn(`[processor] ${site} symbolication failed:`, e),
    )

    // Regression detection: if a 'resolved' error got new events → flip to 'regressed'
    if (errorGroups.size > 0) {
      const fps = [...errorGroups.keys()]
      const regressed = await db.markRegressed(site, fps).catch(e => {
        console.error(`[processor] ${site} regression check failed:`, e)
        return [] as string[]
      })
      if (regressed.length > 0) {
        console.log(`[processor] ${site}: ${regressed.length} error(s) regressed after resolution`)
      }
    }

    await db.saveCheckpoint(site, maxT)

    await checkAlerts(db, site, { newEvents: events.length, errorGroups, hasHistory }).catch(e =>
      console.error(`[processor] ${site} alert check failed:`, e),
    )

    processed += events.length
    console.log(`[processor] ${site}: ${events.length} events → ${heatmapCells.length} cells, ${zoneStats.length} zones, ${sessionStats.length} sessions, ${errorGroups.size} error groups`)
  }

  if (processed > 0) console.log(`[processor] total: ${processed} events processed`)
}

// Symbolicate error stacks using uploaded source maps (keyed by release)
async function symbolicateErrorGroups(
  db: ProcessorTurso,
  site: string,
  groups: Map<string, import('./types').ErrorGroup>,
): Promise<void> {
  // Collect distinct releases in this batch
  const releases = new Set<string>()
  for (const g of groups.values()) { if (g.release) releases.add(g.release) }
  if (releases.size === 0) return

  // Load source maps per release
  const consumersByRelease = new Map<string, Map<string, SourceMapConsumer>>()
  for (const release of releases) {
    const maps = await db.getSourceMaps(site, release)
    if (maps.length === 0) continue
    const consumers = new Map<string, SourceMapConsumer>()
    for (const { filename, content } of maps) {
      const c = createConsumer(content)
      if (c) consumers.set(filename, c)
    }
    if (consumers.size > 0) consumersByRelease.set(release, consumers)
  }

  if (consumersByRelease.size === 0) return

  // Apply symbolication to each error group that has a stack + matching source maps
  for (const g of groups.values()) {
    if (!g.stack || !g.release) continue
    const consumers = consumersByRelease.get(g.release)
    if (!consumers || consumers.size === 0) continue
    const frames = symbolicateStack(g.stack, consumers)
    if (frames.length === 0) continue
    // Replace stack with human-readable symbolicated version
    g.stack = frames
      .map(f => {
        const loc  = f.source ? `${f.source}:${f.line}:${f.column}` : 'unknown'
        const fn   = f.fn ? `${f.fn} ` : ''
        const snip = f.snippet ? `\n    > ${f.snippet}` : ''
        return `  at ${fn}(${loc})${snip}`
      })
      .join('\n')
  }
}
