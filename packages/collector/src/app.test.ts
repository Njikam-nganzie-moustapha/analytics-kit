import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { createApp } from './app'
import type { StorageAdapter, AnalyticsEvent } from '@analytics-kit/storage'

function makeStorage(): StorageAdapter & { written: AnalyticsEvent[][] } {
  const written: AnalyticsEvent[][] = []
  return { written, async write(events) { written.push([...events]) } }
}

// createApp registers SIGTERM/SIGINT handlers — remove after each suite to avoid leaking
const listeners: Array<[string, () => void]> = []
const origOn = process.on.bind(process)
// @ts-ignore — intercept signal handlers so we can clean up
process.on = (event: string, handler: () => void) => {
  if (event === 'SIGTERM' || event === 'SIGINT') listeners.push([event, handler])
  return origOn(event, handler)
}

afterAll(() => {
  for (const [ev, fn] of listeners) process.off(ev, fn)
  process.on = origOn
})

beforeAll(() => {
  process.env.NODE_ENV = 'test' // enables 'test-key' in auth
  delete process.env.SITE_KEYS
})

describe('GET /health', () => {
  it('returns { ok: true, ts, queued }', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(typeof body.ts).toBe('number')
    expect(typeof body.queued).toBe('number')
  })
})

describe('POST /e', () => {
  it('accepts valid event with test-key header', async () => {
    const storage = makeStorage()
    const app = createApp(storage)
    const res = await app.request('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'test-key' },
      body: JSON.stringify([{ t: Date.now(), type: 'pageview', sid: 'abc', site: 'test' }]),
    })
    expect(res.status).toBe(204)
  })

  it('accepts test-key via ?sk= query param', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/e?sk=test-key', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([{ t: Date.now(), type: 'click', sid: 's1', site: 'test' }]),
    })
    expect(res.status).toBe(204)
  })

  it('accepts single event object (not array)', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'test-key' },
      body: JSON.stringify({ t: Date.now(), type: 'pageview', sid: 'abc', site: 'test' }),
    })
    expect(res.status).toBe(204)
  })

  it('returns 401 when no site key in production mode', async () => {
    const orig = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    // Note: auth._keys is computed at module load time, so we test the worker instead for full prod auth.
    // Here we verify the header path works at the route level by passing wrong key.
    const app = createApp(makeStorage())
    const res = await app.request('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'wrong-key' },
      body: JSON.stringify([{ t: 1, type: 'pageview', sid: 's1', site: 'test' }]),
    })
    expect(res.status).toBe(401)
    process.env.NODE_ENV = orig
  })

  it('returns 204 for all-invalid events (filtered out)', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'test-key' },
      body: JSON.stringify([{ no_type: true, no_sid: true }]),
    })
    expect(res.status).toBe(204)
  })

  it('returns 400 for malformed JSON', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/e', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-site-key': 'test-key' },
      body: '{{not json}}',
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /e/health', () => {
  it('returns queue depth with valid key', async () => {
    const app = createApp(makeStorage())
    const res = await app.request('/e/health', {
      headers: { 'x-site-key': 'test-key' },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.ok).toBe(true)
  })
})
