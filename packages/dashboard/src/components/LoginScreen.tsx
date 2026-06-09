import { useState, FormEvent } from 'react'
import { login } from '../api'

interface Props {
  onSuccess: () => void
}

export function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const ok = await login(password)
    setBusy(false)
    if (ok) {
      onSuccess()
    } else {
      setErr('Incorrect password')
      setPassword('')
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--bg, #0f1117)',
    }}>
      <form onSubmit={handleSubmit} style={{
        background: 'var(--card, #1a1d27)', border: '1px solid var(--border, #2a2d3a)',
        borderRadius: 12, padding: '2rem', width: 320,
        display: 'flex', flexDirection: 'column', gap: '1rem',
      }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text, #e2e8f0)', textAlign: 'center' }}>
          analytics<span style={{ color: 'var(--accent, #6366f1)' }}>kit</span>
        </div>

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          style={{
            background: 'var(--bg, #0f1117)', border: '1px solid var(--border, #2a2d3a)',
            borderRadius: 6, padding: '0.5rem 0.75rem', color: 'var(--text, #e2e8f0)',
            fontSize: '0.9rem', outline: 'none',
          }}
        />

        {err && (
          <div style={{ color: '#f87171', fontSize: '0.8rem', textAlign: 'center' }}>{err}</div>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          style={{
            background: 'var(--accent, #6366f1)', color: '#fff', border: 'none',
            borderRadius: 6, padding: '0.55rem', fontWeight: 600, cursor: 'pointer',
            opacity: (busy || !password) ? 0.5 : 1,
          }}
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
