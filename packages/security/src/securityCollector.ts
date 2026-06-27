// fire-and-forget security event pipeline
// Logs to console (CF Workers logs / stdout) + Telegram for high/critical

import { secureFetch } from './secureFetch'

export type Severity = 'low' | 'medium' | 'high' | 'critical'
export type SecEnv = { TELEGRAM_BOT_TOKEN?: string; TELEGRAM_CHAT_ID?: string }
export type ExecCtx = { waitUntil: (p: Promise<unknown>) => void }

export function getSecEnv(c: object): SecEnv {
  const env = (c as { env?: Record<string, string | undefined> }).env ?? {}
  return {
    TELEGRAM_BOT_TOKEN: env.TELEGRAM_BOT_TOKEN ?? (typeof process !== 'undefined' ? process.env.TELEGRAM_BOT_TOKEN : undefined),
    TELEGRAM_CHAT_ID:   env.TELEGRAM_CHAT_ID   ?? (typeof process !== 'undefined' ? process.env.TELEGRAM_CHAT_ID   : undefined),
  }
}

export function getExecCtx(c: object): ExecCtx | undefined {
  return (c as { executionCtx?: ExecCtx }).executionCtx
}

export function trackSecurityEvent(
  name: string,
  severity: Severity,
  props: Record<string, unknown>,
  env: SecEnv,
  ctx?: ExecCtx,
): void {
  // Sync structured log — always captured by CF Workers logs / stdout
  console.log(JSON.stringify({ level: 'SECURITY', event: name, severity, ...props, ts: Date.now() }))

  if ((severity === 'high' || severity === 'critical') && env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID) {
    const icon = severity === 'critical' ? '🚨' : '⚠️'
    const lines = Object.entries(props).map(([k, v]) => `${k}: ${String(v).slice(0, 100)}`).join('\n')
    const text = `${icon} [analytics-kit] ${severity.toUpperCase()}: ${name}\n${lines}`
    const p = secureFetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text }),
    }).catch(() => {})
    ctx?.waitUntil(p)
  }
}
