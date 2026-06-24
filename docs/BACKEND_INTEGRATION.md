# Backend integration — secure data fetching & AI-crawler detection

How to read analytics-kit data from a backend **securely** (server-to-server), and how
to feed it the AI/LLM-crawler traffic that a client-side tracker can't see.

> Golden rule: the **query-api key never reaches the browser**. The browser talks to
> *your* backend; your backend talks to the analytics query-api with the key in a
> header. A key in front-end JS or in a `?api_key=` query string is a leak.

---

## 1. Environment variables (backend only)

```bash
# Read side — query-api (Cloudflare Worker)
ANALYTICS_QUERY_API_URL=https://analytics-query-lia.<acct>.workers.dev
ANALYTICS_QUERY_API_KEY=<the 64-char query key>   # header-only, server-side only

# Write side — collector (for the AI-crawler beacon)
ANALYTICS_COLLECTOR_URL=https://analytics-collector-lia.<acct>.workers.dev
ANALYTICS_SITE_KEY=<collector site key>            # same key the tracker uses
ANALYTICS_SITE=lia-platform                        # your site id
```

The query-api enforces **header-only** auth in production (`X-Api-Key`); `?api_key=`
is rejected unless `ALLOW_QUERY_KEY=1`. Keep CORS (`CORS_ORIGINS`) restricted to your
dashboard origin so browsers can't read the API directly even if a token leaks.

---

## 2. Secure fetch client — `src/lib/analyticsClient.ts`

A ready-to-use, fail-soft client (timeouts, header-only key, fixed site). Drop it in
and import `analytics`:

```ts
import { analytics } from '../lib/analyticsClient'

const { summary, sites } = await analytics.overview()  // health score + KPIs
const aiCrawlers         = await analytics.aiBots()     // [{ bot:'GPTBot…', hits }]
const calendar           = await analytics.activity(365)// GitHub-style daily counts
const live               = await analytics.realtime()   // visitors in last 5 min
```

### Expose it to the superadmin frontend via your own backend (key stays server-side)

```ts
// src/modules/analytics/routes.ts
import { Router } from 'express'
import { analytics } from '../../lib/analyticsClient'
import { adminOnly } from '../../middleware/adminOnly'   // your existing guard

export const analyticsRouter = Router()

analyticsRouter.get('/overview', adminOnly, async (_req, res) => {
  res.json(await analytics.overview())
})
analyticsRouter.get('/ai-crawlers', adminOnly, async (_req, res) => {
  res.json({ bots: await analytics.aiBots() })
})
analyticsRouter.get('/activity', adminOnly, async (req, res) => {
  const days = Math.min(parseInt(String(req.query.days ?? '365')) || 365, 366)
  res.json({ days: await analytics.activity(days) })
})
```

```ts
// app.ts
app.use('/api/admin/analytics', analyticsRouter)
```

The browser now calls `GET /api/admin/analytics/overview` (cookie-authenticated,
admin-gated) — and never sees `ANALYTICS_QUERY_API_KEY`.

### Raw call (if you don't want the client)

```ts
const res = await fetch(`${process.env.ANALYTICS_QUERY_API_URL}/bots?site=lia-platform`, {
  headers: { 'X-Api-Key': process.env.ANALYTICS_QUERY_API_KEY! },  // header — never ?api_key=
  signal: AbortSignal.timeout(8000),
})
const { bots } = await res.json()
```

---

## 3. AI / LLM crawler detection (server-side)

LLM crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider…)
**don't run JS**, so the client tracker never sees them. Detect them at the origin and
beacon to the collector's `/bot` endpoint; the processor aggregates them into `ai_bots`
and they show up under **Audience → AI crawlers**.

### a) Express middleware — `src/middleware/aiCrawlerBeacon.ts`

```ts
import { aiCrawlerBeacon, crawlBeaconHandler } from './middleware/aiCrawlerBeacon'

app.use(cors(...))
app.all('/api/_crawl', crawlBeaconHandler)  // nginx mirror target (before rate limiter)
app.use(aiCrawlerBeacon)                    // catches crawlers hitting the API directly
```

### b) nginx — mirror static page requests to the beacon

Static pages are served by nginx, not Express, so mirror them (async, never affects the
client response):

```nginx
location / {
    mirror /_crawlbeacon;            # async copy → beacon
    try_files $uri $uri/ /index.html;
}
location = /_crawlbeacon {
    internal;
    proxy_pass       http://saas-backend:4002/api/_crawl;
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header User-Agent     $http_user_agent;
}
```

The beacon is fire-and-forget, throttled (1/bot/path/10s), and only POSTs for recognised
AI-crawler UAs — zero added latency for real users.

---

## 4. Endpoint reference (all require `X-Api-Key`, all take `?site=`)

| Endpoint | Returns |
|---|---|
| `/overview` | health score 0–100, KPIs + deltas, daily series, all sites |
| `/activity?days=365` | daily session counts (contribution graph) |
| `/traffic` | channels (incl. `ai` referrals) + UTM |
| `/geo` · `/devices` · `/screen-stats` | audience breakdowns |
| `/conversions` | phone / email / form |
| `/bots` | AI/LLM crawlers + other bots |
| `/realtime` | visitors in last 5 min |
| `/pages` | per-page views/entries/exits/bounce |
| `/sessions` · `/replay/:sid` · `/errors` | sessions, replay, error groups |
| `/funnels` (+ POST/PUT/DELETE, `/funnels/compute`) | funnel defs & computation |

All fail soft in `analyticsClient` (return empty/zero) so a slow or down analytics API
never breaks the host app.
