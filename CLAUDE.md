> IMPORTANT: Lis ce fichier EN ENTIER avant de répondre. Il contient l'état exact du projet et tes instructions prioritaires.

---

# analytics-kit — État du Projet

_Dernière session: 2026-06-09 (SESSION 27 — GITHUB REPO + HOSTING SETUP)_

---

## SESSION 27 — GITHUB REPO + HOSTING SETUP (2026-06-09)

### Ce qui a été buildé (sessions précédentes + session 27)

**analytics-kit** est un monorepo analytics complet construit pour la plateforme LIA. Feature superadmin uniquement — heatmaps, zones, sessions visiteurs, replay rrweb.

---

## STACK

| Composant | Tech | Port local |
|-----------|------|-----------|
| **collector** | Hono + Bun | 4210 |
| **processor** | Bun cron | interne |
| **query-api** | Hono + Bun | 4211 |
| **dashboard** | React + Vite | 4212 |
| **sdk** | TypeScript vanilla | (npm package) |
| **storage** | TursoAdapter | (lib partagée) |
| **DB** | Turso (partagé avec LIA bot) | cloud |

---

## ARCHITECTURE

```
Browser (LIA frontend)
  └── @analytics-kit/sdk
        └── POST /e → collector:4210
                          └── TursoAdapter → analytics_events table

processor (cron toutes les 5 min)
  └── analytics_events → heatmap_cells + zone_stats + sessions

superadmin dashboard :4212 → query-api:4211
  └── /heatmap | /zones | /sessions | /replay/:sid
        └── Turso (heatmap_cells, zone_stats, sessions)

LIA backend (saas-backend:4000)
  └── /api/admin/analytics/* → proxy → query-api
        └── Auth: requireAuth + superAdminOnly + X-Api-Key
```

---

## PACKAGES

### `packages/sdk/`
Tracker JS injecté dans les frontends clients.

```typescript
import { createTracker } from '@analytics-kit/sdk'

createTracker({
  collectorUrl: 'https://<collector>.koyeb.app',
  site: 'lia-platform',   // ID site — apparaît dans le dashboard
  uid: user?.id,          // optionnel — user connecté
})
```

Ce que le SDK track automatiquement :
- Page views (avec URL + referrer)
- Clics (coordonnées normalisées, selector CSS)
- Scroll depth
- Sessions rrweb (enregistrement DOM complet)
- Web vitals (CLS, LCP, FID)
- Rage clicks (détection frustration)

### `packages/storage/`
Adaptateur Turso partagé entre collector + processor.

```typescript
class TursoAdapter {
  async init()      // CREATE TABLE IF NOT EXISTS analytics_events
  async insert(event) // INSERT INTO analytics_events
  async query(sql, args)
}
```

