import { describe, it, expect } from 'bun:test'
import { buildTrafficSources } from './traffic'
import { buildGeoStats } from './geo'
import { buildDeviceStats } from './devices'
import { buildConversions } from './conversions'
import { parseUA } from './useragent'
import { classifyReferrer, parseUTM, hostOf } from './referrer'
import type { RawEvent } from './types'

const ss = (sid: string, over: Partial<RawEvent> = {}): RawEvent => ({
  t: 1000, type: 'session_start', sid, site: 's', url: 'https://app.io/', ...over,
})

describe('referrer classification', () => {
  it('direct when no referrer', () => expect(classifyReferrer(undefined)).toBe('direct'))
  it('organic for search engines', () => expect(classifyReferrer('https://www.google.com/search?q=x')).toBe('organic'))
  it('social for social networks', () => expect(classifyReferrer('https://t.co/abc')).toBe('social'))
  it('ai for assistants', () => expect(classifyReferrer('https://chatgpt.com/')).toBe('ai'))
  it('ai for claude', () => expect(classifyReferrer('https://claude.ai/chat')).toBe('ai'))
  it('referral otherwise', () => expect(classifyReferrer('https://news.ycombinator.com/')).toBe('referral'))
  it('internal referrer counts as direct', () => expect(classifyReferrer('https://app.io/x', 'app.io')).toBe('direct'))
  it('hostOf strips www', () => expect(hostOf('https://www.Example.com/p')).toBe('example.com'))
})

describe('parseUTM', () => {
  it('extracts utm params', () => {
    expect(parseUTM('https://app.io/?utm_source=newsletter&utm_medium=email&utm_campaign=spring&utm_content=banner&utm_term=shoes')).toEqual({
      source: 'newsletter', medium: 'email', campaign: 'spring', content: 'banner', term: 'shoes',
    })
  })
  it('empty when none', () => expect(parseUTM('https://app.io/')).toEqual({ source: '', medium: '', campaign: '', content: '', term: '' }))
})

describe('buildTrafficSources', () => {
  it('aggregates sessions by channel', () => {
    const rows = buildTrafficSources([
      ss('a', { referrer: 'https://google.com/' }),
      ss('b', { referrer: 'https://google.com/' }),
      ss('c', { referrer: '' }),
    ])
    const organic = rows.find(r => r.channel === 'organic')
    const direct = rows.find(r => r.channel === 'direct')
    expect(organic?.sessions).toBe(2)
    expect(direct?.sessions).toBe(1)
  })

  it('captures utm campaign', () => {
    const rows = buildTrafficSources([ss('a', { url: 'https://app.io/?utm_source=fb&utm_campaign=launch' })])
    expect(rows[0].utmSource).toBe('fb')
    expect(rows[0].utmCampaign).toBe('launch')
  })
})

describe('parseUA', () => {
  it('detects desktop chrome on windows', () => {
    const r = parseUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML) Chrome/120 Safari/537.36')
    expect(r).toEqual({ deviceType: 'desktop', browser: 'Chrome', os: 'Windows' })
  })
  it('detects iphone safari', () => {
    const r = parseUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17 Mobile/15E Safari/604')
    expect(r.deviceType).toBe('mobile')
    expect(r.os).toBe('iOS')
    expect(r.browser).toBe('Safari')
  })
  it('flags bots', () => expect(parseUA('Googlebot/2.1').deviceType).toBe('bot'))
})

describe('buildDeviceStats', () => {
  it('counts sessions per device/browser/os and skips bots', () => {
    const rows = buildDeviceStats([
      ss('a', { ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537' }),
      ss('b', { ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537' }),
      ss('c', { ua: 'Googlebot/2.1' }),
    ])
    const chrome = rows.find(r => r.browser === 'Chrome')
    expect(chrome?.sessions).toBe(2)
    expect(rows.some(r => r.deviceType === 'bot')).toBe(false)
  })
})

describe('buildGeoStats', () => {
  it('counts sessions per country/city using first geo', () => {
    const rows = buildGeoStats([
      ss('a', { geo: { country: 'fr', city: 'Paris' } }),
      { t: 2000, type: 'click', sid: 'a', site: 's', geo: { country: 'fr', city: 'Paris' } },
      ss('b', { geo: { country: 'US', city: 'NYC' } }),
    ])
    const fr = rows.find(r => r.country === 'FR')
    expect(fr?.city).toBe('Paris')
    expect(fr?.sessions).toBe(1) // session a counted once
    expect(rows.find(r => r.country === 'US')?.sessions).toBe(1)
  })
})

describe('buildConversions', () => {
  it('classifies tel/mailto clicks and custom events', () => {
    const rows = buildConversions([
      { t: 1, type: 'click', sid: 'a', site: 's', url: 'https://app.io/contact', href: 'tel:+33123' },
      { t: 2, type: 'click', sid: 'b', site: 's', url: 'https://app.io/contact', href: 'mailto:x@y.io' },
      { t: 3, type: 'custom', sid: 'c', site: 's', url: 'https://app.io/signup', name: 'signup_completed' },
      { t: 4, type: 'click', sid: 'd', site: 's', url: 'https://app.io/', href: 'https://external.com' },
    ])
    expect(rows.find(r => r.kind === 'phone')?.count).toBe(1)
    expect(rows.find(r => r.kind === 'email')?.count).toBe(1)
    expect(rows.find(r => r.kind === 'signup_completed')?.count).toBe(1)
    // external link is not a conversion
    expect(rows.some(r => r.url === '/' && r.kind === 'phone')).toBe(false)
  })
})
