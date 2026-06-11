import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import type { AlertRule } from '../types'
import { fetchAlertRules, updateAlertRule } from '../api'

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

export function AlertsTab({ site }: Props) {
  const [loading, setLoading] = useState(false)
  const [loadErr, setLoadErr] = useState('')
  const [states,  setStates]  = useState<Record<string, RuleState>>({})

  useEffect(() => {
    if (!site) return
    setLoading(true)
    setLoadErr('')
    fetchAlertRules(site)
      .then(rules => {
        const byType = Object.fromEntries(rules.map(r => [r.ruleType, r]))
        setStates({
          error_spike:  defaultState('error_spike',  byType['error_spike']),
          traffic_drop: defaultState('traffic_drop', byType['traffic_drop']),
        })
      })
      .catch(e => setLoadErr(String(e)))
      .finally(() => setLoading(false))
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

  if (loading) return <div className="empty"><span>Loading alert rules…</span></div>
  if (loadErr) return (
    <div className="empty">
      <span className="empty-title" style={{ color: 'var(--error)' }}>Failed to load</span>
      <span>{loadErr}</span>
    </div>
  )

  return (
    <div>
      <div className="alerts-notice">
        <span className="alerts-notice-icon">ℹ</span>
        Alerts are sent via <strong>Telegram</strong> or <strong>Slack</strong> configured in the
        processor's environment variables (<code>ALERT_TELEGRAM_TOKEN</code>, <code>ALERT_SLACK_WEBHOOK_URL</code>).
        Rules below override the processor's defaults for this site.
      </div>

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
