import type { ProcessorTurso } from './turso'
import type { ErrorGroup } from './types'

const COOLDOWN_MS       = parseInt(process.env.ALERT_COOLDOWN_MS       ?? '3600000') // 1 h
const ERROR_THRESHOLD   = parseInt(process.env.ALERT_ERROR_THRESHOLD   ?? '5')
const TRAFFIC_DROP_SKIP = parseInt(process.env.ALERT_TRAFFIC_DROP_SKIP ?? '2')

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(token: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  })
  if (!res.ok) console.warn('[alerts] Telegram send failed:', res.status, await res.text())
}

// ── Slack ────────────────────────────────────────────────────────────────────

async function sendSlack(webhookUrl: string, text: string, blocks?: SlackBlock[]): Promise<void> {
  const body: Record<string, unknown> = { text }
  if (blocks) body.blocks = blocks
  const res = await fetch(webhookUrl, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) console.warn('[alerts] Slack send failed:', res.status, await res.text())
}

interface SlackBlock {
  type: string
  text?: { type: string; text: string; emoji?: boolean }
  elements?: { type: string; text: string }[]
}

function errorSpikeBlocks(site: string, count: number, top: ErrorGroup[]): SlackBlock[] {
  const topText = top
    .slice(0, 3)
    .map(g => `• ${g.count}× ${g.message.slice(0, 80)}`)
    .join('\n')
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*🚨 Error spike — ${site}*\n${count} new errors in last batch` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: topText || '(no details)' },
    },
  ]
}

// ── Send to all configured channels ──────────────────────────────────────────

async function broadcast(subject: string, body: string, errorGroups?: Map<string, ErrorGroup>): Promise<void> {
  const tgToken  = process.env.ALERT_TELEGRAM_TOKEN
  const tgChatId = process.env.ALERT_TELEGRAM_CHAT_ID
  const slackUrl = process.env.ALERT_SLACK_WEBHOOK_URL

  const tasks: Promise<void>[] = []

  if (tgToken && tgChatId) {
    tasks.push(sendTelegram(tgToken, tgChatId, `${subject}\n${body}`))
  }

  if (slackUrl) {
    const groups = errorGroups ? [...errorGroups.values()] : []
    const blocks = groups.length > 0
      ? errorSpikeBlocks(subject.split(' — ')[1] ?? subject, groups.reduce((s, g) => s + g.count, 0), groups)
      : undefined
    tasks.push(sendSlack(slackUrl, `${subject}\n${body}`, blocks))
  }

  if (tasks.length === 0) return  // no channels configured
  await Promise.allSettled(tasks)
}

// ── Main alert checker ────────────────────────────────────────────────────────

export async function checkAlerts(
  db: ProcessorTurso,
  site: string,
  opts: {
    newEvents:   number
    errorGroups: Map<string, ErrorGroup>
    hasHistory:  boolean
  },
): Promise<void> {
  const hasTelegram = !!(process.env.ALERT_TELEGRAM_TOKEN && process.env.ALERT_TELEGRAM_CHAT_ID)
  const hasSlack    = !!process.env.ALERT_SLACK_WEBHOOK_URL
  if (!hasTelegram && !hasSlack) return

  const now = Date.now()

  // ── Error spike ─────────────────────────────────────────────────────────────
  const newErrors = [...opts.errorGroups.values()].reduce((s, g) => s + g.count, 0)
  if (newErrors >= ERROR_THRESHOLD) {
    const lastFired = await db.getAlertState(site, 'error_spike')
    if (now - lastFired >= COOLDOWN_MS) {
      const topErrors = [...opts.errorGroups.values()].sort((a, b) => b.count - a.count)
      const topText   = topErrors.slice(0, 3).map(g => `  • ${g.count}× ${g.message.slice(0, 80)}`).join('\n')

      await broadcast(
        `🚨 Error spike — ${site}`,
        `${newErrors} new errors in last batch\n\n${topText}`,
        opts.errorGroups,
      )
      await db.setAlertFired(site, 'error_spike', now)
      console.log(`[alerts] error_spike fired for ${site} (${newErrors} errors)`)
    }
  }

  // ── Traffic drop ─────────────────────────────────────────────────────────────
  if (opts.newEvents === 0 && opts.hasHistory) {
    const lastFired     = await db.getAlertState(site, 'traffic_drop')
    const missedBatches = await db.incrementMissedBatches(site)

    if (missedBatches >= TRAFFIC_DROP_SKIP && now - lastFired >= COOLDOWN_MS) {
      await broadcast(
        `⚠️ Traffic drop — ${site}`,
        `No events received for ${missedBatches} consecutive processor runs.`,
      )
      await db.setAlertFired(site, 'traffic_drop', now)
      console.log(`[alerts] traffic_drop fired for ${site} (${missedBatches} empty runs)`)
    }
  } else if (opts.newEvents > 0) {
    await db.resetMissedBatches(site)
  }
}
