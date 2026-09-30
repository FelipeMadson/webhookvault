import { initDatabase } from "./storage/db.ts";
import { Repository } from "./storage/repository.ts";
import { WebhookVaultServer } from "./server/http-server.ts";
import { ReplayEngine } from "./replay/replay-engine.ts";

function parseArgs(args: string[]): { command: string; positional: string[]; options: Record<string, string> } {
  const command = args[0] || "help";
  const positional: string[] = [];
  const options: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        i++;
      } else {
        options[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, options };
}

export async function runCli(): Promise<void> {
  const { command, positional, options } = parseArgs(process.argv.slice(2));
  const dbPath = options.db || process.env.WEBHOOK_VAULT_DB || "webhookvault.db";
  const db = initDatabase(dbPath);
  const repo = new Repository(db);

  switch (command) {
    case "start": {
      const port = Number(options.port || process.env.PORT || 4040);
      const secret = options.secret || process.env.WEBHOOK_SECRET;
      const server = new WebhookVaultServer(repo, { defaultSecret: secret });

      const info = await server.listen(port);
      console.log("\n========================================================");
      console.log("⚡ WebhookVault — Local Webhook Inspector & Replayer");
      console.log("========================================================");
      console.log(`🌐 Web Inspector UI : \x1b[36m${info.url}\x1b[0m`);
      console.log(`📥 Endpoint Captura  : \x1b[32m${info.url}/webhook/:source\x1b[0m`);
      console.log(`💾 Banco SQLite      : ${dbPath} (WAL Mode)`);
      if (secret) {
        console.log(`🔑 Segredo HMAC      : [Configurado para validação automática]`);
      }
      console.log("--------------------------------------------------------");
      console.log("Pressione Ctrl+C para encerrar o servidor.");

      const shutdown = async () => {
        console.log("\nEncerrando WebhookVault...");
        await server.close();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      break;
    }

    case "list": {
      const limit = Number(options.limit || 15);
      const source = options.source;
      const webhooks = repo.listWebhooks({ limit, source });

      console.log("\n========================================================");
      console.log(`📋 Webhooks Capturados (${webhooks.length}):`);
      console.log("========================================================");

      if (webhooks.length === 0) {
        console.log("Nenhum webhook registrado ainda. Execute 'webhookvault start'.");
        return;
      }

      console.log(
        "ID".padEnd(20) +
        "MÉTODO".padEnd(8) +
        "ORIGEM".padEnd(12) +
        "HMAC".padEnd(12) +
        "DATA/HORA"
      );
      console.log("-".repeat(70));

      for (const w of webhooks) {
        const hmacColor = w.hmac_status === "VALID" ? "\x1b[32m" : w.hmac_status === "INVALID" ? "\x1b[31m" : "\x1b[90m";
        console.log(
          w.id.slice(0, 18).padEnd(20) +
          w.method.padEnd(8) +
          w.source.padEnd(12) +
          `${hmacColor}${w.hmac_status}\x1b[0m`.padEnd(20) +
          (w.created_at || "")
        );
      }
      break;
    }

    case "inspect": {
      const id = positional[0];
      if (!id) {
        console.error("❌ Erro: Informe o ID do webhook a inspecionar. Exemplo: webhookvault inspect wh_123");
        process.exit(1);
      }

      const wh = repo.getWebhookById(id);
      if (!wh) {
        console.error(`❌ Erro: Webhook com ID "${id}" não encontrado.`);
        process.exit(1);
      }

      console.log("\n========================================================");
      console.log(`🔍 Inspeção de Webhook: ${wh.id}`);
      console.log("========================================================");
      console.log(`Origem     : ${wh.source}`);
      console.log(`Método     : ${wh.method}`);
      console.log(`URL        : ${wh.url}`);
      console.log(`HMAC Status: ${wh.hmac_status} (${wh.hmac_provider || "nenhum"})`);
      console.log(`IP Origem  : ${wh.client_ip}`);
      console.log(`Recebido em: ${wh.created_at}`);

      console.log("\n--- Cabeçalhos HTTP ---");
      for (const [k, v] of Object.entries(wh.headers || {})) {
        console.log(`  ${k}: ${v}`);
      }

      console.log("\n--- Corpo Bruto (Payload) ---");
      console.log(wh.raw_body);

      const replays = repo.getReplaysForWebhook(wh.id);
      if (replays.length > 0) {
        console.log(`\n--- Histórico de Replays (${replays.length}) ---`);
        for (const r of replays) {
          const statusCol = r.status_code >= 200 && r.status_code < 300 ? "\x1b[32m" : "\x1b[31m";
          console.log(`  [${r.replayed_at}] ${r.target_url} -> ${statusCol}${r.status_code}\x1b[0m (${r.duration_ms}ms)`);
        }
      }
      break;
    }

    case "replay": {
      const id = positional[0];
      const targetUrl = options.to || "http://localhost:3000/api/webhook";
      if (!id) {
        console.error("❌ Erro: Informe o ID do webhook. Exemplo: webhookvault replay wh_123 --to http://localhost:3000/api/webhook");
        process.exit(1);
      }

      const wh = repo.getWebhookById(id);
      if (!wh) {
        console.error(`❌ Erro: Webhook com ID "${id}" não encontrado.`);
        process.exit(1);
      }

      console.log(`\n🚀 Disparando replay de ${wh.id} para ${targetUrl}...`);
      const replayEngine = new ReplayEngine(repo);
      const result = await replayEngine.replayWebhook(wh, targetUrl, {
        recalculateHmac: options["recalculate-hmac"] === "true",
        secret: options.secret
      });

      const color = result.status_code >= 200 && result.status_code < 300 ? "\x1b[32m" : "\x1b[31m";
      console.log(`✔ Resposta: ${color}HTTP ${result.status_code}\x1b[0m em ${result.duration_ms}ms`);
      if (result.response_body) {
        console.log("Corpo da Resposta:\n", result.response_body.slice(0, 500));
      }
      break;
    }

    case "clear": {
      repo.clearAll();
      console.log("✔ Histórico do WebhookVault limpo com sucesso.");
      break;
    }

    case "help":
    default: {
      console.log("\n========================================================");
      console.log("⚡ WebhookVault — CLI de Inspeção e Replay de Webhooks");
      console.log("========================================================");
      console.log("Uso:");
      console.log("  webhookvault start [--port 4040] [--secret <segredo>]");
      console.log("  webhookvault list [--limit 15] [--source <origem>]");
      console.log("  webhookvault inspect <id>");
      console.log("  webhookvault replay <id> [--to <url>] [--recalculate-hmac]");
      console.log("  webhookvault clear");
      console.log("  webhookvault help\n");
      break;
    }
  }
}

// Se invocado diretamente
if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((err) => {
    console.error("❌ Erro fatal:", err);
    process.exit(1);
  });
}
