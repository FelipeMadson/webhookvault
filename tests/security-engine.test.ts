import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  constantTimeEqual,
  computeHmacSha256,
  ConstantTimeHmacValidator
} from "../src/engines/security-vault/constant-time-hmac.ts";
import { ReplayAttackGuard } from "../src/engines/security-vault/replay-guard.ts";
import { DeadLetterQueueEngine } from "../src/engines/security-vault/dead-letter-queue.ts";

describe("Security-Vault Engine Suite", () => {
  describe("1. Constant-Time HMAC-SHA256", () => {
    it("Compara strings identicas como validas", () => {
      assert.strictEqual(constantTimeEqual("secret_hash_123", "secret_hash_123"), true);
    });

    it("Rejeita tamanhos distintos sem vazar informacao de tempo", () => {
      assert.strictEqual(constantTimeEqual("short", "much_longer_string"), false);
    });

    it("Valida webhook com assinatura HMAC", () => {
      const payload = JSON.stringify({ event: "sync" });
      const secret = "topsecret";
      const sig = computeHmacSha256(payload, secret);
      const res = ConstantTimeHmacValidator.verifyGeneric(payload, secret, sig);
      assert.strictEqual(res.isValid, true);
    });
  });

  describe("2. Replay Attack Guard", () => {
    it("Rejeita nonce duplicado", () => {
      const guard = new ReplayAttackGuard();
      const now = Date.now();
      assert.strictEqual(guard.checkAndRegister("nonce_1", now, now).allowed, true);
      assert.strictEqual(guard.checkAndRegister("nonce_1", now, now).allowed, false);
    });
  });

  describe("3. Dead-Letter Queue", () => {
    it("Isola poison pill sem retentativas", () => {
      const dlq = new DeadLetterQueueEngine();
      const id = dlq.enqueue({ source: "test", payload: "err", errorReason: "MALFORMED", isPoisonPill: true });
      const msg = dlq.getMessage(id);
      assert.strictEqual(msg?.status, "POISON_PILL");
      assert.strictEqual(dlq.getPendingRetries().length, 0);
    });
  });
});
