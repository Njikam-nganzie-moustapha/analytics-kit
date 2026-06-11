> IMPORTANT: Lis ce fichier EN ENTIER avant de répondre. Il contient l'état exact du projet et tes instructions prioritaires.

---

# analytics-kit — État du Projet

_Dernière session: 2026-06-11 (SESSION 30 — SPRINT 5–6: FEEDBACK WIDGET + ALERT RULES UI + SAVED VIEWS)_

---

## ÉTAT ACTUEL — TOUT EST DÉPLOYÉ ✅

**analytics-kit** est un monorepo analytics complet pour la plateforme LIA. Feature superadmin uniquement — heatmaps, zones, sessions visiteurs, replay rrweb, error tracking.

### URLs de production

| Service | URL | Plateforme |
|---------|-----|-----------|
| **Collector** | `https://analytics-collector-lia.njikammoustapha67.workers.dev` | Cloudflare Workers |
| **Query API** | `https://analytics-query-lia.njikammoustapha67.workers.dev` | Cloudflare Workers |
| **Dashboard** | `https://analytics-kit-collector.vercel.app` | Vercel |
| **Processor** | GitHub Actions cron `*/5 * * * *` | GitHub Actions |
| **DB** | `https://n8n-mercleo.aws-ap-northeast-1.turso.io` | Turso (partagé) |
| **Repo** | `https://github.com/Njikam-nganzie-moustapha/analytics-kit` | GitHub (public) |

---

## STACK

| Composant | Tech | Port local |
|-----------|------|-----------|
| **collector** | Hono + Bun / Cloudflare Worker | 4210 |
| **processor** | Bun cron (`--once` en CI) | interne |
| **query-api** | Hono + Bun / Cloudflare Worker | 4211 |
| **dashboard** | React + Vite | 4212 |
| **sdk** | TypeScript vanilla | (npm package) |
| **storage** | TursoAdapter | (lib partagée) |
| **DB** | Turso (partagé avec LIA bot) | cloud |

---

## ARCHITECTURE

```
Browser (LIA frontend)
  └── tracker.ts (d:\n8n\saas\frontend\src\lib\tracker.ts)
        └── POST /e + X-Site-Key → collector Worker
                          └── TursoAdapter.write() → analytics_events table

processor (GitHub Actions cron */5 min, --once flag)
  └── analytics_events → heatmap_cells + zone_stats + sessions + error_groups

superadmin dashboard (Vercel) → query-api Worker
  └── /heatmap | /zones | /sessions | /errors | /replay/:sid
        └── Turso (tables agrégées)
```

---

## PACKAGES

### `packages/sdk/`
Tracker JS. **Note:** le LIA frontend utilise son propre `tracker.ts` à `d:\n8n\saas\frontend\src\lib\tracker.ts` — le SDK npm n'est pas encore installé.

Ce que le tracker track automatiquement :
- Page views (URL + referrer)
- Clics (coordonnées normalisées, selector CSS, zones)
- Scroll depth
- Sessions rrweb (enregistrement DOM complet)
- Web vitals (CLS, LCP, FID)
- Rage clicks + js_error + network_error

### `packages/storage/`
Adaptateur Turso partagé entre collector + processor.