**Table `analytics_events` (créée par collector au démarrage):**
```sql
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,
  sid TEXT NOT NULL,       -- session ID
  uid TEXT,                -- user ID si fourni
  type TEXT NOT NULL,      -- pageview | click | scroll | rrweb_chunk | ...
  url TEXT,
  payload TEXT NOT NULL,   -- JSON complet de l'event
  ts INTEGER NOT NULL,     -- timestamp ms
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

**Important — double wrapping:** Le payload stocké est le JSON COMPLET de l'event SDK :
```json
{ "t": 1234, "type": "rrweb_chunk", "sid": "...", "site": "...", "payload": <rrweb_event> }
```
Le query-api doit unwrapper `.payload` avant de retourner à rrweb Replayer.
Voir: `packages/query-api/src/turso.ts` → `getReplayEvents()` → `outer.payload ?? outer`

### `packages/collector/`
Hono HTTP server — reçoit les events du SDK.

```
POST /e          ← events (JSON ou gzip)
GET  /health     ← { ok: true, ts, queued }
```

**Env vars:**
```
STORAGE_BACKEND=turso   (ou noop | telegram | clickhouse | composite)
TURSO_URL=https://n8n-mercleo.aws-ap-northeast-1.turso.io
TURSO_TOKEN=<token>
PORT=4210
```

### `packages/processor/`
Cron qui agrège `analytics_events` → tables résumées.

**Tables créées par le processor (1ère run) :**
```sql
heatmap_cells (site, url, x REAL, y REAL, count INT, ...)
zone_stats    (site, url, selector, clicks, scroll_depth_avg, ...)
sessions      (sid, site, uid, start_ts, end_ts, page_count, event_count, ...)
```

**Important:** Ces tables n'existent qu'après le 1er run du processor (~5 min après démarrage). Requêter avant → erreur Turso "no such table".

**Flag `--once` (SESSION 27):**
```bash
bun run src/index.ts --once   # single pass + exit (pour GitHub Actions)
bun run src/index.ts          # loop toutes les 300s (pour Docker)
```

**Env vars:**
```
TURSO_URL=...
TURSO_TOKEN=...
PROCESSOR_INTERVAL_MS=30000   # optionnel, défaut 300000ms (5 min)
```

### `packages/query-api/`
Hono HTTP server — sert les données agrégées.

```
GET /health                              ← { ok: true }
GET /heatmap?site=X&url=Y               ← { cells: [], meta: {} }
GET /zones?site=X&url=Y                 ← { zones: [], meta: {} }
GET /sessions?site=X&limit=N            ← { sessions: [], meta: {} }
GET /replay/:sid                        ← { events: [...rrweb_events...] }
```

**Auth:** Header `X-Api-Key: <QUERY_API_KEY>`. Si vide → pas d'auth (dev local).

**Env vars:**
```
TURSO_URL=...
TURSO_TOKEN=...
QUERY_API_KEY=<64-char-hex>    # doit matcher ANALYTICS_QUERY_API_KEY du backend LIA
PORT=4211
```

### `packages/dashboard/`
React SPA — interface superadmin.

**Fonctionnalités:**
- Header: input `site ID` + `/url` optionnel + bouton Load
- Tabs: Heatmap | Zones | Sessions
- Heatmap: canvas SVG avec overlay points rouges → oranges → verts
- Zones: tableau trié (clicks, scroll depth, engagement)
- Sessions: liste avec durée, pages vues, bouton Replay
- Replay modal: player rrweb full-featured
  - Play/pause, speeds 0.5×/1×/2×/4×
  - Scrubber range, timer MM:SS
  - Keyboard: Space=play/pause, Esc=close, ←→=±5s
  - Auto-scale iframe selon container

**Config (env vars Vite):**
```
VITE_QUERY_API_URL=http://localhost:4211   (dev) ou https://<koyeb>.koyeb.app (prod)
VITE_API_KEY=                              (vide en dev, clé en prod)
```

**Vercel config** (`packages/dashboard/vercel.json`) :
```json
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
```

---

## INTÉGRATION LIA PLATFORM (d:/n8n)

### LIA Backend — module analytics

Fichier: `d:\n8n\saas\backend\src\modules\analytics\controller.ts`

```typescript
// Auth chain: requireAuth + superAdminOnly → proxy → query-api
// Endpoints exposés:
GET /api/admin/analytics/heatmap?site&url
GET /api/admin/analytics/zones?site&url
GET /api/admin/analytics/sessions?site
GET /api/admin/analytics/replay/:sid
GET /api/admin/analytics/behavior?instance    ← direct Turso (6 agrégats)
GET /api/admin/analytics/stats?site           ← direct Turso
```

**Env vars à ajouter dans `d:\n8n\saas\backend\.env`:**
```
ANALYTICS_QUERY_API_URL=https://<koyeb-query-api>.koyeb.app
ANALYTICS_QUERY_API_KEY=<64-char-hex>
```

### LIA Frontend — SDK init

À ajouter dans `d:\n8n\saas\frontend\src\main.tsx` :
```typescript
import { createTracker } from '@analytics-kit/sdk'
createTracker({
  collectorUrl: import.meta.env.VITE_ANALYTICS_COLLECTOR_URL,
  site: 'lia-platform',
})
```

À ajouter dans `d:\n8n\saas\frontend\.env.local` :
```
VITE_ANALYTICS_COLLECTOR_URL=https://<koyeb-collector>.koyeb.app
```

---

## HOSTING (PLAN VALIDÉ — DÉPLOIEMENT EN COURS)

| Service | Plateforme | Cost | Status |
|---------|-----------|------|--------|
| Dashboard | **Vercel** | Gratuit | `vercel.json` créé — à déployer |
| Collector | **Koyeb** | Gratuit (always-on) | Dockerfile ok — à déployer |
| Query API | **Koyeb** | Gratuit (always-on) | Dockerfile fixé — à déployer |
| Processor | **GitHub Actions** | Gratuit (public repo) | `.github/workflows/processor.yml` — activer après push |
| DB | **Turso** (existant) | Gratuit | Partage DB du bot |

### Steps restants

```bash
# 1. Authentifier GitHub CLI
gh auth login

# 2. Créer le repo et pousser
cd d:\analytics-kit
gh repo create analytics-kit --public --source=. --remote=origin --push

