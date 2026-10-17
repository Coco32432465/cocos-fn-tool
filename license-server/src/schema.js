// Selbst-Migration: neue Tabellen/Spalten werden beim ersten Aufruf automatisch angelegt (kein manueller Schritt noetig).
import { getCfg, setCfg } from './discord.js';

const SCHEMA_V = '15';
const STEPS = [
  'ALTER TABLE tickets ADD COLUMN code TEXT',
  `CREATE TABLE IF NOT EXISTS codes (code TEXT PRIMARY KEY, owner TEXT NOT NULL, created_at INTEGER NOT NULL, uses INTEGER NOT NULL DEFAULT 0, earned_days REAL NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS code_uses (user_id TEXT PRIMARY KEY, code TEXT NOT NULL, plan TEXT, created_at INTEGER NOT NULL)`,
  'ALTER TABLE sessions ADD COLUMN last_seen INTEGER',
  'ALTER TABLE sessions ADD COLUMN app_version TEXT',
  'ALTER TABLE keys ADD COLUMN last_seen INTEGER',
  'ALTER TABLE keys ADD COLUMN reminded INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE tickets ADD COLUMN paid INTEGER NOT NULL DEFAULT 0',
  `CREATE TABLE IF NOT EXISTS ranks (
    discord_id TEXT PRIMARY KEY, name TEXT, games INTEGER NOT NULL DEFAULT 0, avg_score REAL NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0, avg_place REAL, best_place INTEGER, updated_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS ranks_score ON ranks(avg_score DESC)',
  `CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, user_id TEXT NOT NULL, title TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, plan TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, kind TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, prize TEXT NOT NULL, winners INTEGER NOT NULL DEFAULT 1,
    ends_at INTEGER NOT NULL, host TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', winner_ids TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS giveaways_due ON giveaways(status, ends_at)',
  `CREATE TABLE IF NOT EXISTS gw_entries (gw_id INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT, PRIMARY KEY (gw_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS polls (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, question TEXT NOT NULL, options TEXT NOT NULL,
    ends_at INTEGER NOT NULL, host TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS polls_due ON polls(status, ends_at)',
  `CREATE TABLE IF NOT EXISTS poll_votes (poll_id INTEGER NOT NULL, user_id TEXT NOT NULL, opt INTEGER NOT NULL, PRIMARY KEY (poll_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS lfg (
    id INTEGER PRIMARY KEY AUTOINCREMENT, channel_id TEXT NOT NULL, message_id TEXT NOT NULL, host TEXT NOT NULL, mode TEXT NOT NULL, slots INTEGER NOT NULL,
    note TEXT, members TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, text TEXT NOT NULL, due INTEGER NOT NULL, sent INTEGER NOT NULL DEFAULT 0)`,
  'CREATE INDEX IF NOT EXISTS reminders_due ON reminders(sent, due)',
  `CREATE TABLE IF NOT EXISTS trials (user_id TEXT PRIMARY KEY, key TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ratings (channel_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, stars INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS reward_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, days REAL NOT NULL, reason TEXT, by_id TEXT, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, descr TEXT, starts_at INTEGER NOT NULL, channel_id TEXT, message_id TEXT, created_by TEXT, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open')`,
  `CREATE TABLE IF NOT EXISTS event_rsvp (event_id INTEGER NOT NULL, user_id TEXT NOT NULL, yes INTEGER NOT NULL DEFAULT 1, reminded INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (event_id, user_id))`,
  `CREATE TABLE IF NOT EXISTS entitlements (user_id TEXT NOT NULL, ent TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, ent))`,
  `CREATE TABLE IF NOT EXISTS teams (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE, seats INTEGER NOT NULL DEFAULT 5, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS team_members (user_id TEXT PRIMARY KEY, team_id INTEGER NOT NULL, name TEXT, stats TEXT, updated_at INTEGER, joined_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS team_members_team ON team_members(team_id)',
  `CREATE TABLE IF NOT EXISTS season_claims (user_id TEXT NOT NULL, season TEXT NOT NULL, level INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (user_id, season, level))`,
  'ALTER TABLE codes ADD COLUMN buyer_days REAL',
  'ALTER TABLE codes ADD COLUMN owner_week REAL',
  'ALTER TABLE codes ADD COLUMN owner_month REAL',
  `CREATE TABLE IF NOT EXISTS cup (discord_id TEXT NOT NULL, week TEXT NOT NULL, name TEXT, games INTEGER NOT NULL DEFAULT 0, score REAL NOT NULL DEFAULT 0, best INTEGER, wins INTEGER NOT NULL DEFAULT 0, kills INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, PRIMARY KEY (discord_id, week))`,
  'CREATE INDEX IF NOT EXISTS cup_week ON cup(week, score DESC)',
  `CREATE TABLE IF NOT EXISTS clips (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, url TEXT NOT NULL, title TEXT, month TEXT NOT NULL, channel_id TEXT, message_id TEXT, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL)`,
  'CREATE INDEX IF NOT EXISTS clips_month ON clips(month)',
  `CREATE TABLE IF NOT EXISTS clip_votes (clip_id INTEGER NOT NULL, user_id TEXT NOT NULL, PRIMARY KEY (clip_id, user_id))`
];

let done = false;
export async function ensureSchema(env) {
  if (done) return;
  try {
    if ((await getCfg(env, 'schema')) === SCHEMA_V) { done = true; return; }
  } catch (e) { return; } // config-Tabelle fehlt: Basis-Migration noch nicht gelaufen
  for (const sql of STEPS) { try { await env.DB.prepare(sql).run(); } catch (e) { /* Spalte/Tabelle existiert schon */ } }
  await setCfg(env, 'schema', SCHEMA_V);
  done = true;
}
export const _resetSchemaFlag = () => { done = false; };
