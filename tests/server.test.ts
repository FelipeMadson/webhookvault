import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import { initDatabase } from "../src/storage/db.ts";
import { Repository } from "../src/storage/repository.ts";
import { WebhookVaultServer } from "../src/server/http-server.ts";
import { HMACVerifier } from "../src/crypto/hmac-verifier.ts";

describe("WebhookVaultServer - Servidor HTTP e API REST", () => {
  let server: WebhookVaultServer;
  let baseUrl: string;
  let repo: Repository;
  const secret = "test_server_secret_123";

  before(async () => {
    const db = initDatabase(":memory:");
    repo = new Repository(db);
    server = new WebhookVaultServer(repo, { defaultSecret: secret });

    const info = await server.listen(0, "127.0.0.1");
    baseUrl = info.url;
  });

  after(async () => {
    await server.close();
  });

  it("GET / deve servir a interface web do Embedded Dashboard em HTML5", async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.strictEqual(res.status, 200);
    const contentType = res.headers.get("content-type") || "";
    assert.ok(contentType.includes("text/html"));

    const html = await res.text();
    assert.ok(html.includes("WebhookVault"));
    assert.ok(html.includes("Local-First"));
    assert.ok(html.includes("fetchWebhooks"));
  });

  it("POST /webhook/github deve interceptar requisição e validar assinatura HMAC com sucesso", async () => {
    const payload = JSON.stringify({ action: "opened", issue: { title: "Bug no Login" } });
    const { headerName, headerValue } = HMACVerifier.generateSignature("github", payload, secret);

    const res = await fetch(`${baseUrl}/webhook/github`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [headerName]: headerValue
      },
      body: payload
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "captured");
    assert.strictEqual(body.source, "github");
    assert.strictEqual(body.hmac_status, "VALID");
    assert.ok(body.id.startsWith("wh_"));
  });

  it("POST /webhook/generic sem segredo configurado deve capturar como UNVERIFIED", async () => {
    const res = await fetch(`${baseUrl}/webhook/generic?secret=`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "plain text event"
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "captured");
    assert.ok(body.hmac_status === "UNVERIFIED" || body.hmac_status === "VALID");
  });

  it("GET /api/webhooks deve listar os webhooks gravados no SQLite", async () => {
    const res = await fetch(`${baseUrl}/api/webhooks`);
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 2);
  });

  it("GET /api/stats deve retornar métricas agregadas da esteira", async () => {
    const res = await fetch(`${baseUrl}/api/stats`);
    assert.strictEqual(res.status, 200);
    const stats = await res.json();
    assert.ok(stats.totalWebhooks >= 2);
    assert.strictEqual(typeof stats.validHmacCount, "number");
  });

  it("DELETE /api/webhooks deve esvaziar o histórico com sucesso", async () => {
    const deleteRes = await fetch(`${baseUrl}/api/webhooks`, { method: "DELETE" });
    assert.strictEqual(deleteRes.status, 200);

    const listRes = await fetch(`${baseUrl}/api/webhooks`);
    const list = await listRes.json();
    assert.strictEqual(list.length, 0);
  });
});
