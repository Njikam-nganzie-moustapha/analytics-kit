// In-process IDS: scanner UA detection + SQL/LFI/RCE/XSS injection in URL
// Strike counter (module-level, persists for isolate lifetime):
//   scanner UA = +1 strike, injection = +2 strikes, 3 strikes = ban 1h

import type { MiddlewareHandler } from 'hono'
import { trackSecurityEvent, getSecEnv, getExecCtx } from './securityCollector'

// Known security scanner / automation tool UAs
const SCANNER_UA_RE = /nikto|sqlmap|masscan|burpsuite|nmap\b|nuclei|metasploit|zgrab|shodan|acunetix|nessus|openvas|dirbuster|gobuster|feroxbuster|wfuzz|zaproxy|appscan|webinspect|hydra\b|medusa\b|python-requests\/[0-9]|go-http-client\/[0-9]|libwww-perl|scrapy|mechanize|curl\/[0-7]\.|wget\//i

// Injection patterns checked against URL path + query string
const SQLI_RE      = /\b(union\b.{0,50}\bselect\b|drop\s+table\b|sleep\s*\(\d|exec\s*\(|xp_cmdshell|insert\s+into\b.{0,60}\bvalues\s*\(|delete\s+from\b|;\s*--\s)/i
const TRAVERSAL_RE = /\.\.(\/|%2f|%5c|%252f)|\/etc\/(passwd|shadow|hosts)|\/proc\/self|boot\.ini|win\.ini/i
const RCE_RE       = /(\$\{[^}]{0,60}\}|`[^`]{0,80}`|\beval\s*\(|\bsystem\s*\(|\bexec\s*\(|passthru\s*\(|shell_exec\s*\(|\bpopen\s*\()/i
const XSS_RE       = /(<script[\s/>]|javascript\s*:|on\w{2,30}\s*=|<iframe[\s/>]|<object[\s/>]|<embed[\s/>])/i

// Module-level state — persists for the lifetime of the CF Worker isolate
const strikes = new Map<string, number>()
const banned  = new Map<string, number>() // ip → ban expiry timestamp (ms)
let lastEvict = 0

function evict(now: number): void {
  if (now - lastEvict < 5 * 60_000) return
  lastEvict = now
  for (const [ip, exp] of banned) if (now > exp) { banned.delete(ip); strikes.delete(ip) }
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  )
}

export function isBanned(ip: string): boolean {
  const exp = banned.get(ip)
  if (exp === undefined) return false
  if (Date.now() > exp) { banned.delete(ip); strikes.delete(ip); return false }
  return true
}

export function banIp(ip: string, durationMs = 3_600_000): void {
  banned.set(ip, Date.now() + durationMs)
  strikes.delete(ip)
}

function addStrike(ip: string, points: number): void {
  const total = (strikes.get(ip) ?? 0) + points
  if (total >= 3) { banIp(ip); return }
  strikes.set(ip, total)
}

export const threatDetector: MiddlewareHandler = async (c, next) => {
  const now = Date.now()
  evict(now)

  const ip = getClientIp(c.req.raw)
  if (isBanned(ip)) return c.json({ message: 'Not found' }, 404)

  const ua = c.req.header('user-agent') ?? ''
  if (SCANNER_UA_RE.test(ua)) {
    addStrike(ip, 1)
    trackSecurityEvent('scanner_ua', 'high', { ip, ua: ua.slice(0, 120), path: c.req.path }, getSecEnv(c), getExecCtx(c))
    return c.json({ message: 'Not found' }, 404)
  }

  // Check path + query string for injection signatures
  let urlTail: string
  try { const u = new URL(c.req.url); urlTail = u.pathname + u.search }
  catch { urlTail = c.req.url }

  const which =
    SQLI_RE.test(urlTail)      ? 'sqli' :
    TRAVERSAL_RE.test(urlTail) ? 'traversal' :
    RCE_RE.test(urlTail)       ? 'rce' :
    XSS_RE.test(urlTail)       ? 'xss' : null

  if (which) {
    addStrike(ip, 2)
    trackSecurityEvent(`injection_${which}`, 'critical', { ip, path: urlTail.slice(0, 200) }, getSecEnv(c), getExecCtx(c))
    return c.json({ message: 'Not found' }, 404)
  }

  return next()
}
