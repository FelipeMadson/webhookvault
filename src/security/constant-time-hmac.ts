/**
 * Constant-Time HMAC-SHA256 Validator with Double-Hashing Mitigation
 * Eliminates signature length timing side-channels and provides adapters
 * for GitHub, Stripe, Shopify, and generic RFC 2104 webhooks.
 * 
 * Author: Felipe Madison (@FelipeMadson)
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export type HmacFormat = "hex" | "base64";

export interface HmacVerificationResult {
  isValid: boolean;
  reason?: string;
  provider?: string;
  timestamp?: number;
}

export interface HmacVerificationOptions {
  provider?: "github" | "stripe" | "shopify" | "generic";
  toleranceSeconds?: number;
  now?: number; // deterministic timestamp injection for testing
  format?: HmacFormat;
}

/**
 * Constant-time comparison using double-hashing (SHA-256) to eliminate
 * timing side-channels and signature length leakage.
 */
export function constantTimeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const bufA = Buffer.isBuffer(a) ? a : Buffer.from(a, "utf8");
  const bufB = Buffer.isBuffer(b) ? b : Buffer.from(b, "utf8");

  const hashA = createHash("sha256").update(bufA).digest();
  const hashB = createHash("sha256").update(bufB).digest();

  // Both hashA and hashB are guaranteed to be exactly 32 bytes
  const hashesMatch = timingSafeEqual(hashA, hashB);
  const lengthsMatch = bufA.byteLength === bufB.byteLength;

  return hashesMatch && lengthsMatch;
}

export function computeHmacSha256(
  rawPayload: string | Buffer,
  secret: string,
  format: HmacFormat = "hex"
): string {
  const payloadBuf = Buffer.isBuffer(rawPayload) ? rawPayload : Buffer.from(rawPayload, "utf8");
  return createHmac("sha256", secret).update(payloadBuf).digest(format);
}

export class ConstantTimeHmacValidator {
  public static verify(
    rawPayload: string | Buffer,
    secret: string,
    signatureHeader: string,
    options?: HmacVerificationOptions
  ): HmacVerificationResult {
    const provider = options?.provider || "generic";
    switch (provider) {
      case "github":
        return this.verifyGitHub(rawPayload, secret, signatureHeader);
      case "stripe":
        return this.verifyStripe(rawPayload, secret, signatureHeader, options?.toleranceSeconds, options?.now);
      case "shopify":
        return this.verifyShopify(rawPayload, secret, signatureHeader);
      case "generic":
      default:
        return this.verifyGeneric(rawPayload, secret, signatureHeader, options?.format);
    }
  }

  public static verifyGitHub(
    rawPayload: string | Buffer,
    secret: string,
    headerValue: string
  ): HmacVerificationResult {
    if (!headerValue || typeof headerValue !== "string") {
      return { isValid: false, reason: "MISSING_SIGNATURE_HEADER", provider: "github" };
    }
    const parts = headerValue.trim().split("=");
    if (parts.length !== 2 || parts[0] !== "sha256") {
      return { isValid: false, reason: "INVALID_GITHUB_SIGNATURE_FORMAT", provider: "github" };
    }
    const signature = parts[1];
    const expected = computeHmacSha256(rawPayload, secret, "hex");
    const isValid = constantTimeEqual(expected, signature);
    return {
      isValid,
      reason: isValid ? undefined : "SIGNATURE_MISMATCH",
      provider: "github"
    };
  }

  public static verifyStripe(
    rawPayload: string | Buffer,
    secret: string,
    headerValue: string,
    toleranceSeconds = 300,
    nowMs = Date.now()
  ): HmacVerificationResult {
    if (!headerValue || typeof headerValue !== "string") {
      return { isValid: false, reason: "MISSING_STRIPE_HEADER", provider: "stripe" };
    }

    const items = headerValue.split(",").map(item => item.trim());
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const item of items) {
      const [key, val] = item.split("=");
      if (key === "t") {
        timestamp = Number.parseInt(val, 10);
      } else if (key === "v1") {
        signatures.push(val);
      }
    }

    if (!timestamp || Number.isNaN(timestamp) || signatures.length === 0) {
      return { isValid: false, reason: "MALFORMED_STRIPE_HEADER", provider: "stripe" };
    }

    const currentEpochSeconds = Math.floor(nowMs / 1000);
    if (Math.abs(currentEpochSeconds - timestamp) > toleranceSeconds) {
      return {
        isValid: false,
        reason: "TIMESTAMP_OUT_OF_TOLERANCE",
        provider: "stripe",
        timestamp: timestamp * 1000
      };
    }

    const payloadStr = typeof rawPayload === "string" ? rawPayload : rawPayload.toString("utf8");
    const signedPayload = `${timestamp}.${payloadStr}`;
    const expected = computeHmacSha256(signedPayload, secret, "hex");

    let matched = false;
    for (const candidate of signatures) {
      if (constantTimeEqual(expected, candidate)) {
        matched = true;
      }
    }

    return {
      isValid: matched,
      reason: matched ? undefined : "SIGNATURE_MISMATCH",
      provider: "stripe",
      timestamp: timestamp * 1000
    };
  }

  public static verifyShopify(
    rawPayload: string | Buffer,
    secret: string,
    headerValue: string
  ): HmacVerificationResult {
    if (!headerValue || typeof headerValue !== "string") {
      return { isValid: false, reason: "MISSING_SHOPIFY_HEADER", provider: "shopify" };
    }
    const expected = computeHmacSha256(rawPayload, secret, "base64");
    const isValid = constantTimeEqual(expected, headerValue.trim());
    return {
      isValid,
      reason: isValid ? undefined : "SIGNATURE_MISMATCH",
      provider: "shopify"
    };
  }

  public static verifyGeneric(
    rawPayload: string | Buffer,
    secret: string,
    headerValue: string,
    format: HmacFormat = "hex"
  ): HmacVerificationResult {
    if (!headerValue || typeof headerValue !== "string") {
      return { isValid: false, reason: "MISSING_SIGNATURE", provider: "generic" };
    }
    const cleanHeader = headerValue.startsWith("sha256=") ? headerValue.slice(7) : headerValue;
    const expected = computeHmacSha256(rawPayload, secret, format);
    const isValid = constantTimeEqual(expected, cleanHeader.trim());
    return {
      isValid,
      reason: isValid ? undefined : "SIGNATURE_MISMATCH",
      provider: "generic"
    };
  }

  public static computeSignature(
    rawPayload: string | Buffer,
    secret: string,
    format: HmacFormat = "hex"
  ): string {
    return computeHmacSha256(rawPayload, secret, format);
  }
}