**Table `analytics_events` :**
```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  sid TEXT NOT NULL,
  uid TEXT,
  type TEXT NOT NULL,   -- pageview|click|scroll|rrweb_chunk|zone_enter|zone_leave|js_error|network_error|...
  url TEXT,
  payload TEXT NOT NULL,  -- JSON complet de l'event SDK
  ts INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**Important — double wrapping replay:** Le payload stocké est le JSON complet de l'event SDK. Pour rrweb, il contient `.payload` = l'event rrweb réel. `query-api/src/turso.ts → getReplayEvents()` unwrappe `.payload ?? outer` avant de retourner.

### `packages/collector/`
Deux entry points :
- `src/index.ts` — serveur Bun (MemoryQueue + flush toutes les 5s, pour Docker local)
- `src/worker.ts` — Cloudflare Worker (écrit directement en Turso par request, pas de queue)

```
POST /e          ← events JSON. Auth: x-site-key header ou ?sk= query param
GET  /health     ← { ok: true, ts }
```

**Auth:** `SITE_KEYS` env var = clés comma-separated. `test-key` auto-ajouté si `NODE_ENV !== 'production'`.

**Env vars Cloudflare (secrets):**
```
TURSO_URL
TURSO_TOKEN
SITE_KEYS   ← valeur actuelle: voir GitHub secret ANALYTICS_SITE_KEY
```

### `packages/processor/`
Cron qui agrège `analytics_events` → tables résumées.

**Tables créées à la 1ère run :**
```
heatmap_cells   (site, url, gx, gy, count)
zone_stats      (site, url, zoneId, enters, clicks, totalDwell, samples)
sessions        (sid, site, uid, started, ended, duration, urlCount, eventCount, hasReplay)
error_groups    (fingerprint, site, message, eventType, count, firstSeen, lastSeen)
```

**Important:** Ces tables n'existent qu'après le 1er run du processor. Requêter avant = erreur "no such table".

**Flag `--once` :** single pass + `process.exit(0)` — requis pour GitHub Actions (sinon le job ne se termine jamais à cause de `setInterval`).

**Env vars (GitHub Secrets):**
```
TURSO_URL
TURSO_TOKEN
```

### `packages/query-api/`
Deux entry points :
- `src/index.ts` — serveur Bun (pour Docker local)
- `src/worker.ts` — Cloudflare Worker (prod)

```
GET /health
GET /auth                    ← { required: bool } — login form needed?
POST /auth                   ← { password } → { token } — échange password → API key
GET /heatmap?site=X&url=Y    ← { cells: [], meta: {} }
GET /zones?site=X&url=Y      ← { zones: [], meta: {} }
GET /sessions?site=X         ← { sessions: [], meta: {} } (params: from, to, limit, has_replay)
GET /replay/:sid             ← { events: [...rrweb_events unwrappés...] }
GET /errors?site=X           ← groupes d'erreurs fingerprinted
```

**Auth:** Header `X-Api-Key: <QUERY_API_KEY>` ou `?api_key=`. Vide = pas d'auth.

**Env vars Cloudflare (secrets):**
```
TURSO_URL
TURSO_TOKEN
QUERY_API_KEY   ← valeur: voir GitHub secret ANALYTICS_QUERY_API_KEY
```

### `packages/dashboard/`
React SPA — interface superadmin.

**Vercel config :**
- Project name: `analytics-kit-collector` (Vercel)
- Project ID: `prj_9zyDf6fyjaTEJOk84DlBlOgVW071`
- Org ID: `team_ZqGJWLThQUPafBQrpQnIS0r0`
- `rootDirectory`: `packages/dashboard` (configuré via Vercel API)
- `packages/dashboard/vercel.json`: SPA rewrites uniquement (Vite auto-détecté)

**Env vars Vercel (configurées) :**
```
VITE_QUERY_API_URL = https://analytics-query-lia.njikammoustapha67.workers.dev
VITE_API_KEY       = 916C30911E871973EF0A9EBF2661B635CF0C74A8F6A6202CD664754A5A44B4BE
```

---

## CI/CD PIPELINE (SESSION 28)

### `.github/workflows/ci.yml` — déclenché sur chaque push
| Job | Ce qu'il vérifie |
|-----|-----------------|
| `typecheck` | `tsc --noEmit` sur les 4 packages (storage, collector, query-api, processor) |
| `test` | 104 tests bun: processor (52), collector (26), query-api (26) |
| `build-dashboard` | Build Vite SPA complet |
| `wrangler-validate` | `wrangler deploy --dry-run` sur collector + query-api |

### `.github/workflows/deploy.yml` — déclenché quand CI passe sur `master`
| Job | Ce qu'il fait |
|-----|--------------|
| `check-ci` | Vérifie que CI = success avant de déployer |
| `deploy-workers` | `wrangler deploy` collector + query-api, set secrets, smoke test `/health` |
| `deploy-dashboard` | `vercel --prod` depuis la racine du repo, smoke test dashboard |

### Tests (`bun test`)
```
packages/processor/src/
  heatmap.test.ts    ← buildHeatmapCells, normalizeCells (17 tests)
  sessions.test.ts   ← buildSessionStats (13 tests)
  zones.test.ts      ← buildZoneStats (12 tests)
  errors.test.ts     ← buildErrorGroups, fingerprinting (13 tests)

