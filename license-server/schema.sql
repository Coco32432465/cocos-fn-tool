-- Neue Installation: komplettes Schema (Cloudflare D1 = SQLite). Bestehende DB: migrations/002_v2.sql verwenden.
CREATE TABLE IF NOT EXISTS keys (
  key          TEXT PRIMARY KEY,
  plan         TEXT NOT NULL,
  days         INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'unused',   -- unused | active | revoked
  discord_id   TEXT,
  device       TEXT,
  created_at   INTEGER NOT NULL,
  created_by   TEXT,
  redeemed_at  INTEGER,
  expires_at   INTEGER,
  role_removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS keys_user ON keys(discord_id);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  type       TEXT NOT NULL DEFAULT 'buy',
  plan       TEXT
);
CREATE INDEX IF NOT EXISTS tickets_user ON tickets(user_id);

CREATE TABLE IF NOT EXISTS logins (
  cid TEXT PRIMARY KEY, discord_id TEXT NOT NULL, username TEXT, created_at INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, discord_id TEXT NOT NULL, username TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS rl (bucket TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (bucket, w));
