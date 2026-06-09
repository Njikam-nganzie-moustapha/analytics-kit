import type { ProcessorTurso } from './turso'
import type { ErrorGroup } from './types'

const COOLDOWN_MS       = parseInt(process.env.ALERT_COOLDOWN_MS       ?? '3600000') // 1 h
const ERROR_THRESHOLD   = parseInt(process.env.ALERT_ERROR_THRESHOLD   ?? '5')       // errors per batch
const TRAFFIC_DROP_SKIP = parseInt(process.env.ALERT_TRAFFIC_DROP_SKIP ?? '2')       // skip first N empty batches before alerting

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) console.warn('[alerts] Telegram send failed:', res.status, await res.text())
}

export async function checkAlerts(
  db: ProcessorTurso,
  site: string,
  opts: {
    newEvents:   number
    errorGroups: Map<string, ErrorGroup>
    hasHistory:  boolean   // true if checkpoint > 0 (site had prior data)
  },
): Promise<void> {
  const token  = process.env.ALERT_TELEGRAM_TOKEN
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID
  if (!token || !chatId) return   // alerts disabled — no credentials

  const now = Date.now()

  // ── Error spike ─────────────────────────────────────────────────────────────
  const newErrors = [...opts.errorGroups.values()].reduce((s, g) => s + g.count, 0)
  if (newErrors >= ERROR_THRESHOLD) {
    const lastFired = await db.getAlertState(site, 'error_spike')
    if (now - lastFired >= COOLDOWN_MS) {
      const top = [...opts.errorGroups.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
        .map(g => `  • ${g.count}× ${g.message.slice(0, 80)}`)
        .join('\n')
      await sendTelegram(token, chatId,
        `🚨 <b>Error spike — ${site}</b>\n` +
        `${newErrors} new errors in last batch\n\n${top}`,
      )
      await db.setAlertFired(site, 'error_spike', now)
      console.log(`[alerts] error_spike fired for ${site} (${newErrors} errors)`)
    }
  }

  // ── Traffic drop ─────────────────────────────────────────────────────────────
  // Only meaningful if the site was previously active
  if (opts.newEvents === 0 && opts.hasHistory) {
    const lastFired      = await db.getAlertState(site, 'traffic_drop')
    const missedBatches  = await db.incrementMissedBatches(site)

    // Wait for TRAFFIC_DROP_SKIP consecutive empty batches before alerting
    // (avoids noise from brief quiet periods)
    if (missedBatches >= TRAFFIC_DROP_SKIP && now - lastFired >= COOLDOWN_MS) {
      await sendTelegram(token, chatId,
        `⚠️ <b>Traffic drop — ${site}</b>\n` +
        `No events received for ${missedBatches} consecutive processor runs.`,
      )
      await db.setAlertFired(site, 'traffic_drop', now)
      console.log(`[alerts] traffic_drop fired for ${site} (${missedBatches} empty runs)`)
    }
  } else if (opts.newEvents > 0) {
    // Reset missed-batch counter when traffic resumes
    await db.resetMissedBatches(site)
  }
}
