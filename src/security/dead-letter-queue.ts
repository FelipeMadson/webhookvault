/**
 * Dead-Letter Queue (DLQ) Engine with L1 In-Memory Ring Buffer,
 * Poison Pill Isolation, and Decorrelated Jitter Exponential Backoff.
 * Author: Felipe Madison (@FelipeMadson)
 */
import { randomUUID } from "node:crypto";

export type DLQMessageStatus = "PENDING" | "RETRYING" | "RESOLVED" | "POISON_PILL" | "EXHAUSTED";

export interface DLQMessage {
  id: string;
  source: string;
  payload: string;
  headers: Record<string, string>;
  errorReason: string;
  status: DLQMessageStatus;
  isPoisonPill: boolean;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: number;
  enqueuedAt: number;
  resolvedAt?: number;
  lastAttemptAt?: number;
}

export interface DLQEnqueueInput {
  source: string;
  payload: string | object;
  headers?: Record<string, string>;
  errorReason: string;
  isPoisonPill?: boolean;
  maxRetries?: number;
  status?: DLQMessageStatus;
}

export interface DLQOptions {
  capacity?: number;
  maxRetries?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  jitterFactor?: number;
}

export interface IDeadLetterQueueEngine {
  enqueue(input: DLQEnqueueInput, nowMs?: number): string;
  getPendingRetries(nowMs?: number): DLQMessage[];
  markResolved(id: string, nowMs?: number): boolean;
  getPoisonPills(): DLQMessage[];
  purge(filter?: { status?: DLQMessageStatus | string; olderThanMs?: number }, nowMs?: number): number;
  markFailure(id: string, errorReason: string, forcePoisonPill?: boolean, nowMs?: number): DLQMessage | null;
  getMessage(id: string): DLQMessage | undefined;
  size(): number;
}

export class DeadLetterQueueEngine implements IDeadLetterQueueEngine {
  private capacity: number;
  private defaultMaxRetries: number;
  private baseBackoffMs: number;
  private maxBackoffMs: number;
  private jitterFactor: number;
  private ringBuffer: Array<DLQMessage | null>;
  private writePointer = 0;
  private messageMap: Map<string, DLQMessage> = new Map();

  constructor(options?: DLQOptions) {
    this.capacity = options?.capacity ?? 1024;
    this.defaultMaxRetries = options?.maxRetries ?? 5;
    this.baseBackoffMs = options?.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options?.maxBackoffMs ?? 60_000;
    this.jitterFactor = options?.jitterFactor ?? 0.2;
    this.ringBuffer = new Array<DLQMessage | null>(this.capacity).fill(null);
  }

  public computeBackoff(attempt: number): number {
    const rawBackoff = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, attempt));
    const jitter = 1 - this.jitterFactor + (2 * this.jitterFactor * Math.random());
    return Math.floor(rawBackoff * jitter);
  }

  public enqueue(input: DLQEnqueueInput, nowMs = Date.now()): string {
    const id = `dlq_${nowMs}_${randomUUID().slice(0, 8)}`;
    const isPoisonPill = !!input.isPoisonPill;
    const maxRetries = input.maxRetries ?? this.defaultMaxRetries;

    const payloadStr = typeof input.payload === "string" ? input.payload : JSON.stringify(input.payload);

    const message: DLQMessage = {
      id,
      source: input.source,
      payload: payloadStr,
      headers: input.headers || {},
      errorReason: input.errorReason,
      status: isPoisonPill ? "POISON_PILL" : (input.status ?? "PENDING"),
      isPoisonPill,
      retryCount: 0,
      maxRetries,
      nextRetryAt: isPoisonPill ? undefined : nowMs + this.computeBackoff(0),
      enqueuedAt: nowMs
    };

    const oldMsg = this.ringBuffer[this.writePointer];
    if (oldMsg) {
      this.messageMap.delete(oldMsg.id);
    }

    this.ringBuffer[this.writePointer] = message;
    this.messageMap.set(id, message);
    this.writePointer = (this.writePointer + 1) % this.capacity;

    return id;
  }

  public getPendingRetries(nowMs = Date.now()): DLQMessage[] {
    const retries: DLQMessage[] = [];
    for (const msg of this.messageMap.values()) {
      if (!msg.isPoisonPill && (msg.status === "PENDING" || msg.status === "RETRYING")) {
        if (msg.nextRetryAt !== undefined && msg.nextRetryAt <= nowMs) {
          retries.push(msg);
        }
      }
    }
    return retries.sort((a, b) => (a.nextRetryAt || 0) - (b.nextRetryAt || 0));
  }

  public markFailure(id: string, errorReason: string, forcePoisonPill = false, nowMs = Date.now()): DLQMessage | null {
    const msg = this.messageMap.get(id);
    if (!msg) return null;

    msg.retryCount += 1;
    msg.lastAttemptAt = nowMs;
    msg.errorReason = errorReason;

    if (forcePoisonPill || msg.retryCount >= msg.maxRetries) {
      msg.isPoisonPill = true;
      msg.status = forcePoisonPill ? "POISON_PILL" : "EXHAUSTED";
      msg.nextRetryAt = undefined;
    } else {
      msg.status = "RETRYING";
      msg.nextRetryAt = nowMs + this.computeBackoff(msg.retryCount);
    }

    return msg;
  }

  public markResolved(id: string, nowMs = Date.now()): boolean {
    const msg = this.messageMap.get(id);
    if (!msg) return false;
    msg.status = "RESOLVED";
    msg.resolvedAt = nowMs;
    msg.nextRetryAt = undefined;
    return true;
  }

  public getPoisonPills(): DLQMessage[] {
    const pills: DLQMessage[] = [];
    for (const msg of this.messageMap.values()) {
      if (msg.isPoisonPill) {
        pills.push(msg);
      }
    }
    return pills;
  }

  public getMessage(id: string): DLQMessage | undefined {
    return this.messageMap.get(id);
  }

  public purge(filter?: { status?: DLQMessageStatus | string; olderThanMs?: number }, nowMs = Date.now()): number {
    let purgedCount = 0;
    for (const [id, msg] of this.messageMap.entries()) {
      let shouldPurge = true;
      if (filter?.status && msg.status !== filter.status) {
        shouldPurge = false;
      }
      if (filter?.olderThanMs && (nowMs - msg.enqueuedAt) < filter.olderThanMs) {
        shouldPurge = false;
      }
      if (shouldPurge) {
        this.messageMap.delete(id);
        purgedCount++;
      }
    }
    return purgedCount;
  }

  public size(): number {
    return this.messageMap.size;
  }
}
