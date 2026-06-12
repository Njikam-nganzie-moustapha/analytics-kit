import { useCallback, useEffect, useState } from 'react'
import { fetchBranding } from '@/api'
import type { Branding } from '@/types'

// Convert a #rrggbb hex to the "H S% L%" triple our CSS tokens use.
export function hexToHslTriple(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const int = parseInt(m[1], 16)
  const r = ((int >> 16) & 255) / 255, g = ((int >> 8) & 255) / 255, b = (int & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

export function hslTripleToHex(triple: string | null | undefined): string {
  const m = triple && /^(\d+) (\d+)% (\d+)%$/.exec(triple)
  if (!m) return '#2563eb'
  const h = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h * 12) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Applies a brand primary colour at runtime (overrides the CSS token inline).
export function applyPrimary(primary: string | null | undefined) {
  const root = document.documentElement
  if (primary && /^\d/.test(primary)) {
    root.style.setProperty('--primary', primary)
    root.style.setProperty('--ring', primary)
  } else {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--ring')
  }
}

export function useBranding(site: string) {
  const [branding, setBranding] = useState<Branding | null>(null)

  const reload = useCallback(() => {
    if (!site) { setBranding(null); return }
    fetchBranding(site).then(setBranding).catch(() => setBranding(null))
  }, [site])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { applyPrimary(branding?.primary); return () => applyPrimary(null) }, [branding?.primary])

  return { branding, reload }
}
