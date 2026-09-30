import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Inicialização e migração do SQLite local para o WebhookVault.
 */
export function initDatabase(customPath: string = "webhookvault.db"): DatabaseSync {
  if (customPath !== ":memory:") {
    const dbDir = path.dirname(path.resolve(customPath));
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  }

  const db = new DatabaseSync(customPath);

  if (customPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");
  }
  db.exec("PRAGMA foreign_keys = ON;");

  createTables(db);
  return db;
}

function createTables(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS captured_webhooks (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      method TEXT NOT NULL,
      url TEXT NOT NULL,
      headers TEXT NOT NULL,
      raw_body TEXT NOT NULL,
      content_type TEXT NOT NULL,
      hmac_status TEXT NOT NULL,
      hmac_provider TEXT,
      client_ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS replay_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES captured_webhooks(id) ON DELETE CASCADE,
      target_url TEXT NOT NULL,
      status_code INTEGER NOT NULL,
      response_headers TEXT NOT NULL,
      response_body TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      replayed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_source ON captured_webhooks(source);
    CREATE INDEX IF NOT EXISTS idx_webhooks_created_at ON captured_webhooks(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_webhooks_hmac_status ON captured_webhooks(hmac_status);
    CREATE INDEX IF NOT EXISTS idx_replays_webhook_id ON replay_logs(webhook_id);
  `);
}
