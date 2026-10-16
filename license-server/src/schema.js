// Selbst-Migration: neue Tabellen/Spalten werden beim ersten Aufruf automatisch angelegt (kein manueller Schritt noetig).
import { getCfg, setCfg } from './discord.js';

const SCHEMA_V = '4';
const STEPS = [
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
  `CREATE TABLE IF NOT EXISTS gw_entries (gw_id INTEGER NOT NULL, user_id TEXT NOT NULL, name TEXT, PRIMARY KEY (gw_id, user_id))`
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
