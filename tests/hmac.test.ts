import { describe, it } from "node:test";
import assert from "node:assert";
import { createHmac } from "node:crypto";
import { HMACVerifier } from "../src/crypto/hmac-verifier.ts";

describe("HMACVerifier - Validação Criptográfica de Webhooks", () => {
  const secret = "super_secret_signing_key_12345";
  const payload = JSON.stringify({ event: "order.created", id: 42, total: 199.90 });

  it("deve validar assinatura legítima do GitHub (X-Hub-Signature-256)", () => {
    const { headerName, headerValue } = HMACVerifier.generateSignature("github", payload, secret);
    const headers = { [headerName.toLowerCase()]: headerValue };

    const result = HMACVerifier.verifyGitHub(headers, payload, secret);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.provider, "github");
    assert.strictEqual(result.reason, undefined);
  });

  it("deve rejeitar assinatura do GitHub com segredo incorreto ou payload alterado", () => {
    const { headerName, headerValue } = HMACVerifier.generateSignature("github", payload, secret);
    const headers = { [headerName.toLowerCase()]: headerValue };

    // 1. Segredo errado
    const wrongSecretResult = HMACVerifier.verifyGitHub(headers, payload, "wrong_secret");
    assert.strictEqual(wrongSecretResult.isValid, false);

    // 2. Payload adulterado (tampered)
    const tamperedPayload = JSON.stringify({ event: "order.created", id: 42, total: 0.01 });
    const tamperedResult = HMACVerifier.verifyGitHub(headers, tamperedPayload, secret);
    assert.strictEqual(tamperedResult.isValid, false);
  });

  it("deve validar assinatura do Stripe com timestamp válido", () => {
    const { headerName, headerValue } = HMACVerifier.generateSignature("stripe", payload, secret);
    const headers = { [headerName.toLowerCase()]: headerValue };

    const result = HMACVerifier.verifyStripe(headers, payload, secret, 300);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.provider, "stripe");
  });

  it("deve rejeitar assinatura do Stripe expirada fora da tolerância", () => {
    // Timestamp antigo (10 minutos atrás)
    const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
    const hash = createHmac("sha256", secret).update(`${oldTimestamp}.${payload}`).digest("hex");
    const headers = { "stripe-signature": `t=${oldTimestamp},v1=${hash}` };

    const result = HMACVerifier.verifyStripe(headers, payload, secret, 300);
    assert.strictEqual(result.isValid, false);
    assert.ok(result.reason?.includes("expirado"));
  });

  it("deve validar assinatura do Shopify em Base64", () => {
    const { headerName, headerValue } = HMACVerifier.generateSignature("shopify", payload, secret);
    const headers = { [headerName.toLowerCase()]: headerValue };

    const result = HMACVerifier.verifyShopify(headers, payload, secret);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.provider, "shopify");
  });

  it("deve detectar automaticamente o provedor correto a partir dos headers", () => {
    assert.strictEqual(HMACVerifier.detectProvider({ "x-hub-signature-256": "sha256=123" }), "github");
    assert.strictEqual(HMACVerifier.detectProvider({ "stripe-signature": "t=1,v1=2" }), "stripe");
    assert.strictEqual(HMACVerifier.detectProvider({ "x-shopify-hmac-sha256": "abc" }), "shopify");
    assert.strictEqual(HMACVerifier.detectProvider({ "x-signature-256": "hash" }), "generic");
    assert.strictEqual(HMACVerifier.detectProvider({ "content-type": "application/json" }), "none");
  });

  it("safeCompare deve retornar false com segurança para buffers de tamanhos diferentes sem estourar exceção", () => {
    assert.strictEqual(HMACVerifier.safeCompare("abc", "abcdef"), false);
    assert.strictEqual(HMACVerifier.safeCompare("abcdef", "abcdef"), true);
  });
});
