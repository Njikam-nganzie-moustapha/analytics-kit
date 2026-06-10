import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import worker from './worker'

// Intercept all fetch() calls so no real Turso requests are made
const originalFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = mock(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.includes('turso') || u.includes('pipeline')) {
      // Simulate successful Turso batch write
      return new Response(JSON.stringify({
        results: [{ response: { type: 'execute', result: { cols: [], rows: [] } } }],
      }), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})
afterAll(() => { globalThis.fetch = originalFetch })

const ENV = {
  TURSO_URL: 'https://fake-db.turso.io',
  TURSO_TOKEN: 'fake-token',
  SITE_KEYS: 'valid-key,another-key',
  CORS_ORIGINS: '*',
}

function req(path: string, init?: RequestInit) {
  return new Request(`https://collector.test${path}`, init)
}

describe('Worker GET /health', () => {
  it('returns ok without auth', async () => {
    const res = await worker.fetch(req('/health'), ENV as never)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(typeof body.ts).toBe('number')
  })
})

describe('Worker POST /e — auth', () => {
  it('rejects request with no site key', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ t: 1, type: 'pageview', sid: 's1', site: 'test' }]),
    }), ENV as never)
    expect(res.status).toBe(401)
  })

  it('rejects request with wrong site key', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'wrong' },
      body: JSON.stringify([{ t: 1, type: 'pageview', sid: 's1', site: 'test' }]),
    }), ENV as never)
    expect(res.status).toBe(401)
  })

  it('accepts request with valid site key in header', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'valid-key' },
      body: JSON.stringify([{ t: Date.now(), type: 'pageview', sid: 's1', site: 'test' }]),
    }), ENV as never)
    expect(res.status).toBe(204)
  })

  it('accepts second valid key', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'another-key' },
      body: JSON.stringify([{ t: Date.now(), type: 'click', sid: 's2', site: 'test' }]),
    }), ENV as never)
    expect(res.status).toBe(204)
  })

  it('accepts site key via ?sk= query param', async () => {
    const res = await worker.fetch(req('/e?sk=valid-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ t: Date.now(), type: 'scroll', sid: 's3', site: 'test' }]),
    }), ENV as never)
    expect(res.status).toBe(204)
  })
})

describe('Worker POST /e — payload', () => {
  it('accepts array of events', async () => {
    const events = [
      { t: 1000, type: 'pageview', sid: 's1', site: 'test' },
      { t: 1001, type: 'click', sid: 's1', site: 'test' },
    ]
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'valid-key' },
      body: JSON.stringify(events),
    }), ENV as never)
    expect(res.status).toBe(204)
  })

  it('accepts single event object', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'valid-key' },
      body: JSON.stringify({ t: 1, type: 'pageview', sid: 's1', site: 'test' }),
    }), ENV as never)
    expect(res.status).toBe(204)
  })

  it('returns 204 when all events are invalid (filtered)', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'valid-key' },
      body: JSON.stringify([{ no_required_fields: true }]),
    }), ENV as never)
    expect(res.status).toBe(204)
  })

  it('returns 400 for malformed JSON', async () => {
    const res = await worker.fetch(req('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'valid-key' },
      body: 'not json {{',
    }), ENV as never)
    expect(res.status).toBe(400)
  })
})
