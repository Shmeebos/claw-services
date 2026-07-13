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

const globalWithBuckets = globalThis as typeof globalThis & {
  __clawRequestAssistantBuckets?: Map<string, Bucket>;
};

const buckets =
  globalWithBuckets.__clawRequestAssistantBuckets ??
  (globalWithBuckets.__clawRequestAssistantBuckets = new Map<string, Bucket>());

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function requestAssistantRateLimitConfig() {
  return {
    limit: readPositiveInteger(process.env.REQUEST_ASSISTANT_RATE_LIMIT, 12),
    windowMs: readPositiveInteger(process.env.REQUEST_ASSISTANT_RATE_WINDOW_MS, 10 * 60 * 1000),
  };
}

export function clientRateLimitKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = forwarded || request.headers.get("x-real-ip") || `unknown:${request.headers.get("user-agent") ?? "none"}`;
  return createHash("sha256").update(source).digest("hex");
}

export function checkRequestAssistantRateLimit(key: string, options: RateLimitOptions = {}) {
  const defaults = requestAssistantRateLimitConfig();
  const limit = options.limit ?? defaults.limit;
  const windowMs = options.windowMs ?? defaults.windowMs;
  const now = options.now ?? Date.now();

  if (buckets.size > 10_000) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const current = buckets.get(key);
  const bucket = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
  bucket.count += 1;
  buckets.set(key, bucket);

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}
