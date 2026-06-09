import { useEffect, useRef } from 'react'
import type { HeatmapCell } from '../types'

const CELL_PX = 10
const MIN_W   = 1280
const MIN_H   = 800

interface Props { cells: HeatmapCell[] }

export function HeatmapOverlay({ cells }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Canvas dimensions derived from the furthest cell coords (or minimum viewport size)
  const width  = cells.length ? Math.max(MIN_W, Math.max(...cells.map(c => (c.gx + 2) * CELL_PX)) ) : MIN_W
  const height = cells.length ? Math.max(MIN_H, Math.max(...cells.map(c => (c.gy + 2) * CELL_PX)) ) : MIN_H

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, width, height)

    // Page background
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, width, height)

    // Subtle grid lines to convey page structure
    ctx.strokeStyle = '#e9ecef'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= width; x += 100)  { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke() }
    for (let y = 0; y <= height; y += 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y);  ctx.stroke() }

    if (cells.length === 0) return

    // Draw cells sorted low→high so hot spots render on top
    const sorted = [...cells].sort((a, b) => a.intensity - b.intensity)

    for (const cell of sorted) {
      const cx     = cell.gx * CELL_PX + CELL_PX / 2
      const cy     = cell.gy * CELL_PX + CELL_PX / 2
      const radius = CELL_PX * 3

      // HSL hue: 0=red (hot) … 240=blue (cold), alpha scales with intensity
      const hue   = (1 - cell.intensity) * 240
      const alpha = 0.08 + cell.intensity * 0.65

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
      grad.addColorStop(0,   `hsla(${hue}, 100%, 45%, ${alpha})`)
      grad.addColorStop(0.5, `hsla(${hue}, 100%, 45%, ${alpha * 0.45})`)
      grad.addColorStop(1,   `hsla(${hue}, 100%, 45%, 0)`)

      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [cells, width, height])

  if (cells.length === 0) {
    return <div className="empty">No heatmap data. Enter a site and click Load.</div>
  }

  return (
    <div>
      <div className="heatmap-wrap">
        <canvas ref={canvasRef} width={width} height={height} />
      </div>
      <LegendBar />
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)' }}>
        {cells.length.toLocaleString()} cells · {width}×{height}px viewport
      </p>
    </div>
  )
}

function LegendBar() {
  const STEPS = 240
  return (
    <div className="heatmap-legend">
      <span className="legend-label">Low</span>
      <canvas
        width={STEPS}
        height={14}
        style={{ borderRadius: 3, display: 'block' }}
        ref={el => {
          if (!el) return
          const ctx = el.getContext('2d')!
          for (let i = 0; i < STEPS; i++) {
            const hue = (1 - i / STEPS) * 240
            ctx.fillStyle = `hsl(${hue}, 100%, 45%)`
            ctx.fillRect(i, 0, 1, 14)
          }
        }}
      />
      <span className="legend-label">High</span>
    </div>
  )
}