packages/collector/src/
  queue/memory.test.ts  ← MemoryQueue push/drain/overflow/destroy (8 tests)
  app.test.ts           ← HTTP endpoints Hono (8 tests)
  worker.test.ts        ← Worker auth + payloads (10 tests)

packages/query-api/src/
  app.test.ts           ← Routes avec mock db (13 tests)
  worker.test.ts        ← Worker auth + password exchange + routes (13 tests)
```

Commande: `bun test packages/processor/src packages/collector/src packages/query-api/src`

---

## GITHUB SECRETS (tous configurés)

| Secret | Valeur |
|--------|--------|
| `TURSO_URL` | `https://n8n-mercleo.aws-ap-northeast-1.turso.io` |
| `TURSO_TOKEN` | token JWT Turso |
| `CLOUDFLARE_API_TOKEN` | OAuth token wrangler (**expire 2026-06-10 16:36 UTC — voir note ci-dessous**) |
| `CLOUDFLARE_ACCOUNT_ID` | `855bc055adac95b518886b9a45c24ca6` |
| `VERCEL_TOKEN` | token CLI Vercel |
| `VERCEL_ORG_ID` | `team_ZqGJWLThQUPafBQrpQnIS0r0` |
| `VERCEL_PROJECT_ID` | `prj_9zyDf6fyjaTEJOk84DlBlOgVW071` |
| `ANALYTICS_QUERY_API_KEY` | `916C30911E871973EF0A9EBF2661B635CF0C74A8F6A6202CD664754A5A44B4BE` |
| `ANALYTICS_SITE_KEY` | clé site collector prod |
| `VITE_QUERY_API_URL` | `https://analytics-query-lia.njikammoustapha67.workers.dev` |

### CLOUDFLARE_API_TOKEN — Renouvelé le 2026-06-11
Token permanent (`cfut_tSF…`) — expire le **2030-01-02**. Template "Edit Cloudflare Workers".
Renouvellement si besoin : `dash.cloudflare.com` → My Profile → API Tokens → "Edit Cloudflare Workers" template → `gh secret set CLOUDFLARE_API_TOKEN`

---

## INTÉGRATION LIA PLATFORM (d:/n8n)

### LIA Frontend — tracker déjà en place
Fichier: `d:\n8n\saas\frontend\src\lib\tracker.ts` — **déjà implémenté**.

Variables d'env:
```
# d:\n8n\saas\frontend\.env.local (dev)
VITE_ANALYTICS_URL=http://localhost:4210
VITE_ANALYTICS_SITE_KEY=lia-platform

# d:\n8n\saas\frontend\.env.production (prod)
VITE_ANALYTICS_URL=https://analytics-collector-lia.njikammoustapha67.workers.dev
VITE_ANALYTICS_SITE_KEY=lia-prod-key
```

### LIA Backend — module analytics
Fichier: `d:\n8n\saas\backend\src\modules\analytics\controller.ts`

**Env vars à ajouter dans `d:\n8n\saas\backend\.env` :**
```
ANALYTICS_QUERY_API_URL=https://analytics-query-lia.njikammoustapha67.workers.dev
ANALYTICS_QUERY_API_KEY=916C30911E871973EF0A9EBF2661B635CF0C74A8F6A6202CD664754A5A44B4BE
```

---

## FEATURES AJOUTÉES (sessions 29–30)

| Session | Feature | Détail |
|---------|---------|--------|
| 29 | OWASP hardening | CORS strict, security headers, site param validation, rate limiting |
| 29 | Cloudflare token renouvelé | Token permanent (`cfut_tSF…`) expire 2030-01-02 |
| 30 | Sprint 4 — Performance Tracing | `page_perf` table, EMA percentile blending, `PerformancePanel` |
| 30 | Sprint 5 — User Feedback Widget | `showReportDialog()` SDK, `user_feedback` table, `FeedbackList` tab (✦) |
| 30 | Sprint 6 — Alert Rules UI | `alert_rules` table, processor lit les règles DB, `AlertsTab` (⚑) |
| 30 | Sprint 6 — Saved Views | ⊕ bookmark header, chips localStorage (max 12, dedup), `applyView()` |

