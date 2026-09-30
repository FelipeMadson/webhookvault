import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { initDatabase } from "../src/storage/db.ts";
import { Repository } from "../src/storage/repository.ts";
import type { CapturedWebhook, ReplayLog } from "../src/types.ts";

describe("Repository - Persistência SQLite WAL", () => {
  let repo: Repository;

  beforeEach(() => {
    const db = initDatabase(":memory:");
    repo = new Repository(db);
  });

  it("deve salvar e recuperar webhook por ID mantendo payload e headers", () => {
    const wh: CapturedWebhook = {
      id: "wh_test_123",
      source: "github",
      method: "POST",
      url: "/webhook/github",
      headers: { "x-hub-signature-256": "sha256=abcdef", "content-type": "application/json" },
      raw_body: '{"action":"opened"}',
      content_type: "application/json",
      hmac_status: "VALID",
      hmac_provider: "github",
      client_ip: "192.168.1.10"
    };

    repo.saveWebhook(wh);
    const retrieved = repo.getWebhookById("wh_test_123");

    assert.ok(retrieved);
    assert.strictEqual(retrieved.id, "wh_test_123");
    assert.strictEqual(retrieved.source, "github");
    assert.strictEqual(retrieved.hmac_status, "VALID");
    assert.strictEqual(retrieved.raw_body, '{"action":"opened"}');
    assert.strictEqual(retrieved.client_ip, "192.168.1.10");
  });

  it("deve filtrar webhooks por origem e termo de busca no corpo", () => {
    repo.saveWebhook({
      id: "wh_stripe_1",
      source: "stripe",
      method: "POST",
      url: "/webhook/stripe",
      headers: {},
      raw_body: '{"event":"payment_intent.succeeded","amount":5000}',
      content_type: "application/json",
      hmac_status: "VALID"
    });

    repo.saveWebhook({
      id: "wh_github_1",
      source: "github",
      method: "POST",
      url: "/webhook/github",
      headers: {},
      raw_body: '{"action":"push","ref":"refs/heads/main"}',
      content_type: "application/json",
      hmac_status: "UNVERIFIED"
    });

    // Filtro por source
    const stripeOnly = repo.listWebhooks({ source: "stripe" });
    assert.strictEqual(stripeOnly.length, 1);
    assert.strictEqual(stripeOnly[0].id, "wh_stripe_1");

    // Filtro por termo de busca no payload
    const searchResult = repo.listWebhooks({ search: "payment_intent" });
    assert.strictEqual(searchResult.length, 1);
    assert.strictEqual(searchResult[0].id, "wh_stripe_1");
  });

  it("deve salvar histórico de replay associado ao webhook", () => {
    const wh: CapturedWebhook = {
      id: "wh_replay_parent",
      source: "shopify",
      method: "POST",
      url: "/webhook/shopify",
      headers: {},
      raw_body: '{"order":"1001"}',
      content_type: "application/json",
      hmac_status: "VALID"
    };
    repo.saveWebhook(wh);

    const log: ReplayLog = {
      id: "rep_1",
      webhook_id: "wh_replay_parent",
      target_url: "http://localhost:3000/api/webhook",
      status_code: 200,
      response_headers: { "content-type": "application/json" },
      response_body: '{"success":true}',
      duration_ms: 12.5
    };
    repo.saveReplayLog(log);

    const replays = repo.getReplaysForWebhook("wh_replay_parent");
    assert.strictEqual(replays.length, 1);
    assert.strictEqual(replays[0].target_url, "http://localhost:3000/api/webhook");
    assert.strictEqual(replays[0].status_code, 200);
    assert.strictEqual(replays[0].duration_ms, 12.5);
  });

  it("deve calcular estatísticas agregadas corretamente", () => {
    repo.saveWebhook({
      id: "w1",
      source: "github",
      method: "POST",
      url: "/webhook",
      headers: {},
      raw_body: "a",
      content_type: "text/plain",
      hmac_status: "VALID"
    });
    repo.saveWebhook({
      id: "w2",
      source: "github",
      method: "POST",
      url: "/webhook",
      headers: {},
      raw_body: "b",
      content_type: "text/plain",
      hmac_status: "INVALID"
    });

    const stats = repo.getStats();
    assert.strictEqual(stats.totalWebhooks, 2);
    assert.strictEqual(stats.validHmacCount, 1);
    assert.strictEqual(stats.invalidHmacCount, 1);
    assert.strictEqual(stats.unverifiedHmacCount, 0);
  });

  it("deve limpar todo o banco ao chamar clearAll", () => {
    repo.saveWebhook({
      id: "w_temp",
      source: "github",
      method: "POST",
      url: "/webhook",
      headers: {},
      raw_body: "teste",
      content_type: "text/plain",
      hmac_status: "VALID"
    });

    assert.strictEqual(repo.listWebhooks().length, 1);
    repo.clearAll();
    assert.strictEqual(repo.listWebhooks().length, 0);
  });
});
