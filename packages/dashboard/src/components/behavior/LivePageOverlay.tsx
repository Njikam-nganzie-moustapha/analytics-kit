import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { HeatmapCell } from '@/types'

const CELL_PX = 10
// Render widths chosen to match the most common recorded viewports so click
// coordinates (stored as raw clientX/clientY) line up with the framed page.
const DEVICE_W = { desktop: 1536, mobile: 414, all: 1536 } as const

interface Props {
  baseUrl: string
  path: string
  cells: HeatmapCell[]
  device: 'all' | 'desktop' | 'mobile'
}

// Overlays the click heatmap on top of the *real* LIA page loaded in an iframe.
// Requires the origin to allow framing by this dashboard (CSP frame-ancestors).
export function LivePageOverlay({ baseUrl, path, cells, device }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [blocked, setBlocked] = useState(false)
  const w = DEVICE_W[device]
  const h = cells.length ? Math.max(900, Math.max(...cells.map(c => (c.gy + 4) * CELL_PX))) : 900
  const src = baseUrl.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)
    if (cells.length === 0) return
    const maxCount = Math.max(1, ...cells.map(c => c.count || 0))
    const sorted = [...cells].sort((a, b) => (a.count || 0) - (b.count || 0))
    for (const cell of sorted) {
      const intensity = Math.min(1, Math.max(0, (cell.count || 0) / maxCount))
      const cx = cell.gx * CELL_PX + CELL_PX / 2
      const cy = cell.gy * CELL_PX + CELL_PX / 2
      const radius = CELL_PX * 3.5
      const hue = (1 - intensity) * 240
      const alpha = 0.15 + intensity * 0.6
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0, `hsla(${hue}, 100%, 50%, ${alpha})`)
      grad.addColorStop(0.5, `hsla(${hue}, 100%, 50%, ${alpha * 0.4})`)
      grad.addColorStop(1, `hsla(${hue}, 100%, 50%, 0)`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [cells, w, h])

  return (
    <div>
      {blocked && (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>The page refused to load in a frame. The origin must allow framing by this dashboard
            (CSP <code>frame-ancestors</code>). Falling back to the dot view is recommended until then.</span>
        </div>
      )}
      {/* Scale the whole stack down to fit the panel while keeping coords aligned */}
      <div className="overflow-auto rounded-lg border border-border bg-muted/30" style={{ maxHeight: 640 }}>
        <div style={{ position: 'relative', width: w, height: h }}>
          <iframe
            title="live page"
            src={src}
            width={w}
            height={h}
            onError={() => setBlocked(true)}
            style={{ border: 0, position: 'absolute', inset: 0, background: '#fff' }}
            sandbox="allow-same-origin allow-scripts"
          />
          <canvas
            ref={canvasRef}
            width={w}
            height={h}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
          />
        </div>
      </div>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Heatmap overlaid on the live page ({device === 'mobile' ? 'mobile' : 'desktop'} width {w}px). Scroll to see below the fold.
      </p>
    </div>
  )
}
