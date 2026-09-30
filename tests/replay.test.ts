import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { createServer, type Server } from "node:http";
import { initDatabase } from "../src/storage/db.ts";
import { Repository } from "../src/storage/repository.ts";
import { ReplayEngine } from "../src/replay/replay-engine.ts";
import { HMACVerifier } from "../src/crypto/hmac-verifier.ts";
import type { CapturedWebhook } from "../src/types.ts";

describe("ReplayEngine - Motor Determinístico de Replay", () => {
  let mockServer: Server;
  let mockPort: number;
  let receivedRequests: any[] = [];
  let repo: Repository;
  let engine: ReplayEngine;

  before(async () => {
    const db = initDatabase(":memory:");
    repo = new Repository(db);
    engine = new ReplayEngine(repo);

    await new Promise<void>((resolve) => {
      mockServer = createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          receivedRequests.push({
            method: req.method,
            url: req.url,
            headers: req.headers,
            body
          });

          if (req.url === "/error") {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "internal_error" }));
          } else {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ received: true, size: body.length }));
          }
        });
      });

      mockServer.listen(0, "127.0.0.1", () => {
        const addr = mockServer.address() as any;
        mockPort = addr.port;
        resolve();
      });
    });
  });

  after(() => {
    mockServer.close();
  });

  it("deve reenviar webhook capturado mantendo headers e corpo intactos", async () => {
    receivedRequests = [];
    const wh: CapturedWebhook = {
      id: "wh_rep_test",
      source: "github",
      method: "POST",
      url: "/webhook/github",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-custom-trace": "trace_999"
      },
      raw_body: '{"ref":"refs/heads/main","commits":[]}',
      content_type: "application/json",
      hmac_status: "VALID",
      hmac_provider: "github"
    };
    repo.saveWebhook(wh);

    const targetUrl = `http://127.0.0.1:${mockPort}/api/receiver`;
    const replayLog = await engine.replayWebhook(wh, targetUrl);

    assert.strictEqual(replayLog.status_code, 200);
    assert.strictEqual(replayLog.webhook_id, "wh_rep_test");
    assert.ok(replayLog.duration_ms >= 0);

    // Validar o que o mock server recebeu
    assert.strictEqual(receivedRequests.length, 1);
    const rec = receivedRequests[0];
    assert.strictEqual(rec.method, "POST");
    assert.strictEqual(rec.headers["x-github-event"], "push");
    assert.strictEqual(rec.headers["x-custom-trace"], "trace_999");
    assert.strictEqual(rec.headers["x-webhookvault-replay"], "true");
    assert.strictEqual(rec.body, '{"ref":"refs/heads/main","commits":[]}');
  });

  it("deve recalcular assinatura HMAC durante o replay quando solicitado", async () => {
    receivedRequests = [];
    const secret = "secret_recalculate_xyz";
    const wh: CapturedWebhook = {
      id: "wh_rep_recalc",
      source: "github",
      method: "POST",
      url: "/webhook/github",
      headers: {
        "content-type": "application/json",
        "x-hub-signature-256": "sha256=antiga_invalida"
      },
      raw_body: '{"action":"synchronize"}',
      content_type: "application/json",
      hmac_status: "INVALID",
      hmac_provider: "github"
    };
    repo.saveWebhook(wh);

    const targetUrl = `http://127.0.0.1:${mockPort}/api/receiver`;
    const replayLog = await engine.replayWebhook(wh, targetUrl, {
      recalculateHmac: true,
      secret
    });

    assert.strictEqual(replayLog.status_code, 200);
    assert.strictEqual(receivedRequests.length, 1);
    const rec = receivedRequests[0];

    // Verificar se o cabeçalho foi recalculado com sucesso
    const newSignature = rec.headers["x-hub-signature-256"];
    assert.ok(newSignature && newSignature.startsWith("sha256="));
    const verify = HMACVerifier.verifyGitHub(rec.headers, wh.raw_body, secret);
    assert.strictEqual(verify.isValid, true);
  });

  it("deve capturar adequadamente resposta 500 do servidor de destino sem quebrar a execução", async () => {
    const wh: CapturedWebhook = {
      id: "wh_err_test",
      source: "default",
      method: "POST",
      url: "/webhook",
      headers: {},
      raw_body: '{"test":"error"}',
      content_type: "application/json",
      hmac_status: "UNVERIFIED"
    };
    repo.saveWebhook(wh);

    const targetUrl = `http://127.0.0.1:${mockPort}/error`;
    const replayLog = await engine.replayWebhook(wh, targetUrl);

    assert.strictEqual(replayLog.status_code, 500);
    assert.ok(replayLog.response_body.includes("internal_error"));
  });

  it("deve tratar endpoint inalcançável retornando status 502/504 de forma resiliente", async () => {
    const wh: CapturedWebhook = {
      id: "wh_unreachable",
      source: "default",
      method: "POST",
      url: "/webhook",
      headers: {},
      raw_body: "{}",
      content_type: "application/json",
      hmac_status: "UNVERIFIED"
    };
    repo.saveWebhook(wh);

    // Porta improvável de estar aberta
    const unreachableUrl = "http://127.0.0.1:59999/nowhere";
    const replayLog = await engine.replayWebhook(wh, unreachableUrl, { timeoutMs: 500 });

    assert.strictEqual(replayLog.status_code, 502);
    assert.ok(replayLog.response_body.includes("Replay failed"));
  });
});
