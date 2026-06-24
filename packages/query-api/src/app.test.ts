import { describe, it, expect, beforeAll } from 'bun:test'
import { createApp } from './app'
import type { QueryTurso } from './turso'

beforeAll(() => {
  // Ensure no API key set so app runs in open-access mode
  delete process.env.QUERY_API_KEY
  delete process.env.DASHBOARD_PASSWORD
})

function makeDb(): QueryTurso {
  return {
    getHeatmapCells:  async () => [{ site: 'test', url: '/page', gx: 1, gy: 2, count: 5 }],
    getZoneStats:     async () => [{ site: 'test', zoneId: 'hero', url: '/page', enters: 10, clicks: 3, avgDwell: 1000 }],
    getSessions:      async () => [{ sid: 'abc', site: 'test', uid: null, started: 1000, ended: 5000, duration: 4000, urlCount: 2, eventCount: 10, hasReplay: false }],
    getReplayEvents:  async () => [{ t: 1000, type: 'rrweb' }],
    getErrorGroups:   async () => [],
    getSessionErrors: async () => [],
    getVitals:        async () => [],
    updateErrorState: async () => {},
    upsertSourceMap:  async () => {},
    listSourceMaps:   async () => [],
    deleteSourceMap:  async () => {},
    upsertCronCheckin: async () => {},
    getCronMonitors:  async () => [],
    deleteCronMonitor: async () => {},
    ensureSchema:     async () => {},
  } as unknown as QueryTurso
}

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await createApp(makeDb()).request('/health')
    expect(res.status).toBe(200)
    expect((await res.json() as Record<string, unknown>).ok).toBe(true)
  })
})

describe('GET /auth', () => {
  it('returns required: false when no PASSWORD configured', async () => {
    const res = await createApp(makeDb()).request('/auth')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.required).toBe(false)
  })
})

describe('GET /heatmap', () => {
  it('returns 400 when site param missing', async () => {
    const res = await createApp(makeDb()).request('/heatmap')
    expect(res.status).toBe(400)
  })

  it('returns cells array with meta', async () => {
    const res = await createApp(makeDb()).request('/heatmap?site=test&url=/page')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(Array.isArray(body.cells)).toBe(true)
    expect((body.cells as unknown[]).length).toBe(1)
    expect(body.meta).toBeTruthy()
  })

  it('accepts site without url', async () => {
    const res = await createApp(makeDb()).request('/heatmap?site=test')
    expect(res.status).toBe(200)
  })
})

describe('GET /zones', () => {
  it('returns 400 when site param missing', async () => {
    expect((await createApp(makeDb()).request('/zones')).status).toBe(400)
  })

  it('returns zones data', async () => {
    const res = await createApp(makeDb()).request('/zones?site=test')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(Array.isArray(body.zones)).toBe(true)
  })
})

describe('GET /sessions', () => {
  it('returns 400 when site param missing', async () => {
    expect((await createApp(makeDb()).request('/sessions')).status).toBe(400)
  })

  it('returns sessions data', async () => {
    const res = await createApp(makeDb()).request('/sessions?site=test')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(Array.isArray(body.sessions)).toBe(true)
  })
})

describe('GET /replay/:sid', () => {
  it('returns 400 without site param', async () => {
    const res = await createApp(makeDb()).request('/replay/abc')
    expect(res.status).toBe(400)
  })
  it('returns events array when site provided', async () => {
    const res = await createApp(makeDb()).request('/replay/abc?site=test')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(Array.isArray(body.events)).toBe(true)
    expect((body.events as unknown[]).length).toBe(1)
  })
})

describe('GET /errors', () => {
  it('returns 400 when site param missing', async () => {
    expect((await createApp(makeDb()).request('/errors')).status).toBe(400)
  })

  it('returns error groups', async () => {
    const res = await createApp(makeDb()).request('/errors?site=test')
    expect(res.status).toBe(200)
  })
})
