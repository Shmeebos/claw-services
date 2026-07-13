type DurableQuotaConfig = {
  configured: boolean;
  url: string | null;
  token: string | null;
  clientLimit: number;
  windowMs: number;
  dailyAiLimit: number;
};

export type DurableQuotaDecision = {
  available: boolean;
  allowed: boolean;
  reason: "allowed" | "not-configured" | "unavailable" | "client-rate-limited" | "daily-budget-exhausted";
  remaining: number;
  retryAfterSeconds: number;
};

// One atomic command prevents separate per-client and daily checks from racing.
// Return codes: 0 = client limited, 1 = daily budget exhausted, 2 = allowed.
const quotaScript = `
local clientCount = redis.call('INCR', KEYS[1])
if clientCount == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local clientTtl = redis.call('PTTL', KEYS[1])
if clientCount > tonumber(ARGV[2]) then
  return {0, clientCount, clientTtl, -1, -1}
end
local dailyCount = redis.call('INCR', KEYS[2])
if dailyCount == 1 then redis.call('PEXPIRE', KEYS[2], ARGV[4]) end
local dailyTtl = redis.call('PTTL', KEYS[2])
if dailyCount > tonumber(ARGV[3]) then
  return {1, clientCount, clientTtl, dailyCount, dailyTtl}
end
return {2, clientCount, clientTtl, dailyCount, dailyTtl}
`.trim();

function integerEnv(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

export function durableAiQuotaConfig(): DurableQuotaConfig {
  const rawUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  let url: string | null = null;
  try {
    if (rawUrl && new URL(rawUrl).protocol === "https:") url = rawUrl.replace(/\/$/, "");
  } catch {
    url = null;
  }

  return {
    configured: Boolean(url && token && token.length >= 12),
    url,
    token: token && token.length >= 12 ? token : null,
    clientLimit: integerEnv("REQUEST_ASSISTANT_AI_RATE_LIMIT", 5, 1, 50),
    windowMs: integerEnv("REQUEST_ASSISTANT_AI_RATE_WINDOW_MS", 10 * 60 * 1000, 10_000, 60 * 60 * 1000),
    dailyAiLimit: integerEnv("REQUEST_ASSISTANT_DAILY_AI_LIMIT", 200, 1, 100_000),
  };
}

function millisecondsUntilUtcMidnight(now = Date.now()) {
  const date = new Date(now);
  const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
  return Math.max(60_000, midnight - now + 60_000);
}

function unavailable(reason: DurableQuotaDecision["reason"]): DurableQuotaDecision {
  return { available: false, allowed: false, reason, remaining: 0, retryAfterSeconds: 60 };
}

export async function checkDurableAiQuota(clientKey: string): Promise<DurableQuotaDecision> {
  const config = durableAiQuotaConfig();
  if (!config.configured || !config.url || !config.token) return unavailable("not-configured");

  const now = Date.now();
  const dateKey = new Date(now).toISOString().slice(0, 10);
  const command = [
    "EVAL",
    quotaScript,
    "2",
    `claw:{request-assistant}:client:${clientKey}`,
    `claw:{request-assistant}:daily:${dateKey}`,
    String(config.windowMs),
    String(config.clientLimit),
    String(config.dailyAiLimit),
    String(millisecondsUntilUtcMidnight(now)),
  ];

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return unavailable("unavailable");

    const payload = (await response.json()) as { result?: unknown };
    if (!Array.isArray(payload.result) || payload.result.length < 5) return unavailable("unavailable");
    const [code, clientCount, clientTtl, dailyCount, dailyTtl] = payload.result.map(Number);
    if (![code, clientCount, clientTtl, dailyCount, dailyTtl].every(Number.isFinite)) {
      return unavailable("unavailable");
    }

    if (code === 0) {
      return {
        available: true,
        allowed: false,
        reason: "client-rate-limited",
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(clientTtl / 1000)),
      };
    }
    if (code === 1) {
      return {
        available: true,
        allowed: false,
        reason: "daily-budget-exhausted",
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil(dailyTtl / 1000)),
      };
    }
    if (code !== 2) return unavailable("unavailable");

    return {
      available: true,
      allowed: true,
      reason: "allowed",
      remaining: Math.max(0, Math.min(config.clientLimit - clientCount, config.dailyAiLimit - dailyCount)),
      retryAfterSeconds: Math.max(1, Math.ceil(clientTtl / 1000)),
    };
  } catch {
    return unavailable("unavailable");
  }
}
