/**
 * Tipagens do WebhookVault.
 */

export type HMACStatus = "VALID" | "INVALID" | "UNVERIFIED";

export type HMACProvider = "github" | "stripe" | "shopify" | "generic" | "none";

export interface CapturedWebhook {
  id: string;
  source: string;
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  raw_body: string;
  content_type: string;
  hmac_status: HMACStatus;
  hmac_provider?: HMACProvider;
  client_ip?: string;
  created_at?: string;
}

export interface ReplayLog {
  id: string;
  webhook_id: string;
  target_url: string;
  status_code: number;
  response_headers: Record<string, string | string[] | undefined>;
  response_body: string;
  duration_ms: number;
  replayed_at?: string;
}

export interface HMACVerificationResult {
  isValid: boolean;
  provider: HMACProvider;
  reason?: string;
}

export interface ReplayOptions {
  headers?: Record<string, string>;
  recalculateHmac?: boolean;
  secret?: string;
  timeoutMs?: number;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  defaultSecret?: string;
}

export interface VaultStats {
  totalWebhooks: number;
  validHmacCount: number;
  invalidHmacCount: number;
  unverifiedHmacCount: number;
  totalReplays: number;
  lastWebhookTimestamp?: string;
}
