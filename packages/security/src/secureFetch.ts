// Drop-in fetch() wrapper: strips forwarding headers, sets generic UA, aliases domains in logs.
// Use instead of raw fetch() for all outbound requests (SEO audit, PageSpeed, Telegram, etc.)

const DOMAIN_ALIASES: Record<string, string> = {
  'api.telegram.org':                                              'notify',
  'www.googleapis.com':                                            'gapi',
  'analytics-collector-lia.njikammoustapha67.workers.dev':         'self-collector',
  'analytics-query-lia.njikammoustapha67.workers.dev':             'self-query',
  'n8n-mercleo.aws-ap-northeast-1.turso.io':                       'db',
  'vercel.app':                                                    'cdn',
}

const GENERIC_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36'
const STRIP_HDRS = ['x-forwarded-for', 'x-real-ip', 'x-forwarded-proto', 'x-forwarded-host', 'x-forwarded-port', 'forwarded']

function logAlias(url: string | URL | Request): string {
  try {
    const s = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url
    const u = new URL(s)
    // Match on hostname or partial hostname suffix
    for (const [domain, alias] of Object.entries(DOMAIN_ALIASES)) {
      if (u.hostname === domain || u.hostname.endsWith('.' + domain)) return alias
    }
    return u.hostname
  } catch { return '(url)' }
}

export async function secureFetch(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  const headers = new Headers((init as RequestInit | undefined)?.headers)
  headers.set('user-agent', GENERIC_UA)
  for (const h of STRIP_HDRS) headers.delete(h)

  const safe: RequestInit = { ...(init as RequestInit | undefined), headers }
  console.log(JSON.stringify({ fetch: logAlias(url), ts: Date.now() }))
  return fetch(url as Parameters<typeof fetch>[0], safe)
}
