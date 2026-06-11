import type { ProcessorTurso } from './turso'
import type { ErrorGroup } from './types'

const DEFAULT_COOLDOWN_MS       = parseInt(process.env.ALERT_COOLDOWN_MS       ?? '3600000')
const DEFAULT_ERROR_THRESHOLD   = parseInt(process.env.ALERT_ERROR_THRESHOLD   ?? '5')
const DEFAULT_TRAFFIC_DROP_SKIP = parseInt(process.env.ALERT_TRAFFIC_DROP_SKIP ?? '2')

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

interface Channels {
  telegramToken?:   string
  telegramChatId?:  string
  slackWebhookUrl?: string
}

async function broadcast(
  subject: string,
  body: string,
  errorGroups?: Map<string, ErrorGroup>,
  channels: Channels = {},
): Promise<void> {
  const tgToken  = channels.telegramToken   || process.env.ALERT_TELEGRAM_TOKEN
  const tgChatId = channels.telegramChatId  || process.env.ALERT_TELEGRAM_CHAT_ID
  const slackUrl = channels.slackWebhookUrl || process.env.ALERT_SLACK_WEBHOOK_URL

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
  const channels     = await db.getAlertChannels(site)
  const tgToken      = channels.telegramToken   || process.env.ALERT_TELEGRAM_TOKEN
  const tgChatId     = channels.telegramChatId  || process.env.ALERT_TELEGRAM_CHAT_ID
  const slackUrl     = channels.slackWebhookUrl || process.env.ALERT_SLACK_WEBHOOK_URL
  const hasTelegram  = !!(tgToken && tgChatId)
  const hasSlack     = !!slackUrl
  if (!hasTelegram && !hasSlack) return

  const now   = Date.now()
  const rules = await db.getAlertRules(site)

  const errorRule   = rules.get('error_spike')
  const trafficRule = rules.get('traffic_drop')

  const errorThreshold  = errorRule?.threshold  ?? DEFAULT_ERROR_THRESHOLD
  const errorCooldown   = errorRule?.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const errorEnabled    = errorRule?.enabled    ?? true
  const trafficSkip     = trafficRule?.threshold  ?? DEFAULT_TRAFFIC_DROP_SKIP
  const trafficCooldown = trafficRule?.cooldownMs ?? DEFAULT_COOLDOWN_MS
  const trafficEnabled  = trafficRule?.enabled    ?? true

  // ── Error spike ─────────────────────────────────────────────────────────────
  const newErrors = [...opts.errorGroups.values()].reduce((s, g) => s + g.count, 0)
  if (errorEnabled && newErrors >= errorThreshold) {
    const lastFired = await db.getAlertState(site, 'error_spike')
    if (now - lastFired >= errorCooldown) {
      const topErrors = [...opts.errorGroups.values()].sort((a, b) => b.count - a.count)
      const topText   = topErrors.slice(0, 3).map(g => `  • ${g.count}× ${g.message.slice(0, 80)}`).join('\n')

      await broadcast(
        `🚨 Error spike — ${site}`,
        `${newErrors} new errors in last batch\n\n${topText}`,
        opts.errorGroups,
        channels,
      )
      await db.setAlertFired(site, 'error_spike', now)
      console.log(`[alerts] error_spike fired for ${site} (${newErrors} errors)`)
    }
  }

  // ── Traffic drop ─────────────────────────────────────────────────────────────
  if (opts.newEvents === 0 && opts.hasHistory) {
    const lastFired     = await db.getAlertState(site, 'traffic_drop')
    const missedBatches = await db.incrementMissedBatches(site)

    if (trafficEnabled && missedBatches >= trafficSkip && now - lastFired >= trafficCooldown) {
      await broadcast(
        `⚠️ Traffic drop — ${site}`,
        `No events received for ${missedBatches} consecutive processor runs.`,
        undefined,
        channels,
      )
      await db.setAlertFired(site, 'traffic_drop', now)
      console.log(`[alerts] traffic_drop fired for ${site} (${missedBatches} empty runs)`)
    }
  } else if (opts.newEvents > 0) {
    await db.resetMissedBatches(site)
  }
}
