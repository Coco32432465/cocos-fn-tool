-- Datenbank-Schema fuer Coco's Fn Tool Lizenz-Server (Cloudflare D1)
CREATE TABLE IF NOT EXISTS keys (
  key         TEXT PRIMARY KEY,
  discord_id  TEXT NOT NULL,
  plan        TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  device      TEXT,
  revoked     INTEGER NOT NULL DEFAULT 0,
  role_removed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS keys_user ON keys(discord_id);

CREATE TABLE IF NOT EXISTS tickets (
  channel_id  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tickets_user ON tickets(user_id);

CREATE TABLE IF NOT EXISTS logins (
  cid         TEXT PRIMARY KEY,
  discord_id  TEXT NOT NULL,
  username    TEXT,
  created_at  INTEGER NOT NULL,
  claimed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  discord_id  TEXT NOT NULL,
  username    TEXT,
  created_at  INTEGER NOT NULL
);
