import { createHash } from "node:crypto";

type Bucket = {
  count: number;
  resetAt: number;
};

type RateLimitOptions = {
  limit?: number;
  windowMs?: number;
  now?: number;
};

const MAX_BUCKETS = 10_000;
const PRUNE_PER_REQUEST = 64;
const globalWithBuckets = globalThis as typeof globalThis & {
  __clawRequestAssistantRateLimit?: Map<string, Bucket>;
};
const buckets =
  globalWithBuckets.__clawRequestAssistantRateLimit ??
  (globalWithBuckets.__clawRequestAssistantRateLimit = new Map<string, Bucket>());

function integerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

export function requestAssistantRateLimitConfig() {
  return {
    limit: integerEnv("REQUEST_ASSISTANT_RATE_LIMIT", 12, 1, 100),
    windowMs: integerEnv("REQUEST_ASSISTANT_RATE_WINDOW_MS", 10 * 60 * 1000, 10_000, 60 * 60 * 1000),
  };
}

function pruneBuckets(now: number) {
  let inspected = 0;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    inspected += 1;
    if (inspected >= PRUNE_PER_REQUEST) break;
  }
}

export function checkRequestAssistantRateLimit(key: string, options: RateLimitOptions = {}) {
  const defaults = requestAssistantRateLimitConfig();
  const limit = options.limit ?? defaults.limit;
  const windowMs = options.windowMs ?? defaults.windowMs;
  const now = options.now ?? Date.now();

  pruneBuckets(now);
  const current = buckets.get(key);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };
  bucket.count += 1;

  if (!current && buckets.size >= MAX_BUCKETS) {
    const oldest = buckets.keys().next().value;
    if (oldest) buckets.delete(oldest);
  }
  buckets.delete(key);
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function requestAssistantClientKey(request: Request) {
  const trustedVercelIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  const developmentIp =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = trustedVercelIp || (process.env.NODE_ENV === "production" ? "untrusted-client" : developmentIp) || "unknown";
  return createHash("sha256").update(source).digest("hex");
}
