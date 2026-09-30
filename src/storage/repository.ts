import type { DatabaseSync } from "node:sqlite";
import type { CapturedWebhook, ReplayLog, VaultStats, HMACStatus, HMACProvider } from "../types.ts";

/**
 * Repositório de persistência SQLite para o WebhookVault.
 */
export class Repository {
  private db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  public saveWebhook(wh: CapturedWebhook): void {
    const stmt = this.db.prepare(`
      INSERT INTO captured_webhooks (
        id, source, method, url, headers, raw_body, content_type, hmac_status, hmac_provider, client_ip, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    stmt.run(
      wh.id,
      wh.source,
      wh.method,
      wh.url,
      JSON.stringify(wh.headers || {}),
      wh.raw_body,
      wh.content_type,
      wh.hmac_status,
      wh.hmac_provider || "none",
      wh.client_ip || "127.0.0.1",
      wh.created_at || null
    );
  }

  public getWebhookById(id: string): CapturedWebhook | null {
    const stmt = this.db.prepare(`
      SELECT * FROM captured_webhooks WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return null;

    return this.mapWebhookRow(row);
  }

  public listWebhooks(options?: {
    source?: string;
    limit?: number;
    offset?: number;
    search?: string;
  }): CapturedWebhook[] {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    let query = "SELECT * FROM captured_webhooks WHERE 1=1";
    const params: any[] = [];

    if (options?.source) {
      query += " AND source = ?";
      params.push(options.source);
    }

    if (options?.search) {
      query += " AND (raw_body LIKE ? OR url LIKE ? OR id LIKE ?)";
      const term = `%${options.search}%`;
      params.push(term, term, term);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    return rows.map((r) => this.mapWebhookRow(r));
  }

  public deleteWebhook(id: string): boolean {
    const stmt = this.db.prepare("DELETE FROM captured_webhooks WHERE id = ?");
    const info = stmt.run(id);
    return (info.changes || 0) > 0;
  }

  public clearAll(): void {
    this.db.exec("DELETE FROM replay_logs; DELETE FROM captured_webhooks;");
  }

  public saveReplayLog(log: ReplayLog): void {
    const stmt = this.db.prepare(`
      INSERT INTO replay_logs (
        id, webhook_id, target_url, status_code, response_headers, response_body, duration_ms, replayed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `);

    stmt.run(
      log.id,
      log.webhook_id,
      log.target_url,
      log.status_code,
      JSON.stringify(log.response_headers || {}),
      log.response_body,
      log.duration_ms,
      log.replayed_at || null
    );
  }

  public getReplaysForWebhook(webhookId: string): ReplayLog[] {
    const stmt = this.db.prepare(`
      SELECT * FROM replay_logs WHERE webhook_id = ? ORDER BY replayed_at DESC
    `);
    const rows = stmt.all(webhookId) as any[];

    return rows.map((r) => ({
      id: r.id,
      webhook_id: r.webhook_id,
      target_url: r.target_url,
      status_code: r.status_code,
      response_headers: JSON.parse(r.response_headers || "{}"),
      response_body: r.response_body,
      duration_ms: r.duration_ms,
      replayed_at: r.replayed_at
    }));
  }

  public getStats(): VaultStats {
    const totalRow = (this.db.prepare("SELECT COUNT(*) as count FROM captured_webhooks").get() as any)?.count || 0;
    const validRow = (this.db.prepare("SELECT COUNT(*) as count FROM captured_webhooks WHERE hmac_status = 'VALID'").get() as any)?.count || 0;
    const invalidRow = (this.db.prepare("SELECT COUNT(*) as count FROM captured_webhooks WHERE hmac_status = 'INVALID'").get() as any)?.count || 0;
    const unverifiedRow = (this.db.prepare("SELECT COUNT(*) as count FROM captured_webhooks WHERE hmac_status = 'UNVERIFIED'").get() as any)?.count || 0;
    const replaysRow = (this.db.prepare("SELECT COUNT(*) as count FROM replay_logs").get() as any)?.count || 0;
    const lastRow = (this.db.prepare("SELECT created_at FROM captured_webhooks ORDER BY created_at DESC LIMIT 1").get() as any)?.created_at;

    return {
      totalWebhooks: totalRow,
      validHmacCount: validRow,
      invalidHmacCount: invalidRow,
      unverifiedHmacCount: unverifiedRow,
      totalReplays: replaysRow,
      lastWebhookTimestamp: lastRow
    };
  }

  private mapWebhookRow(row: any): CapturedWebhook {
    let headers = {};
    try {
      headers = JSON.parse(row.headers || "{}");
    } catch {}

    return {
      id: row.id,
      source: row.source,
      method: row.method,
      url: row.url,
      headers,
      raw_body: row.raw_body,
      content_type: row.content_type,
      hmac_status: row.hmac_status as HMACStatus,
      hmac_provider: row.hmac_provider as HMACProvider,
      client_ip: row.client_ip,
      created_at: row.created_at
    };
  }
}