---

## BUGS CORRIGÉS (historique sessions 27–28)

| Session | Bug | Fix |
|---------|-----|-----|
| 27 | `npm not found` dans collector Dockerfile | Bun workspaces natifs — pas de npm |
| 27 | `Cannot find name 'fetch'` dans query-api TS | `"types": ["bun-types"]` dans tsconfig |
| 27 | Events rrweb double-wrappés dans replay | `query-api/src/turso.ts` unwrap `.payload` |
| 27 | processor bloque en GitHub Actions | Flag `--once` → single pass + `process.exit(0)` |
| 28 | Koyeb/Fly.io nécessitent carte bancaire | Migré vers Cloudflare Workers (gratuit) |
| 28 | `zlib` non résolvable dans Workers | Import direct `../../storage/src/turso` (pas du package index) |
| 28 | `pnpm-lock.yaml` stale sur Vercel | Supprimé, `installCommand: npm install` |
| 28 | Vercel déploie serverless au lieu de SPA | `rootDirectory: packages/dashboard` configuré via API Vercel |
| 28 | Deploy job path dupliqué (`dashboard/dashboard`) | `vercel --prod` depuis la racine du repo |
| 28 | `--reporter=verbose` non supporté par bun | Remplacé par `--reporter=dot` |
| 28 | `RequestInfo` non défini dans tests Worker | Cast `mock(...) as unknown as typeof fetch` |
| 28 | TURSO_URL secret vide → `fetch() URL is invalid` | Re-set correct depuis `credentials.txt` |

---

## DÉCISIONS TECHNIQUES

| # | Décision | Détail |
|---|----------|--------|
| A1 | Feature superadmin uniquement | Analytics visibles uniquement aux superadmins LIA |
| A2 | Repo séparé de `d:\n8n` | builds + déploiements indépendants |
| A3 | Turso partagé | Même DB que le bot. `analytics_events` + tables agrégées dans la même instance |
| A4 | Collector + Query-API = Cloudflare Workers | Pas de carte bancaire requise. 100k req/jour gratuit. Vérification faite — 100% free |
| A5 | Processor = GitHub Actions cron | Cron `*/5 * * * *`, flag `--once`, gratuit sur repo public |
| A6 | Dashboard = Vercel (SPA static) | React SPA buildée statiquement, CDN global |
| A7 | site ID = string libre | `site: 'lia-platform'` dans le SDK. Pas de registration |
| A8 | rrweb events unwrappés côté query-api | Double-wrapping intentionnel en storage — unwrap en sortie |
| A9 | Worker entry points séparés | `worker.ts` distinct de `index.ts` — pas de `process.env`, pas de `setInterval` |

---

## STRUCTURE FICHIERS

