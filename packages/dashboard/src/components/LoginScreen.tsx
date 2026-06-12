import { useState, FormEvent, useRef } from 'react'
import { motion, useAnimate } from 'framer-motion'
import { Activity, Loader2 } from 'lucide-react'
import { login } from '../api'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/theme'

interface Props { onSuccess: () => void }

export function LoginScreen({ onSuccess }: Props) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [scope, animateShake] = useAnimate()
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
    <div className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-4">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      {/* Ambient orbs */}
      <div className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 size-96 rounded-full bg-brand-amber/10 blur-3xl" />

      <motion.div
        ref={scope}
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm"
      >
        <Card className="p-7">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="mb-3 grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Activity className="size-5" />
            </span>
            <h1 className="text-lg font-bold tracking-tight">analytics<span className="text-primary">kit</span></h1>
            <p className="mt-1 text-sm text-muted-foreground">Sign in to continue</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <Input
                id="pw"
                ref={inputRef}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setErr('') }}
                autoFocus
                autoComplete="current-password"
                aria-invalid={!!err}
                aria-describedby={err ? 'pw-error' : undefined}
              />
              <p id="pw-error" role="alert" aria-live="polite"
                className="min-h-4 text-[12px] text-destructive transition-opacity"
                style={{ opacity: err ? 1 : 0 }}>
                {err}
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={busy || !password}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : 'Sign in'}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
