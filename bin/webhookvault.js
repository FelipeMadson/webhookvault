#!/usr/bin/env node

import { runCli } from "../src/cli.ts";

runCli().catch((err) => {
  console.error("Erro no WebhookVault:", err);
  process.exit(1);
});
