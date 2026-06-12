// Fast, dependency-free per-page SEO audit. The page HTML is fetched once and
// scanned in a single pass of small regexes — no DOM, no external service — so
// it runs in well under a millisecond on a Worker.

export type CheckStatus = 'pass' | 'warn' | 'fail'
export interface SeoCheck { id: string; label: string; status: CheckStatus; detail: string; fix?: string; weight: number }
export interface SeoReport {
  url: string
  score: number          // 0–100, weighted
  title: string | null
  description: string | null
  checks: SeoCheck[]
}

function metaContent(html: string, key: 'name' | 'property', value: string): string | null {
  // <meta name="description" content="...">  (attr order-agnostic)
  const re = new RegExp(`<meta[^>]+${key}=["']${value}["'][^>]*>`, 'i')
  const tag = re.exec(html)?.[0]
  if (!tag) {
    // try reversed order: content before name/property
    const re2 = new RegExp(`<meta[^>]*${key}=["']${value}["'][^>]*>`, 'i')
    const t2 = re2.exec(html)?.[0]
    if (!t2) return null
    return /content=["']([^"']*)["']/i.exec(t2)?.[1] ?? null
  }
  return /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? null
}

function countMatches(html: string, re: RegExp): number {
  return (html.match(re) ?? []).length
}

export function auditHtml(html: string, url: string): SeoReport {
  const checks: SeoCheck[] = []
  const add = (id: string, label: string, status: CheckStatus, detail: string, weight: number, fix?: string) =>
    checks.push({ id, label, status, detail, fix, weight })

  // Title
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').trim() || null
  if (!title) add('title', 'Title tag', 'fail', 'No <title> found.', 3, 'Add a concise, descriptive <title>.')
  else if (title.length < 10 || title.length > 60) add('title', 'Title tag', 'warn', `Title is ${title.length} chars (ideal 10–60).`, 3, 'Aim for 50–60 characters with the primary keyword first.')
  else add('title', 'Title tag', 'pass', `“${title}” (${title.length} chars).`, 3)

  // Meta description
  const desc = metaContent(html, 'name', 'description')
  if (!desc) add('description', 'Meta description', 'fail', 'No meta description.', 3, 'Add a 50–160 char summary — it shows in search results.')
  else if (desc.length < 50 || desc.length > 160) add('description', 'Meta description', 'warn', `Description is ${desc.length} chars (ideal 50–160).`, 3, 'Rewrite to 50–160 characters.')
  else add('description', 'Meta description', 'pass', `${desc.length} characters.`, 3)

  // H1
  const h1 = countMatches(html, /<h1[\s>]/gi)
  if (h1 === 0) add('h1', 'H1 heading', 'fail', 'No <h1> on the page.', 2, 'Add exactly one <h1> describing the page.')
  else if (h1 > 1) add('h1', 'H1 heading', 'warn', `${h1} <h1> tags — use one per page.`, 2, 'Keep a single <h1>; use <h2>–<h6> for sub-sections.')
  else add('h1', 'H1 heading', 'pass', 'Exactly one <h1>.', 2)

  // Canonical
  const canonical = /<link[^>]+rel=["']canonical["'][^>]*>/i.test(html)
  add('canonical', 'Canonical URL', canonical ? 'pass' : 'warn', canonical ? 'Canonical link present.' : 'No canonical link.', 1, canonical ? undefined : 'Add <link rel="canonical"> to avoid duplicate-content issues.')

  // Viewport
  const viewport = !!metaContent(html, 'name', 'viewport')
  add('viewport', 'Mobile viewport', viewport ? 'pass' : 'fail', viewport ? 'Viewport meta set.' : 'No viewport meta — page is not mobile-optimised.', 2, viewport ? undefined : 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.')

  // lang
  const lang = /<html[^>]+lang=["'][^"']+["']/i.test(html)
  add('lang', 'Language attribute', lang ? 'pass' : 'warn', lang ? '<html lang> set.' : 'No lang attribute on <html>.', 1, lang ? undefined : 'Add lang="en" (or your language) to <html>.')

  // Open Graph
  const ogTitle = !!metaContent(html, 'property', 'og:title')
  const ogImage = !!metaContent(html, 'property', 'og:image')
  add('og', 'Open Graph tags', ogTitle && ogImage ? 'pass' : ogTitle || ogImage ? 'warn' : 'fail',
    ogTitle && ogImage ? 'og:title and og:image present.' : 'Missing Open Graph tags — poor link previews on social.', 1,
    ogTitle && ogImage ? undefined : 'Add og:title, og:description and og:image.')

  // Twitter card
  const twitter = !!metaContent(html, 'name', 'twitter:card')
  add('twitter', 'Twitter card', twitter ? 'pass' : 'warn', twitter ? 'Twitter card set.' : 'No twitter:card meta.', 1, twitter ? undefined : 'Add <meta name="twitter:card" content="summary_large_image">.')

  // Image alt coverage
  const imgs = countMatches(html, /<img[\s>]/gi)
  const imgsWithAlt = countMatches(html, /<img[^>]+alt=["'][^"']*["'][^>]*>/gi)
  if (imgs === 0) add('alt', 'Image alt text', 'pass', 'No images to check.', 1)
  else {
    const pct = Math.round((imgsWithAlt / imgs) * 100)
    add('alt', 'Image alt text', pct >= 90 ? 'pass' : pct >= 50 ? 'warn' : 'fail', `${imgsWithAlt}/${imgs} images have alt text (${pct}%).`, 2, pct >= 90 ? undefined : 'Add descriptive alt text to images for accessibility and SEO.')
  }

  // robots noindex
  const robots = metaContent(html, 'name', 'robots') ?? ''
  const noindex = /noindex/i.test(robots)
  add('robots', 'Indexable', noindex ? 'fail' : 'pass', noindex ? 'Page is set to noindex — search engines will skip it.' : 'Page is indexable.', 2, noindex ? 'Remove noindex if this page should rank.' : undefined)

  // Structured data
  const ld = /<script[^>]+type=["']application\/ld\+json["']/i.test(html)
  add('schema', 'Structured data', ld ? 'pass' : 'warn', ld ? 'JSON-LD structured data found.' : 'No structured data (JSON-LD).', 1, ld ? undefined : 'Add schema.org JSON-LD for rich results.')

  // HTTPS
  const https = /^https:/i.test(url)
  add('https', 'HTTPS', https ? 'pass' : 'fail', https ? 'Served over HTTPS.' : 'Not HTTPS.', 2, https ? undefined : 'Serve the page over HTTPS.')

  // Content length (rough word count of visible text)
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = text ? text.split(' ').length : 0
  add('content', 'Content depth', words >= 300 ? 'pass' : words >= 100 ? 'warn' : 'fail', `~${words.toLocaleString()} words of text.`, 1, words >= 300 ? undefined : 'Thin pages rank poorly — aim for 300+ words of useful content.')

  const maxScore = checks.reduce((a, c) => a + c.weight, 0) || 1
  const got = checks.reduce((a, c) => a + c.weight * (c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0), 0)
  const score = Math.round((got / maxScore) * 100)

  return { url, score, title, description: desc, checks }
}
