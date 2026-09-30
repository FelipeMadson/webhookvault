import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { HMACVerifier } from "../crypto/hmac-verifier.ts";
import { ReplayEngine } from "../replay/replay-engine.ts";
import { getEmbeddedDashboardHtml } from "../ui/embedded-dashboard.ts";
import type { Repository } from "../storage/repository.ts";
import type { CapturedWebhook, ServerOptions, HMACStatus } from "../types.ts";

/**
 * Servidor HTTP Nativo do WebhookVault.
 * Intercepta webhooks, expõe API REST e serve a UI de depuração.
 */
export class WebhookVaultServer {
  private repo: Repository;
  private replayEngine: ReplayEngine;
  private options: ServerOptions;
  private server: Server | null = null;

  constructor(repo: Repository, options: ServerOptions = {}) {
    this.repo = repo;
    this.replayEngine = new ReplayEngine(repo);
    this.options = options;
  }

  public listen(port: number = 4040, host: string = "0.0.0.0"): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));

      this.server.on("error", (err) => {
        reject(err);
      });

      this.server.listen(port, host, () => {
        const addr = this.server?.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        const url = `http://localhost:${actualPort}`;
        resolve({ port: actualPort, url });
      });
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawUrl = req.url || "/";
    const hostHeader = req.headers.host || "localhost";
    const parsedUrl = new URL(rawUrl, `http://${hostHeader}`);
    const pathname = parsedUrl.pathname;
    const method = (req.method || "GET").toUpperCase();

    // 1. Dashboard UI
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(getEmbeddedDashboardHtml());
      return;
    }

    // 2. Interceptador de Webhooks (/webhook, /webhook/:source)
    if (pathname.startsWith("/webhook")) {
      await this.handleWebhookCapture(req, res, parsedUrl);
      return;
    }

    // 3. API REST do WebhookVault
    if (pathname === "/api/webhooks" && method === "GET") {
      const source = parsedUrl.searchParams.get("source") || undefined;
      const search = parsedUrl.searchParams.get("search") || undefined;
      const limit = Number(parsedUrl.searchParams.get("limit")) || 50;
      const webhooks = this.repo.listWebhooks({ source, search, limit });
      this.sendJson(res, 200, webhooks);
      return;
    }

    if (pathname === "/api/webhooks" && method === "DELETE") {
      this.repo.clearAll();
      this.sendJson(res, 200, { status: "cleared" });
      return;
    }

    if (pathname.startsWith("/api/webhooks/") && method === "GET") {
      const parts = pathname.split("/").filter(Boolean); // ['api', 'webhooks', ':id', 'replays'?]
      const webhookId = parts[2];

      if (parts[3] === "replays") {
        const replays = this.repo.getReplaysForWebhook(webhookId);
        this.sendJson(res, 200, replays);
        return;
      }

      const wh = this.repo.getWebhookById(webhookId);
      if (!wh) {
        this.sendJson(res, 404, { error: "Webhook not found" });
        return;
      }
      this.sendJson(res, 200, wh);
      return;
    }

    if (pathname.startsWith("/api/webhooks/") && partsIncludes(pathname, "replay") && method === "POST") {
      const parts = pathname.split("/").filter(Boolean);
      const webhookId = parts[2];
      const wh = this.repo.getWebhookById(webhookId);

      if (!wh) {
        this.sendJson(res, 404, { error: "Webhook not found" });
        return;
      }

      const body = await this.readBodyAsJson(req);
      const targetUrl = body.targetUrl || "http://localhost:3000/api/webhook";
      const replayResult = await this.replayEngine.replayWebhook(wh, targetUrl, {
        recalculateHmac: body.recalculateHmac,
        secret: body.secret || this.options.defaultSecret
      });

      this.sendJson(res, 200, replayResult);
      return;
    }

    if (pathname === "/api/stats" && method === "GET") {
      const stats = this.repo.getStats();
      this.sendJson(res, 200, stats);
      return;
    }

    // Rota não encontrada
    this.sendJson(res, 404, { error: "Route not found", path: pathname });
  }

  private async handleWebhookCapture(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: URL
  ): Promise<void> {
    const rawBody = await this.readBodyAsString(req);
    const pathname = parsedUrl.pathname;
    const parts = pathname.split("/").filter(Boolean);
    const source = parts[1] || "default";

    // Extrair segredo de query string, header específico ou configuração do servidor
    const secret =
      parsedUrl.searchParams.get("secret") ||
      (req.headers["x-webhookvault-secret"] as string) ||
      this.options.defaultSecret;

    // Verificação de integridade HMAC
    const detectedProvider = HMACVerifier.detectProvider(req.headers);
    let hmacStatus: HMACStatus = "UNVERIFIED";

    if (secret && detectedProvider !== "none") {
      const vResult = HMACVerifier.verifyWebhook(req.headers, rawBody, secret, detectedProvider);
      hmacStatus = vResult.isValid ? "VALID" : "INVALID";
    }

    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ||
      req.socket.remoteAddress ||
      "127.0.0.1";

    const webhook: CapturedWebhook = {
      id: `wh_${Date.now()}_${randomUUID().slice(0, 8)}`,
      source,
      method: (req.method || "POST").toUpperCase(),
      url: req.url || "/webhook",
      headers: req.headers,
      raw_body: rawBody,
      content_type: (req.headers["content-type"] as string) || "text/plain",
      hmac_status: hmacStatus,
      hmac_provider: detectedProvider,
      client_ip: clientIp,
      created_at: new Date().toISOString()
    };

    this.repo.saveWebhook(webhook);

    this.sendJson(res, 200, {
      status: "captured",
      id: webhook.id,
      source: webhook.source,
      hmac_status: webhook.hmac_status,
      provider: webhook.hmac_provider
    });
  }

  private readBodyAsString(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", (err) => reject(err));
    });
  }

  private async readBodyAsJson(req: IncomingMessage): Promise<any> {
    const raw = await this.readBodyAsString(req);
    try {
      return JSON.parse(raw || "{}");
    } catch {
      return {};
    }
  }

  private sendJson(res: ServerResponse, status: number, data: any): void {
    const payload = JSON.stringify(data);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
      "Access-Control-Allow-Origin": "*"
    });
    res.end(payload);
  }
}

function partsIncludes(pathname: string, target: string): boolean {
  return pathname.split("/").includes(target);
}
