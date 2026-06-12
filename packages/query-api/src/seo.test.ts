import { describe, it, expect } from 'bun:test'
import { auditHtml } from './seo'
import { parseAuditUrl } from './validate'

const GOOD = `<!doctype html><html lang="en"><head>
  <title>Acme — Best widgets online</title>
  <meta name="description" content="Acme sells the best widgets online with fast shipping and a 30-day money-back guarantee for everyone.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://acme.io/">
  <meta property="og:title" content="Acme">
  <meta property="og:image" content="https://acme.io/og.png">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">{"@type":"Organization"}</script>
</head><body>
  <h1>Welcome to Acme</h1>
  <img src="a.png" alt="A widget">
  <p>${'word '.repeat(320)}</p>
</body></html>`

describe('auditHtml', () => {
  it('scores a well-formed page highly', () => {
    const r = auditHtml(GOOD, 'https://acme.io/')
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.title).toBe('Acme — Best widgets online')
    expect(r.checks.find(c => c.id === 'title')?.status).toBe('pass')
    expect(r.checks.find(c => c.id === 'https')?.status).toBe('pass')
  })

  it('fails a bare page', () => {
    const r = auditHtml('<html><body><p>hi</p></body></html>', 'http://x.test/')
    expect(r.score).toBeLessThan(40)
    expect(r.checks.find(c => c.id === 'title')?.status).toBe('fail')
    expect(r.checks.find(c => c.id === 'description')?.status).toBe('fail')
    expect(r.checks.find(c => c.id === 'https')?.status).toBe('fail')
  })

  it('flags noindex and missing alt', () => {
    const r = auditHtml('<html lang="en"><head><title>x123456789</title><meta name="robots" content="noindex"></head><body><h1>h</h1><img src="a"></body></html>', 'https://x.test/')
    expect(r.checks.find(c => c.id === 'robots')?.status).toBe('fail')
    expect(r.checks.find(c => c.id === 'alt')?.status).toBe('fail')
  })
})

describe('parseAuditUrl (SSRF guard)', () => {
  it('accepts public http(s)', () => {
    expect(parseAuditUrl('https://example.com/page')?.url).toContain('example.com')
  })
  it('rejects localhost and private ranges', () => {
    expect(parseAuditUrl('http://localhost/')).toBeNull()
    expect(parseAuditUrl('http://127.0.0.1/')).toBeNull()
    expect(parseAuditUrl('http://10.0.0.5/')).toBeNull()
    expect(parseAuditUrl('http://192.168.1.1/')).toBeNull()
    expect(parseAuditUrl('http://169.254.1.1/')).toBeNull()
  })
  it('rejects non-http protocols', () => {
    expect(parseAuditUrl('file:///etc/passwd')).toBeNull()
    expect(parseAuditUrl('ftp://x/')).toBeNull()
  })
})
