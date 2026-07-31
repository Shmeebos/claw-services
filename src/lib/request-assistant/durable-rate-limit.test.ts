import assert from "node:assert/strict";
import test from "node:test";
import {
  checkDurableAiQuota,
  durableAiQuotaConfig,
  localAiQuotaOverrideEnabled,
} from "./durable-rate-limit";

const envNames = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "REQUEST_ASSISTANT_AI_RATE_LIMIT",
  "REQUEST_ASSISTANT_DAILY_AI_LIMIT",
] as const;

function snapshotEnv() {
  return Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const name of envNames) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("AI quota fails closed when distributed storage is not configured", async () => {
  const snapshot = snapshotEnv();
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  try {
    assert.equal(durableAiQuotaConfig().configured, false);
    const result = await checkDurableAiQuota("client-key");
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "not-configured");
  } finally {
    restoreEnv(snapshot);
  }
});

test("local AI override is explicit and never active in production", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalOverride = process.env.REQUEST_ASSISTANT_ALLOW_LOCAL_AI;
  try {
    mutableEnv.NODE_ENV = "development";
    process.env.REQUEST_ASSISTANT_ALLOW_LOCAL_AI = "true";
    assert.equal(localAiQuotaOverrideEnabled(), true);

    mutableEnv.NODE_ENV = "production";
    assert.equal(localAiQuotaOverrideEnabled(), false);
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    if (originalOverride === undefined) delete process.env.REQUEST_ASSISTANT_ALLOW_LOCAL_AI;
    else process.env.REQUEST_ASSISTANT_ALLOW_LOCAL_AI = originalOverride;
  }
});

test("distributed quota atomically checks client and daily limits", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  let command: unknown[] = [];

  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-with-enough-length";
  process.env.REQUEST_ASSISTANT_AI_RATE_LIMIT = "5";
  process.env.REQUEST_ASSISTANT_DAILY_AI_LIMIT = "200";
  globalThis.fetch = async (_input, init) => {
    command = JSON.parse(String(init?.body)) as unknown[];
    return new Response(JSON.stringify({ result: [2, 1, 600000, 1, 3600000] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await checkDurableAiQuota("client-key");
    assert.equal(result.allowed, true);
    assert.equal(command[0], "EVAL");
    assert.equal(command[2], "2");
    assert.match(String(command[3]), /\{request-assistant\}:client:client-key$/);
    assert.match(String(command[4]), /\{request-assistant\}:daily:\d{4}-\d{2}-\d{2}$/);
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("daily budget exhaustion blocks provider work", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-with-enough-length";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ result: [1, 2, 500000, 201, 7200000] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  try {
    const result = await checkDurableAiQuota("client-key");
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "daily-budget-exhausted");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});

test("distributed quota fails closed when Redis is unavailable", async () => {
  const snapshot = snapshotEnv();
  const originalFetch = globalThis.fetch;
  process.env.UPSTASH_REDIS_REST_URL = "https://redis.example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "test-token-with-enough-length";
  globalThis.fetch = async () => {
    throw new Error("network unavailable");
  };

  try {
    const result = await checkDurableAiQuota("client-key");
    assert.equal(result.allowed, false);
    assert.equal(result.reason, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    restoreEnv(snapshot);
  }
});
