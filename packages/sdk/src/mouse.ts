import type { TrackerConfig, ZoneDef, PushFn } from './types'
import { absPos, getSelector, debounce } from './utils'
import { addBreadcrumb } from './breadcrumbs'

interface ZoneState {
  def: ZoneDef
  active: boolean
  enterAt: number
  rect?: { left: number; top: number; right: number; bottom: number }
}

let zones: ZoneState[] = []
let lastMoveAt = 0
let lastX = 0
let lastY = 0

export function startMouseTracking(cfg: TrackerConfig, push: PushFn): void {
  if (cfg.zones?.length) {
    zones = cfg.zones.map(def => ({ def, active: false, enterAt: 0 }))
    refreshZoneRects()
    window.addEventListener('scroll', debounce(refreshZoneRects, 150), { passive: true })
    window.addEventListener('resize', debounce(refreshZoneRects, 200), { passive: true })
  }

  document.addEventListener('mousemove', (e) => {
    const now = Date.now()
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    const velocity = Math.sqrt(dx * dx + dy * dy)

    // Sampling adaptatif : rapide si l'utilisateur bouge vite
    const interval = velocity > 200 ? 16 : velocity > 50 ? 50 : 200

    if (now - lastMoveAt >= interval) {
      const pos = absPos(e)
      push({ type: 'mouse_move', ...pos })
      lastMoveAt = now
      lastX = e.clientX
      lastY = e.clientY

      if (zones.length) checkZones(e.clientX, pos.y, now, push)
    }
  }, { passive: true })

  document.addEventListener('click', (e) => {
    const pos = absPos(e)
    const selector = getSelector(e.target as Element)
    const activeZones = zones.filter(z => z.active).map(z => z.def.id)
    // Capture the nearest anchor's href so the processor can classify
    // tel:/mailto:/external clicks as conversions. Truncated; no PII beyond
    // what the link itself exposes.
    const anchor = (e.target as Element | null)?.closest?.('a')
    const href = anchor?.getAttribute('href') || undefined
    addBreadcrumb({ category: 'click', message: selector })
    push({
      type: 'click',
      ...pos,
      target: selector,
      ...(href ? { href: href.slice(0, 300) } : {}),
      ...(activeZones.length ? { zoneIds: activeZones } : {}),
    })
  })

  // Scroll : position absolue + ratio (pour heatmap normalisée)
  let scrollTimer: ReturnType<typeof setTimeout>
  document.addEventListener('scroll', () => {
    clearTimeout(scrollTimer)
    scrollTimer = setTimeout(() => {
      const sh = document.documentElement.scrollHeight
      push({
        type: 'scroll',
        scrollY: Math.round(window.scrollY),
        ratio: sh > 0 ? Math.round((window.scrollY / sh) * 100) : 0,
      })
    }, 100)
  }, { passive: true })
}

function checkZones(clientX: number, absY: number, now: number, push: PushFn): void {
  for (const zone of zones) {
    const inside = zone.rect
      ? clientX >= zone.rect.left && clientX <= zone.rect.right &&
        absY >= zone.rect.top && absY <= zone.rect.bottom
      : insideBbox(clientX, absY, zone.def)

    if (inside && !zone.active) {
      zone.active = true
      zone.enterAt = now
      push({ type: 'zone_enter', zoneId: zone.def.id })
    } else if (!inside && zone.active) {
      zone.active = false
      push({ type: 'zone_leave', zoneId: zone.def.id, dwellMs: now - zone.enterAt })
    }
  }
}

function insideBbox(x: number, y: number, def: ZoneDef): boolean {
  const b = def.bbox
  if (!b) return false
  if (b.unit === 'pct') {
    const W = document.documentElement.scrollWidth
    const H = document.documentElement.scrollHeight
    return x >= (b.x / 100) * W && x <= ((b.x + b.w) / 100) * W &&
           y >= (b.y / 100) * H && y <= ((b.y + b.h) / 100) * H
  }
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h
}

function refreshZoneRects(): void {
  for (const zone of zones) {
    if (!zone.def.selector) continue
    const el = document.querySelector(zone.def.selector)
    if (!el) continue
    const r = el.getBoundingClientRect()
    zone.rect = {
      left: r.left,
      top: r.top + window.scrollY,
      right: r.right,
      bottom: r.bottom + window.scrollY,
    }
  }
}

export function stopMouseTracking(): void {
  zones = []
}