# 3. GitHub Secrets (Settings → Secrets → Actions)
#    TURSO_URL   = https://n8n-mercleo.aws-ap-northeast-1.turso.io
#    TURSO_TOKEN = eyJhbGciOiJFZERTQSIs...

# 4. Vercel — importer le repo GitHub
#    Root directory: packages/dashboard
#    Build: bun run build
#    Env: VITE_QUERY_API_URL + VITE_API_KEY

# 5. Koyeb — 2 services depuis GitHub
#    Collector: Dockerfile packages/collector/Dockerfile, port 4210
#              Env: STORAGE_BACKEND=turso, TURSO_URL, TURSO_TOKEN
#    Query API: Dockerfile packages/query-api/Dockerfile, port 4211
#              Env: TURSO_URL, TURSO_TOKEN, QUERY_API_KEY

# 6. Mettre à jour LIA frontend + backend avec les URLs Koyeb
```

---

## BUGS CORRIGÉS (historique)

| Session | Bug | Fix |
|---------|-----|-----|
| 27 | `npm not found` dans collector Dockerfile | Bun workspaces natifs — copier root `package.json` + `packages/storage` |
| 27 | Build context `./analytics-kit` introuvable | `../analytics-kit` dans `d:\n8n\docker-compose.yml` |
| 27 | `--frozen-lockfile` échoue (pas de lockfile) | Supprimé le flag |
| 27 | `Cannot find name 'fetch'` dans query-api TS | `"types": ["bun-types"]` dans `tsconfig.json` |
| 27 | `Property 'env' does not exist on ImportMeta` | Créé `packages/dashboard/src/vite-env.d.ts` |
| 27 | Events rrweb double-wrappés dans replay | `query-api/src/turso.ts` unwrap `.payload` avant retour |
| 27 | query-api Dockerfile manque `packages/storage` | Dockerfile refait comme collector (workspace complet) |
| 27 | processor bloque en GitHub Actions (setInterval) | Ajout flag `--once` → single pass + `process.exit(0)` |
| 27 | `process` non reconnu dans processor tsconfig | `"types": ["bun-types"]` dans `packages/processor/tsconfig.json` |

---

## DÉCISIONS TECHNIQUES

| # | Décision | Détail |
|---|----------|--------|
| A1 | Feature superadmin uniquement | Analytics visibles uniquement aux superadmins LIA. 3-layer auth: JWT → X-Api-Key → Turso |
| A2 | Repo séparé de `d:\n8n` | analytics-kit à `d:\analytics-kit` — builds + déploiements indépendants |
| A3 | Turso partagé | Même DB que le bot Moustapha. `analytics_events` + tables agrégées dans la même instance |
| A4 | query-api jamais exposé publiquement | `127.0.0.1:4211` local. En prod: URL Koyeb, appelée uniquement par le backend LIA |
| A5 | Processor = GitHub Actions cron | Pas de container persistant pour le processor — GitHub Actions free cron `*/5 * * * *` |
| A6 | Dashboard = Vercel (SPA static) | React SPA buildée statiquement, aucun serveur, CDN global |
| A7 | site ID = string libre | Le SDK envoie `site: 'lia-platform'`. Le dashboard filtre par ce string. Pas de registration nécessaire |
| A8 | rrweb events unwrappés côté query-api | Storage double-wrapping intentionnel (enveloppe analytics + event rrweb) — unwrap en sortie |

---

## STRUCTURE FICHIERS

```
d:\analytics-kit\
├── .gitignore                              ← node_modules/, .env, dist/, bun.lockb
├── .env.example                            ← template env vars
├── docker-compose.yml                      ← stack locale (collector+processor+query-api+dashboard)
├── package.json                            ← workspaces: ["packages/*"]
├── .github/
│   └── workflows/
│       └── processor.yml                  ← GitHub Actions cron */5 min --once
├── packages/
│   ├── sdk/
│   │   └── src/
│   │       ├── index.ts                   ← createTracker() export
│   │       ├── tracker.ts                 ← TrackerConfig + init
│   │       ├── recorder.ts                ← rrweb integration
│   │       ├── transport.ts               ← POST /e
│   │       ├── mouse.ts                   ← click tracking
│   │       ├── rage.ts                    ← rage click detection
│   │       └── vitals.ts                  ← CLS/LCP/FID
│   ├── storage/
│   │   └── src/
│   │       ├── index.ts                   ← StorageBackend interface + factory
│   │       ├── turso.ts                   ← TursoAdapter (analytics_events)
│   │       ├── telegram.ts                ← TelegramAdapter (optionnel)
│   │       ├── clickhouse.ts              ← ClickhouseAdapter (optionnel)
│   │       └── composite.ts               ← fan-out vers plusieurs backends
│   ├── collector/
│   │   ├── Dockerfile                     ← bun workspaces (copie storage + collector)
│   │   └── src/
│   │       ├── index.ts                   ← env + server init
│   │       ├── app.ts                     ← Hono app + routes
│   │       ├── routes/events.ts           ← POST /e handler
│   │       └── middleware/
│   │           ├── auth.ts                ← COLLECTOR_API_KEY optionnel
│   │           └── ratelimit.ts           ← rate limiting par IP
│   ├── processor/
│   │   ├── Dockerfile                     ← bun workspaces
│   │   └── src/
│   │       ├── index.ts                   ← entry point + --once flag
│   │       ├── pipeline.ts                ← orchestrateur
│   │       ├── heatmap.ts                 ← agrégation heatmap_cells
│   │       ├── zones.ts                   ← agrégation zone_stats
│   │       ├── sessions.ts                ← agrégation sessions
│   │       ├── turso.ts                   ← ProcessorTurso + ensureSchema()
│   │       └── types.ts
│   ├── query-api/
│   │   ├── Dockerfile                     ← bun workspaces (copie storage + query-api)
│   │   └── src/
│   │       ├── index.ts                   ← env + server init
│   │       ├── app.ts                     ← Hono app
│   │       ├── auth.ts                    ← X-Api-Key middleware
│   │       ├── turso.ts                   ← QueryTurso + getReplayEvents (unwrap)
│   │       └── routes/
│   │           ├── heatmap.ts
│   │           ├── zones.ts
│   │           ├── sessions.ts
│   │           └── replay.ts
│   └── dashboard/
│       ├── Dockerfile                     ← node build → nginx serve
│       ├── vercel.json                    ← SPA rewrites
│       ├── vite.config.ts
│       └── src/
│           ├── App.tsx                    ← tabs + load/query state
│           ├── api.ts                     ← fetchHeatmap/Zones/Sessions/Replay
│           ├── types.ts                   ← HeatmapCell, ZoneRow, SessionRow, ReplayEvent
│           ├── index.css                  ← dark theme complet
│           ├── vite-env.d.ts              ← reference types vite/client
│           └── components/
│               ├── HeatmapOverlay.tsx     ← canvas SVG + dots colorés
│               ├── ZoneStats.tsx          ← tableau trié cliquable
│               ├── SessionList.tsx        ← liste + bouton Replay
│               └── ReplayModal.tsx        ← player rrweb full-featured
```

---

## COMMANDES UTILES

```bash
# Démarrer la stack locale
cd d:\n8n
docker compose up -d analytics-collector analytics-query-api analytics-processor analytics-dashboard

