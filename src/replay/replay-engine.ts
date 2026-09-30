import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { HMACVerifier } from "../crypto/hmac-verifier.ts";
import type { Repository } from "../storage/repository.ts";
import type { CapturedWebhook, ReplayLog, ReplayOptions, HMACProvider } from "../types.ts";

/**
 * Motor de Replay de Webhooks para endpoints locais ou remotos.
 */
export class ReplayEngine {
  private repo: Repository;

  constructor(repo: Repository) {
    this.repo = repo;
  }

  /**
   * Reenvia um webhook capturado para a URL de destino com controle de latência e cabeçalhos.
   */
  public async replayWebhook(
    webhook: CapturedWebhook,
    targetUrl: string,
    options: ReplayOptions = {}
  ): Promise<ReplayLog> {
    const timeoutMs = options.timeoutMs ?? 10000;
    const headersToSend: Record<string, string> = {};

    // 1. Filtrar cabeçalhos hop-by-hop da requisição original
    const hopByHop = new Set([
      "host",
      "connection",
      "content-length",
      "transfer-encoding",
      "keep-alive",
      "upgrade"
    ]);

    for (const [k, v] of Object.entries(webhook.headers)) {
      const lowerKey = k.toLowerCase();
      if (!hopByHop.has(lowerKey) && v !== undefined) {
        headersToSend[k] = Array.isArray(v) ? v.join(", ") : String(v);
      }
    }

    if (webhook.content_type && !headersToSend["content-type"]) {
      headersToSend["content-type"] = webhook.content_type;
    }

    // Identificador de auditoria do replay
    headersToSend["x-webhookvault-replay"] = "true";
    headersToSend["x-webhookvault-original-id"] = webhook.id;

    // 2. Se solicitado recálculo de HMAC (ex: timestamp novo para Stripe ou secret atualizado)
    if (options.recalculateHmac && options.secret) {
      const provider = (webhook.hmac_provider || "generic") as HMACProvider;
      const sig = HMACVerifier.generateSignature(provider, webhook.raw_body, options.secret);
      headersToSend[sig.headerName.toLowerCase()] = sig.headerValue;
    }

    // 3. Aplicar sobreposições explícitas de cabeçalhos
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        headersToSend[k] = v;
      }
    }

    const start = performance.now();
    let statusCode = 0;
    const responseHeaders: Record<string, string> = {};
    let responseBody = "";

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(targetUrl, {
        method: webhook.method,
        headers: headersToSend,
        body: webhook.method === "GET" || webhook.method === "HEAD" ? undefined : webhook.raw_body,
        signal: controller.signal
      });

      clearTimeout(timer);
      statusCode = response.status;

      response.headers.forEach((value, name) => {
        responseHeaders[name] = value;
      });

      const text = await response.text();
      responseBody = text.length > 50000 ? text.substring(0, 50000) + "... [Truncado pelo WebhookVault]" : text;
    } catch (err: any) {
      statusCode = err.name === "AbortError" ? 504 : 502;
      responseBody = JSON.stringify({
        error: "Replay failed",
        message: err.message || "Erro de conexão ao endpoint de destino",
        code: err.code || err.name
      });
    }

    const durationMs = Number((performance.now() - start).toFixed(2));

    const replayLog: ReplayLog = {
      id: `rep_${Date.now()}_${randomUUID().slice(0, 8)}`,
      webhook_id: webhook.id,
      target_url: targetUrl,
      status_code: statusCode,
      response_headers: responseHeaders,
      response_body: responseBody,
      duration_ms: durationMs,
      replayed_at: new Date().toISOString()
    };

    this.repo.saveReplayLog(replayLog);
    return replayLog;
  }
}
