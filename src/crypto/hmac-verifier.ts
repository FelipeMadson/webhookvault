import { createHmac, timingSafeEqual } from "node:crypto";
import type { HMACProvider, HMACVerificationResult } from "../types.ts";

/**
 * Validador Criptográfico de Assinaturas HMAC (GitHub, Stripe, Shopify, Genérico).
 * Implementa comparações em tempo constante (timing-safe) para evitar ataques de canal lateral.
 */
export class HMACVerifier {
  /**
   * Compara com segurança duas strings em tempo constante para evitar timing attacks.
   */
  public static safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return timingSafeEqual(bufA, bufB);
  }

  /**
   * Detecta automaticamente o provedor de webhook com base nos headers HTTP.
   */
  public static detectProvider(headers: Record<string, string | string[] | undefined>): HMACProvider {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v || "");
    }

    if (normHeaders["x-hub-signature-256"] || normHeaders["x-hub-signature"]) {
      return "github";
    }
    if (normHeaders["stripe-signature"]) {
      return "stripe";
    }
    if (normHeaders["x-shopify-hmac-sha256"]) {
      return "shopify";
    }
    if (normHeaders["x-signature-256"] || normHeaders["x-hmac-signature"] || normHeaders["signature"]) {
      return "generic";
    }

    return "none";
  }

  /**
   * Valida a assinatura de um webhook do GitHub.
   * Header: X-Hub-Signature-256: sha256=<hex>
   */
  public static verifyGitHub(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    secret: string
  ): HMACVerificationResult {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v || "");
    }

    const signature = normHeaders["x-hub-signature-256"];
    if (!signature) {
      return {
        isValid: false,
        provider: "github",
        reason: "Cabeçalho X-Hub-Signature-256 ausente na requisição."
      };
    }

    if (!signature.startsWith("sha256=")) {
      return {
        isValid: false,
        provider: "github",
        reason: "Formato de assinatura inválido. Esperado prefixo 'sha256='."
      };
    }

    const expectedHash = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    const providedHash = signature.slice("sha256=".length);

    const isValid = this.safeCompare(expectedHash, providedHash);
    return {
      isValid,
      provider: "github",
      reason: isValid ? undefined : "Assinatura SHA-256 incompatível com o secret fornecido."
    };
  }

  /**
   * Valida a assinatura de um webhook do Stripe.
   * Header: Stripe-Signature: t=<timestamp>,v1=<signature>
   */
  public static verifyStripe(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    secret: string,
    toleranceSeconds: number = 300
  ): HMACVerificationResult {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v || "");
    }

    const header = normHeaders["stripe-signature"];
    if (!header) {
      return {
        isValid: false,
        provider: "stripe",
        reason: "Cabeçalho Stripe-Signature ausente."
      };
    }

    const items = header.split(",");
    let timestamp = "";
    const signatures: string[] = [];

    for (const item of items) {
      const [key, value] = item.trim().split("=");
      if (key === "t") timestamp = value;
      if (key === "v1") signatures.push(value);
    }

    if (!timestamp || signatures.length === 0) {
      return {
        isValid: false,
        provider: "stripe",
        reason: "Cabeçalho Stripe-Signature malformado (deve conter 't' e 'v1')."
      };
    }

    if (toleranceSeconds > 0) {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const tsNumber = parseInt(timestamp, 10);
      if (isNaN(tsNumber) || Math.abs(nowSeconds - tsNumber) > toleranceSeconds) {
        return {
          isValid: false,
          provider: "stripe",
          reason: `Timestamp expirado ou fora da tolerância de ${toleranceSeconds}s (recebido: ${timestamp}).`
        };
      }
    }

    const payloadToSign = `${timestamp}.${rawBody}`;
    const expectedSig = createHmac("sha256", secret).update(payloadToSign, "utf8").digest("hex");

    const matched = signatures.some((sig) => this.safeCompare(expectedSig, sig));
    return {
      isValid: matched,
      provider: "stripe",
      reason: matched ? undefined : "Nenhuma assinatura v1 correspondeu ao payload e secret."
    };
  }

  /**
   * Valida a assinatura de um webhook do Shopify.
   * Header: X-Shopify-Hmac-Sha256: <base64>
   */
  public static verifyShopify(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    secret: string
  ): HMACVerificationResult {
    const normHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      normHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v || "");
    }

    const signature = normHeaders["x-shopify-hmac-sha256"];
    if (!signature) {
      return {
        isValid: false,
        provider: "shopify",
        reason: "Cabeçalho X-Shopify-Hmac-Sha256 ausente."
      };
    }

    const expectedBase64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
    const isValid = this.safeCompare(expectedBase64, signature);

    return {
      isValid,
      provider: "shopify",
      reason: isValid ? undefined : "Assinatura Shopify Base64 incorreta."
    };
  }

  /**
   * Validador universal com base em detecção ou configuração explícita.
   */
  public static verifyWebhook(
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    secret?: string,
    explicitProvider?: HMACProvider
  ): HMACVerificationResult {
    if (!secret) {
      return {
        isValid: false,
        provider: "none",
        reason: "Nenhum segredo (secret) configurado para verificação."
      };
    }

    const provider = explicitProvider && explicitProvider !== "none" 
      ? explicitProvider 
      : this.detectProvider(headers);

    switch (provider) {
      case "github":
        return this.verifyGitHub(headers, rawBody, secret);
      case "stripe":
        return this.verifyStripe(headers, rawBody, secret);
      case "shopify":
        return this.verifyShopify(headers, rawBody, secret);
      case "generic": {
        const normHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers)) {
          normHeaders[k.toLowerCase()] = Array.isArray(v) ? v[0] : (v || "");
        }
        const sig = normHeaders["x-signature-256"] || normHeaders["x-hmac-signature"] || normHeaders["signature"] || "";
        const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        const isValid = sig ? this.safeCompare(expected, sig) : false;
        return {
          isValid,
          provider: "generic",
          reason: isValid ? undefined : "Assinatura genérica incompatível ou ausente."
        };
      }
      default:
        return {
          isValid: false,
          provider: "none",
          reason: "Nenhum cabeçalho HMAC reconhecido na requisição."
        };
    }
  }

  /**
   * Gera uma assinatura de teste válida para emulação e testes locais.
   */
  public static generateSignature(provider: HMACProvider, rawBody: string, secret: string): { headerName: string; headerValue: string } {
    switch (provider) {
      case "github": {
        const hash = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        return { headerName: "X-Hub-Signature-256", headerValue: `sha256=${hash}` };
      }
      case "stripe": {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const hash = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
        return { headerName: "Stripe-Signature", headerValue: `t=${timestamp},v1=${hash}` };
      }
      case "shopify": {
        const b64 = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
        return { headerName: "X-Shopify-Hmac-Sha256", headerValue: b64 };
      }
      default: {
        const hash = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
        return { headerName: "X-Signature-256", headerValue: hash };
      }
    }
  }
}