```
d:\analytics-kit\
├── .gitignore
├── package.json                            ← workspaces, scripts test:*
├── .github/
│   └── workflows/
│       ├── ci.yml                          ← typecheck + tests + build + wrangler dry-run
│       ├── deploy.yml                      ← deploy Workers + Vercel (après CI vert)
│       └── processor.yml                  ← cron */5 min bun --once
├── packages/
│   ├── sdk/src/
│   │   ├── index.ts, tracker.ts, recorder.ts, transport.ts
│   │   ├── mouse.ts, rage.ts, vitals.ts, errors.ts, breadcrumbs.ts
│   │   └── types.ts
│   ├── storage/src/
│   │   ├── turso.ts, types.ts, index.ts
│   │   ├── telegram.ts, clickhouse.ts, composite.ts
│   ├── collector/src/
│   │   ├── index.ts                        ← serveur Bun (Docker local)
│   │   ├── worker.ts                       ← Cloudflare Worker entry (prod)
│   │   ├── app.ts, decompress.ts
│   │   ├── routes/events.ts
│   │   ├── middleware/auth.ts, ratelimit.ts, filter.ts
│   │   ├── queue/memory.ts, redis.ts, types.ts
│   │   └── *.test.ts                       ← 26 tests
│   ├── processor/src/
│   │   ├── index.ts (--once flag), pipeline.ts, turso.ts, types.ts
│   │   ├── heatmap.ts, zones.ts, sessions.ts, errors.ts, alerts.ts
│   │   └── *.test.ts                       ← 52 tests
│   ├── query-api/src/
│   │   ├── index.ts                        ← serveur Bun (Docker local)
│   │   ├── worker.ts                       ← Cloudflare Worker entry (prod)
│   │   ├── app.ts, auth.ts, turso.ts
│   │   ├── routes/heatmap.ts, zones.ts, sessions.ts, replay.ts, errors.ts, cron.ts
│   │   └── *.test.ts                       ← 26 tests
│   └── dashboard/
│       ├── vercel.json                     ← rewrites SPA uniquement
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx, api.ts, types.ts, main.tsx
│           └── components/
│               ├── HeatmapOverlay.tsx, ZoneStats.tsx, ZonesTable.tsx
│               ├── SessionList.tsx, SessionsTable.tsx, ReplayModal.tsx
│               ├── ErrorList.tsx, LoginScreen.tsx, AnimatedNumber.tsx
│               ├── CronMonitors.tsx, ReleasesTab.tsx, SourceMapsTab.tsx
│               ├── VitalsPanel.tsx, OverviewPanel.tsx, PerformancePanel.tsx
│               ├── FeedbackList.tsx                 ← Sprint 5 (✦ tab)
│               └── AlertsTab.tsx                    ← Sprint 6 (⚑ tab)
```

---

## COMMANDES UTILES

```bash
# Tests locaux
bun test packages/processor/src packages/collector/src packages/query-api/src

# Tests par package
bun test packages/processor/src
bun test packages/collector/src
bun test packages/query-api/src

# Type check
cd packages/collector && bunx tsc --noEmit
cd packages/query-api && bunx tsc --noEmit

# Smoke tests prod
curl https://analytics-collector-lia.njikammoustapha67.workers.dev/health
curl https://analytics-query-lia.njikammoustapha67.workers.dev/health

# Envoyer un event test en prod
curl -X POST https://analytics-collector-lia.njikammoustapha67.workers.dev/e \
  -H "Content-Type: application/json" \
  -H "X-Site-Key: lia-prod-key" \
  -d '[{"t":1234567890,"type":"pageview","sid":"test-1","site":"lia-platform","url":"/dashboard"}]'

# Vérifier données dans Turso
curl https://n8n-mercleo.aws-ap-northeast-1.turso.io/v2/pipeline \
  -H "Authorization: Bearer <TURSO_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"requests":[{"type":"execute","stmt":{"sql":"SELECT COUNT(*) FROM analytics_events"}},{"type":"close"}]}'

# Forcer un run processor
gh workflow run processor.yml --repo Njikam-nganzie-moustapha/analytics-kit

# Déployer manuellement (depuis d:\analytics-kit\packages\dashboard)
vercel --prod --yes

# Stack locale (Docker)
cd d:\n8n
docker compose up -d analytics-collector analytics-query-api analytics-processor analytics-dashboard
```

---

## RESTE À FAIRE

### Ops / intégration LIA
- [ ] Mettre à jour `d:\n8n\saas\backend\.env` : ajouter `ANALYTICS_QUERY_API_URL` + `ANALYTICS_QUERY_API_KEY`
- [ ] Rebuild + redeploy LIA backend pour activer le proxy analytics
- [ ] Vérifier que les events arrivent dans Turso (envoyer event test + SELECT COUNT(*) FROM analytics_events)
- [ ] Attendre 5 min → vérifier que les tables agrégées sont créées par le processor
- [ ] Ouvrir `https://analytics-kit-collector.vercel.app` → saisir `lia-platform` → vérifier les données

### Features (~1% Sentry parity restant)
- [ ] Alert notification channels UI — configurer Telegram/Slack webhooks depuis le dashboard (actuellement env vars only sur le processor)
