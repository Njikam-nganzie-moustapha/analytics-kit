import { describe, it, expect } from 'bun:test'
import { buildHeatmapCells, normalizeCells, CELL_PX } from './heatmap'
import type { RawEvent } from './types'

const base: RawEvent = {
  t: 1000, type: 'click', sid: 's1', site: 'test',
  x: 15, y: 25, url: 'https://example.com/page',
}

describe('buildHeatmapCells', () => {
  it('ignores non-mouse events', () => {
    const cells = buildHeatmapCells([{ ...base, type: 'pageview' }])
    expect(cells).toHaveLength(0)
  })

  it('maps x,y to correct grid cells', () => {
    const cells = buildHeatmapCells([base])
    expect(cells).toHaveLength(1)
    expect(cells[0].gx).toBe(Math.floor(15 / CELL_PX))
    expect(cells[0].gy).toBe(Math.floor(25 / CELL_PX))
    expect(cells[0].count).toBe(1)
    expect(cells[0].site).toBe('test')
  })

  it('accumulates count for same cell', () => {
    const cells = buildHeatmapCells([base, base, base])
    expect(cells).toHaveLength(1)
    expect(cells[0].count).toBe(3)
  })

  it('creates separate cells for different positions', () => {
    const cells = buildHeatmapCells([base, { ...base, x: 100, y: 200 }])
    expect(cells).toHaveLength(2)
  })

  it('separates cells by site', () => {
    const cells = buildHeatmapCells([base, { ...base, site: 'other' }])
    expect(cells).toHaveLength(2)
  })

  it('strips query string and hash from URL', () => {
    const cells = buildHeatmapCells([
      { ...base, url: 'https://example.com/page?q=1#anchor' },
      { ...base, url: 'https://example.com/page?q=2' },
      { ...base, url: 'https://example.com/page' },
    ])
    expect(cells).toHaveLength(1)
    expect(cells[0].count).toBe(3)
  })

  it('handles relative URL fallback', () => {
    const cells = buildHeatmapCells([{ ...base, url: '/page?q=1' }])
    expect(cells[0].url).toBe('/page')
  })

  it('ignores events with missing x', () => {
    const cells = buildHeatmapCells([{ ...base, x: undefined }])
    expect(cells).toHaveLength(0)
  })

  it('ignores events with missing y', () => {
    const cells = buildHeatmapCells([{ ...base, y: undefined }])
    expect(cells).toHaveLength(0)
  })

  it('handles mouse_move events too', () => {
    const cells = buildHeatmapCells([{ ...base, type: 'mouse_move' }])
    expect(cells).toHaveLength(1)
  })

  it('returns empty array for no events', () => {
    expect(buildHeatmapCells([])).toHaveLength(0)
  })

  it('clamps negative coordinates to 0', () => {
    const cells = buildHeatmapCells([{ ...base, x: -5, y: -10 }])
    expect(cells[0].gx).toBe(0)
    expect(cells[0].gy).toBe(0)
  })
})

describe('normalizeCells', () => {
  it('sets max cell intensity to 1.0', () => {
    const cells = buildHeatmapCells([base, base, { ...base, x: 100, y: 200 }])
    const norm = normalizeCells(cells)
    expect(Math.max(...norm.map(c => c.intensity))).toBe(1)
  })

  it('proportionally scales lower-count cells', () => {
    const cells = buildHeatmapCells([base, base, { ...base, x: 100, y: 200 }])
    const norm = normalizeCells(cells)
    const sorted = norm.sort((a, b) => b.count - a.count)
    expect(sorted[0].intensity).toBe(1)
    expect(sorted[1].intensity).toBe(0.5)
  })

  it('handles single cell → intensity 1.0', () => {
    const cells = buildHeatmapCells([base])
    const norm = normalizeCells(cells)
    expect(norm[0].intensity).toBe(1)
  })

  it('handles empty array', () => {
    expect(normalizeCells([])).toHaveLength(0)
  })
})
