-- Migration von v1 auf v2 (EINMAL ausfuehren): npm run db:migrate
ALTER TABLE keys RENAME TO keys_old;
CREATE TABLE keys (
  key          TEXT PRIMARY KEY,
  plan         TEXT NOT NULL,
  days         INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'unused',
  discord_id   TEXT,
  device       TEXT,
  created_at   INTEGER NOT NULL,
  created_by   TEXT,
  redeemed_at  INTEGER,
  expires_at   INTEGER,
  role_removed INTEGER NOT NULL DEFAULT 0
);
INSERT INTO keys (key, plan, days, status, discord_id, device, created_at, redeemed_at, expires_at, role_removed)
  SELECT key, plan, CASE plan WHEN 'week' THEN 7 ELSE 30 END, CASE WHEN revoked = 1 THEN 'revoked' ELSE 'active' END,
         discord_id, device, created_at, created_at, expires_at, role_removed FROM keys_old;
DROP TABLE keys_old;
CREATE INDEX IF NOT EXISTS keys_user ON keys(discord_id);
ALTER TABLE tickets ADD COLUMN type TEXT NOT NULL DEFAULT 'buy';
ALTER TABLE tickets ADD COLUMN plan TEXT;
CREATE TABLE IF NOT EXISTS config (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS rl (bucket TEXT NOT NULL, w INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (bucket, w));
