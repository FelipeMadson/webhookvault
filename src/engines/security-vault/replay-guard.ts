/**
 * Replay Attack Guard with Tolerance Window Drift Validation
 * and Atomic Nonce Tracking Cache with Automated TTL Pruning.
 * Author: Felipe Madison (@FelipeMadson)
 */
export interface ReplayGuardOptions {
  toleranceWindowMs?: number; // default: 300_000 (5 minutes)
  futureToleranceMs?: number;  // default: 60_000 (1 minute)
  maxCacheSize?: number;       // default: 100_000
}

export interface ReplayCheckResult {
  allowed: boolean;
  reason?: "TIMESTAMP_EXPIRED" | "FUTURE_TIMESTAMP_DRIFT" | "REPLAY_NONCE_ALREADY_USED" | "INVALID_NONCE";
  ageMs?: number;
}

export interface NonceRecord {
  nonce: string;
  timestampMs: number;
  expiresAtMs: number;
}

export interface IReplayAttackGuard {
  checkAndRegister(nonce: string, timestampMs: number, nowMs?: number): ReplayCheckResult;
  pruneExpired(nowMs?: number): number;
  has(nonce: string): boolean;
  size(): number;
  clear(): void;
}

export class ReplayAttackGuard implements IReplayAttackGuard {
  private toleranceWindowMs: number;
  private futureToleranceMs: number;
  private maxCacheSize: number;
  private nonceCache: Map<string, NonceRecord> = new Map();

  constructor(options?: ReplayGuardOptions) {
    this.toleranceWindowMs = options?.toleranceWindowMs ?? 300_000;
    this.futureToleranceMs = options?.futureToleranceMs ?? 60_000;
    this.maxCacheSize = options?.maxCacheSize ?? 100_000;
  }

  public checkAndRegister(nonce: string, timestampMs: number, nowMs = Date.now()): ReplayCheckResult {
    if (!nonce || typeof nonce !== "string" || nonce.trim().length === 0) {
      return { allowed: false, reason: "INVALID_NONCE" };
    }

    const cleanNonce = nonce.trim();
    const ageMs = nowMs - timestampMs;

    // 1. Past expiration check
    if (ageMs > this.toleranceWindowMs) {
      return { allowed: false, reason: "TIMESTAMP_EXPIRED", ageMs };
    }

    // 2. Future timestamp drift check (clock skew)
    if (timestampMs - nowMs > this.futureToleranceMs) {
      return { allowed: false, reason: "FUTURE_TIMESTAMP_DRIFT", ageMs };
    }

    // 3. Replay nonce check
    if (this.nonceCache.has(cleanNonce)) {
      return { allowed: false, reason: "REPLAY_NONCE_ALREADY_USED", ageMs };
    }

    // 4. Memory bounds check
    if (this.nonceCache.size >= this.maxCacheSize) {
      this.pruneExpired(nowMs);
      if (this.nonceCache.size >= this.maxCacheSize) {
        // Evict oldest entry to prevent denial of service
        const oldestKey = this.nonceCache.keys().next().value;
        if (oldestKey) this.nonceCache.delete(oldestKey);
      }
    }

    // 5. Atomic registration
    const expiresAtMs = timestampMs + this.toleranceWindowMs;
    this.nonceCache.set(cleanNonce, {
      nonce: cleanNonce,
      timestampMs,
      expiresAtMs
    });

    return { allowed: true, ageMs };
  }

  public pruneExpired(nowMs = Date.now()): number {
    let prunedCount = 0;
    for (const [nonce, record] of this.nonceCache.entries()) {
      if (record.expiresAtMs <= nowMs) {
        this.nonceCache.delete(nonce);
        prunedCount++;
      }
    }
    return prunedCount;
  }

  public has(nonce: string): boolean {
    return this.nonceCache.has(nonce.trim());
  }

  public size(): number {
    return this.nonceCache.size;
  }

  public clear(): void {
    this.nonceCache.clear();
  }
}
