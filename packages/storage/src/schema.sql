-- analytics_events: one row per event, full JSON payload for flexibility
CREATE TABLE IF NOT EXISTS analytics_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  t         INTEGER NOT NULL,
  type      TEXT    NOT NULL,
  sid       TEXT    NOT NULL,
  site      TEXT    NOT NULL,
  uid       TEXT,
  payload   TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ae_site_t  ON analytics_events (site, t DESC);
CREATE INDEX IF NOT EXISTS idx_ae_sid     ON analytics_events (sid);
CREATE INDEX IF NOT EXISTS idx_ae_type    ON analytics_events (site, type, t DESC);

-- heatmap_cells: pre-aggregated per (url, 10px cell) — filled by processor (S3)
CREATE TABLE IF NOT EXISTS heatmap_cells (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  site      TEXT    NOT NULL,
  url       TEXT    NOT NULL,
  gx        INTEGER NOT NULL,
  gy        INTEGER NOT NULL,
  count     INTEGER DEFAULT 0,
  dwell_ms  INTEGER DEFAULT 0,
  updated   INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hm_cell ON heatmap_cells (site, url, gx, gy);

-- zone_stats: per-zone aggregated metrics — filled by processor
CREATE TABLE IF NOT EXISTS zone_stats (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  site       TEXT    NOT NULL,
  zone_id    TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  enters     INTEGER DEFAULT 0,
  clicks     INTEGER DEFAULT 0,
  avg_dwell  REAL    DEFAULT 0,
  updated    INTEGER DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_zs ON zone_stats (site, zone_id, url);

-- sessions: session-level summary — filled by processor
CREATE TABLE IF NOT EXISTS sessions (
  sid         TEXT    PRIMARY KEY,
  site        TEXT    NOT NULL,
  uid         TEXT,
  started     INTEGER NOT NULL,
  ended       INTEGER,
  duration    INTEGER,
  url_count   INTEGER DEFAULT 0,
  event_count INTEGER DEFAULT 0,
  has_replay  INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sess_site ON sessions (site, started DESC);