# Vérifier
curl http://localhost:4210/health    # collector
curl http://localhost:4211/health    # query-api
curl "http://localhost:4211/heatmap?site=lia-platform"  # données

# Dashboard
http://localhost:4212               # ouvrir dans le navigateur
# → saisir "lia-platform" comme site ID → Load

# Logs
docker logs analytics-collector --tail 20
docker logs analytics-query-api --tail 20

# Test envoi d'un event manuel
curl -X POST http://localhost:4210/e \
  -H "Content-Type: application/json" \
  -d '{"t":1234567890,"type":"pageview","sid":"test-session-1","site":"lia-platform","payload":{"url":"/dashboard"}}'

# Push vers GitHub (après gh auth login)
cd d:\analytics-kit
gh repo create analytics-kit --public --source=. --remote=origin --push
```

---

## RESTE À FAIRE

- [ ] `gh auth login` + push GitHub
- [ ] GitHub Secrets: `TURSO_URL` + `TURSO_TOKEN`
- [ ] Déployer dashboard sur Vercel
- [ ] Déployer collector sur Koyeb (port 4210)
- [ ] Déployer query-api sur Koyeb (port 4211)
- [ ] Mettre à jour `saas/frontend/src/main.tsx` — ajouter SDK init
- [ ] Mettre à jour `saas/frontend/.env.local` — `VITE_ANALYTICS_COLLECTOR_URL`
- [ ] Mettre à jour `saas/backend/.env` — `ANALYTICS_QUERY_API_URL` + `ANALYTICS_QUERY_API_KEY`
- [ ] Rebuild + redeploy LIA frontend + backend
- [ ] Vérifier que les events arrivent dans Turso après déploiement
- [ ] Attendre ~5 min → vérifier que les tables agrégées sont créées
- [ ] Ouvrir le dashboard Vercel → saisir `lia-platform` → voir les données
