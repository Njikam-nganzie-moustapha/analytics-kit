import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import worker from './worker'

// Intercept all Turso fetch calls
const originalFetch = globalThis.fetch
beforeAll(() => {
  globalThis.fetch = mock(async (url: RequestInfo | URL) => {
    const u = String(url)
    if (u.includes('turso') || u.includes('pipeline')) {
      return new Response(JSON.stringify({
        results: [{
          response: {
            type: 'execute',
            result: { cols: [], rows: [] },
          },
        }],
      }), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
})
afterAll(() => { globalThis.fetch = originalFetch })

const ENV = {
  TURSO_URL: 'https://fake-db.turso.io',
  TURSO_TOKEN: 'fake-token',
  QUERY_API_KEY: 'secret-api-key',
  CORS_ORIGINS: '*',
}

const ENV_OPEN = { ...ENV, QUERY_API_KEY: '' }

function req(path: string, init?: RequestInit) {
  return new Request(`https://query.test${path}`, init)
}

describe('Worker GET /health', () => {
  it('returns ok without auth', async () => {
    const res = await worker.fetch(req('/health'), ENV as never)
    expect(res.status).toBe(200)
    expect((await res.json() as Record<string, unknown>).ok).toBe(true)
  })
})

describe('Worker auth enforcement', () => {
  it('rejects data routes without API key', async () => {
    const res = await worker.fetch(req('/heatmap?site=test'), ENV as never)
    expect(res.status).toBe(401)
  })

  it('rejects wrong API key', async () => {
    const res = await worker.fetch(req('/heatmap?site=test', {
      headers: { 'x-api-key': 'wrong-key' },
    }), ENV as never)
    expect(res.status).toBe(401)
  })

  it('passes with correct API key', async () => {
    const res = await worker.fetch(req('/heatmap?site=test', {
      headers: { 'x-api-key': 'secret-api-key' },
    }), ENV as never)
    expect(res.status).not.toBe(401)
  })

  it('passes via ?api_key= query param', async () => {
    const res = await worker.fetch(req('/heatmap?site=test&api_key=secret-api-key'), ENV as never)
    expect(res.status).not.toBe(401)
  })

  it('open access when QUERY_API_KEY empty', async () => {
    const res = await worker.fetch(req('/heatmap?site=test'), ENV_OPEN as never)
    expect(res.status).not.toBe(401)
  })
})

describe('Worker /auth endpoint', () => {
  it('GET /auth returns required:true when password configured', async () => {
    const envWithPw = { ...ENV, DASHBOARD_PASSWORD: 'hunter2' }
    const res = await worker.fetch(req('/auth'), envWithPw as never)
    const body = await res.json() as Record<string, unknown>
    expect(body.required).toBe(true)
  })

  it('GET /auth returns required:false when no password', async () => {
    const res = await worker.fetch(req('/auth'), ENV as never)
    const body = await res.json() as Record<string, unknown>
    expect(body.required).toBe(false)
  })

  it('POST /auth with wrong password returns 401', async () => {
    const envWithPw = { ...ENV, DASHBOARD_PASSWORD: 'hunter2' }
    const res = await worker.fetch(req('/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' }),
    }), envWithPw as never)
    expect(res.status).toBe(401)
  })

  it('POST /auth with correct password returns token', async () => {
    const envWithPw = { ...ENV, DASHBOARD_PASSWORD: 'hunter2' }
    const res = await worker.fetch(req('/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'hunter2' }),
    }), envWithPw as never)
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.token).toBe('secret-api-key')
  })
})

describe('Worker data routes — param validation', () => {
  it('GET /heatmap without site returns 400', async () => {
    const res = await worker.fetch(req('/heatmap', {
      headers: { 'x-api-key': 'secret-api-key' },
    }), ENV as never)
    expect(res.status).toBe(400)
  })

  it('GET /zones without site returns 400', async () => {
    const res = await worker.fetch(req('/zones', {
      headers: { 'x-api-key': 'secret-api-key' },
    }), ENV as never)
    expect(res.status).toBe(400)
  })

  it('GET /sessions without site returns 400', async () => {
    const res = await worker.fetch(req('/sessions', {
      headers: { 'x-api-key': 'secret-api-key' },
    }), ENV as never)
    expect(res.status).toBe(400)
  })

  it('GET /errors without site returns 400', async () => {
    const res = await worker.fetch(req('/errors', {
      headers: { 'x-api-key': 'secret-api-key' },
    }), ENV as never)
    expect(res.status).toBe(400)
  })
})
