import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { AlertRule, AlertChannels } from '../types'
import { fetchAlertRules, updateAlertRule, fetchAlertChannels, updateAlertChannels, clearAlertChannel } from '../api'

interface Props { site: string }

const COOLDOWN_OPTIONS = [
  { label: '15 min',  ms: 900_000 },
  { label: '30 min',  ms: 1_800_000 },
  { label: '1 hour',  ms: 3_600_000 },
  { label: '4 hours', ms: 14_400_000 },
  { label: '24 hours',ms: 86_400_000 },
]

const RULE_DEFAULTS: Record<string, { threshold: number; cooldownMs: number; enabled: boolean }> = {
  error_spike:   { threshold: 5,  cooldownMs: 3_600_000, enabled: true },
  traffic_drop:  { threshold: 2,  cooldownMs: 3_600_000, enabled: true },
}

const RULE_META: Record<string, { title: string; icon: string; desc: string; thresholdLabel: string; thresholdHint: string }> = {
  error_spike: {
    title:          'Error Spike',
    icon:           '🚨',
    desc:           'Fire when a processor batch contains more new errors than the threshold.',
    thresholdLabel: 'Max errors per batch',
    thresholdHint:  'Alert fires when new error count ≥ this value',
  },
  traffic_drop: {
    title:          'Traffic Drop',
    icon:           '⚠️',
    desc:           'Fire when no events arrive for N consecutive processor runs (every 5 min).',
    thresholdLabel: 'Consecutive empty runs',
    thresholdHint:  'Alert fires after N consecutive batches with zero events',
  },
}

interface RuleState {
  enabled:    boolean
  threshold:  number
  cooldownMs: number
  saving:     boolean
  saved:      boolean
  error:      string
}

function defaultState(ruleType: string, rule?: AlertRule): RuleState {
  const d = RULE_DEFAULTS[ruleType] ?? { threshold: 5, cooldownMs: 3_600_000, enabled: true }
  return {
    enabled:    rule?.enabled    ?? d.enabled,
    threshold:  rule?.threshold  ?? d.threshold,
    cooldownMs: rule?.cooldownMs ?? d.cooldownMs,
    saving: false, saved: false, error: '',
  }
}

interface ChannelFormState {
  telegramToken:   string
  telegramChatId:  string
  slackWebhookUrl: string
  saving:  boolean
  saved:   boolean
  error:   string
}

