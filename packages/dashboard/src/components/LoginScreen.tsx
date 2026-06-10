import { useState, FormEvent, useRef } from 'react'
import { motion, useAnimate } from 'framer-motion'
import { login } from '../api'

interface Props { onSuccess: () => void }

export function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [busy,     setBusy]     = useState(false)
  const [err,      setErr]      = useState('')
  const [scope, animateShake]   = useAnimate()
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setErr('')
    const ok = await login(password)
    setBusy(false)
    if (ok) {
      onSuccess()
    } else {
      setErr('Incorrect password')
      setPassword('')
      animateShake(scope.current, { x: [-6, 6, -5, 5, -3, 3, 0] }, { duration: 0.45 })
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  return (
    <motion.div
      className="login-bg"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      {/* Ambient orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />

      <motion.form
        ref={scope}
        className="login-card"
        onSubmit={handleSubmit}
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1,    y: 0  }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: 0.05 }}
      >
        <div>
          <div className="login-logo">
            analytics<span>kit</span>
          </div>
          <p className="login-subtitle">Sign in to continue</p>
        </div>

        <div className="login-field">
          <label className="login-label" htmlFor="pw">Password</label>
          <input
            id="pw"
            ref={inputRef}
            type="password"
            className="login-input"
            placeholder="••••••••"
            value={password}
            onChange={e => { setPassword(e.target.value); setErr('') }}
            autoFocus
            autoComplete="current-password"
          />
        </div>

        <motion.p
          className="login-error"
          initial={false}
          animate={err ? { opacity: 1, y: 0 } : { opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {err}
        </motion.p>

        <button
          type="submit"
          className="login-btn"
          disabled={busy || !password}
        >
          {busy
            ? <motion.span
                key="spin"
                style={{ display: 'inline-block' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
              >⟳</motion.span>
            : 'Sign in'
          }
        </button>
      </motion.form>
    </motion.div>
  )
}