export function AlertsTab({ site }: Props) {
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [states,  setStates]  = useState<Record<string, RuleState>>({})

  const [chLoading, setChLoading] = useState(false)
  const [channels,  setChannels]  = useState<AlertChannels | null>(null)
  const [chForm,    setChForm]    = useState<ChannelFormState>({
    telegramToken: '', telegramChatId: '', slackWebhookUrl: '',
    saving: false, saved: false, error: '',
  })

  useEffect(() => {
    if (!site) return
    setLoading(true)
    setLoadErr('')
    Promise.all([
      fetchAlertRules(site),
      fetchAlertChannels(site).catch(() => null),
    ]).then(([rules, ch]) => {
      const byType = Object.fromEntries(rules.map(r => [r.ruleType, r]))
      setStates({
        error_spike:  defaultState('error_spike',  byType['error_spike']),
        traffic_drop: defaultState('traffic_drop', byType['traffic_drop']),
      })
      if (ch) {
        setChannels(ch)
        setChForm(prev => ({
          ...prev,
          telegramChatId:  ch.telegram.chatId  ?? '',
          slackWebhookUrl: ch.slack.webhookUrl ?? '',
        }))
      }
    })
    .catch(e => setLoadErr(String(e)))
    .finally(() => { setLoading(false); setChLoading(false) })
  }, [site])

  function update(ruleType: string, patch: Partial<RuleState>) {
    setStates(prev => ({ ...prev, [ruleType]: { ...prev[ruleType], ...patch } }))
  }

  async function save(ruleType: string) {
    const s = states[ruleType]
    if (!s) return
    update(ruleType, { saving: true, error: '', saved: false })
    try {
      await updateAlertRule(site, ruleType, {
        enabled:     s.enabled,
        threshold:   s.threshold,
        cooldown_ms: s.cooldownMs,
      })
      update(ruleType, { saving: false, saved: true })
      setTimeout(() => update(ruleType, { saved: false }), 2500)
    } catch (e) {
      update(ruleType, { saving: false, error: String(e) })
    }
  }

  async function saveChannels() {
    setChForm(prev => ({ ...prev, saving: true, error: '', saved: false }))
    try {
      const update: Record<string, string | null> = {}
      if (chForm.telegramToken)   update.telegram_token    = chForm.telegramToken.trim()
      if (chForm.telegramChatId)  update.telegram_chat_id  = chForm.telegramChatId.trim()
      if (chForm.slackWebhookUrl) update.slack_webhook_url = chForm.slackWebhookUrl.trim()
      if (Object.keys(update).length === 0) {
        setChForm(prev => ({ ...prev, saving: false, error: 'Enter at least one value to save.' }))
        return
      }
      await updateAlertChannels(site, update)
      const refreshed = await fetchAlertChannels(site).catch(() => null)
      if (refreshed) {
        setChannels(refreshed)
        setChForm(prev => ({
          ...prev,
          telegramToken:   '',
          telegramChatId:  refreshed.telegram.chatId  ?? '',
          slackWebhookUrl: refreshed.slack.webhookUrl ?? '',
        }))
      }
      setChForm(prev => ({ ...prev, saving: false, saved: true }))
      setTimeout(() => setChForm(prev => ({ ...prev, saved: false })), 2500)
    } catch (e) {
      setChForm(prev => ({ ...prev, saving: false, error: String(e) }))
    }
  }

  async function clearChannel(channel: 'telegram' | 'slack') {
    try {
      await clearAlertChannel(site, channel)
      const refreshed = await fetchAlertChannels(site).catch(() => null)
      if (refreshed) {
        setChannels(refreshed)
        setChForm(prev => ({
          ...prev,
          telegramChatId:  refreshed.telegram.chatId  ?? '',
          slackWebhookUrl: refreshed.slack.webhookUrl ?? '',
        }))
      }
    } catch { /* ignore */ }
  }

  if (loading || chLoading) return <div className="empty"><span>Loading alert rules…</span></div>
  if (loadErr) return (
    <div className="empty">
      <span className="empty-title" style={{ color: 'var(--error)' }}>Failed to load</span>
      <span>{loadErr}</span>
    </div>
  )

  const hasTelegram = channels?.telegram.configured
  const hasSlack    = channels?.slack.configured

  return (
    <div>
      {/* ── Notification channels ───────────────────────────────────────────── */}
      <motion.section
        className="alert-channels-section"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h3 className="alert-channels-title">Notification Channels</h3>
        <p className="alert-channels-desc">
          Configure where alerts are sent for <strong>{site}</strong>.
          DB config overrides processor env vars.
        </p>

        <div className="alert-channels-grid">
          {/* Telegram */}
          <div className={`alert-channel-card ${hasTelegram ? 'alert-channel-card--active' : ''}`}>
            <div className="alert-channel-header">
              <span className="alert-channel-icon">✈</span>
              <span className="alert-channel-name">Telegram</span>
              {hasTelegram && <span className="alert-channel-badge">Active</span>}
            </div>
            <label className="alert-field">
              <span className="alert-field-label">Bot token</span>
              <span className="alert-field-hint">
                {hasTelegram ? 'Token configured — enter a new one to replace' : 'e.g. 123456:ABCdef…'}
              </span>
              <input
                type="password"
                className="input"
                placeholder={hasTelegram ? '••••••••' : 'Enter bot token'}
                value={chForm.telegramToken}
                onChange={e => setChForm(prev => ({ ...prev, telegramToken: e.target.value }))}
                autoComplete="off"
              />
            </label>
            <label className="alert-field">
              <span className="alert-field-label">Chat ID</span>
              <span className="alert-field-hint">Numeric ID of the chat or group</span>
              <input
                type="text"
                className="input"
                placeholder="-100123456789"
                value={chForm.telegramChatId}
                onChange={e => setChForm(prev => ({ ...prev, telegramChatId: e.target.value }))}
              />
            </label>
            {hasTelegram && (
              <button className="btn btn-ghost btn-sm alert-channel-clear" onClick={() => clearChannel('telegram')}>
                Remove Telegram
              </button>
            )}
          </div>

          {/* Slack */}
          <div className={`alert-channel-card ${hasSlack ? 'alert-channel-card--active' : ''}`}>
            <div className="alert-channel-header">
              <span className="alert-channel-icon">#</span>
              <span className="alert-channel-name">Slack</span>
              {hasSlack && <span className="alert-channel-badge">Active</span>}
            </div>
            <label className="alert-field">
              <span className="alert-field-label">Webhook URL</span>
              <span className="alert-field-hint">
                {hasSlack ? 'Webhook configured — enter a new URL to replace' : 'https://hooks.slack.com/services/…'}
              </span>
              <input
                type="password"
                className="input"
                placeholder={hasSlack ? '••••••••' : 'Enter Slack webhook URL'}
                value={chForm.slackWebhookUrl}
                onChange={e => setChForm(prev => ({ ...prev, slackWebhookUrl: e.target.value }))}
                autoComplete="off"
              />
            </label>
            {hasSlack && (
              <button className="btn btn-ghost btn-sm alert-channel-clear" onClick={() => clearChannel('slack')}>
                Remove Slack
              </button>
            )}
          </div>
        </div>

        <div className="alert-channel-footer">
          {chForm.error && <span className="alert-rule-err">{chForm.error}</span>}
          <button
            className={`btn ${chForm.saved ? 'btn-success' : ''}`}
            disabled={chForm.saving}
            onClick={saveChannels}
          >
            {chForm.saving ? 'Saving…' : chForm.saved ? '✓ Saved' : 'Save channels'}
          </button>
        </div>
      </motion.section>

      {/* ── Alert rules ─────────────────────────────────────────────────────── */}
      <div className="alert-rules-grid">
        {(['error_spike', 'traffic_drop'] as const).map((ruleType, i) => {
          const meta = RULE_META[ruleType]
          const s    = states[ruleType]
          if (!s) return null

          return (
            <motion.div
              key={ruleType}
              className={`alert-rule-card ${!s.enabled ? 'alert-rule-card--disabled' : ''}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.25 }}
            >
              <div className="alert-rule-header">
                <span className="alert-rule-icon">{meta.icon}</span>
                <div className="alert-rule-title-wrap">
                  <span className="alert-rule-title">{meta.title}</span>
                  <span className="alert-rule-desc">{meta.desc}</span>
                </div>
                <label className="alert-toggle" title={s.enabled ? 'Disable rule' : 'Enable rule'}>
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={e => update(ruleType, { enabled: e.target.checked })}
                  />
                  <span className="alert-toggle-track">
                    <span className="alert-toggle-thumb" />
                  </span>
                </label>
              </div>

              <div className="alert-rule-fields">
                <label className="alert-field">
                  <span className="alert-field-label">{meta.thresholdLabel}</span>
                  <span className="alert-field-hint">{meta.thresholdHint}</span>
                  <input
                    type="number"
                    className="input alert-number-input"
                    min={1}
                    max={10000}
                    value={s.threshold}
                    disabled={!s.enabled}
                    onChange={e => update(ruleType, { threshold: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                </label>

                <label className="alert-field">
                  <span className="alert-field-label">Cooldown</span>
                  <span className="alert-field-hint">Minimum time between repeated alerts</span>
                  <select
                    className="input"
                    value={s.cooldownMs}
                    disabled={!s.enabled}
                    onChange={e => update(ruleType, { cooldownMs: parseInt(e.target.value) })}
                  >
                    {COOLDOWN_OPTIONS.map(o => (
                      <option key={o.ms} value={o.ms}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="alert-rule-footer">
                {s.error && <span className="alert-rule-err">{s.error}</span>}
                <button
                  className={`btn ${s.saved ? 'btn-success' : ''}`}
                  disabled={s.saving}
                  onClick={() => save(ruleType)}
                >
                  {s.saving ? 'Saving…' : s.saved ? '✓ Saved' : 'Save rule'}
                </button>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
