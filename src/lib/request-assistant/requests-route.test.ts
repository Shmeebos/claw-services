import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import test from "node:test";
import { GET, POST } from "../../app/api/requests/route";
import { serviceOptions } from "../landing-content";

const endpoint = "https://claw.example/api/requests";
const syntheticCredential = ["sk", "test", "A".repeat(48)].join("-");
const validPayload = {
  name: "Acme Studio",
  email: "hello@acme.example",
  businessUrl: "",
  service: serviceOptions[0],
  request: "Build a clear launch page for our consulting offer.",
  budget: "",
  timeline: "",
  honeypot: "",
};

function request(headers: Record<string, string>, body = JSON.stringify(validPayload)) {
  return new Request(endpoint, {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID(), ...headers },
    body,
  });
}

const storageEnvNames = [
  "NODE_ENV",
  "REQUEST_SUBMISSION_ENABLED",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLAW_ALLOW_LOCAL_REQUEST_STORAGE",
  "RESEND_API_KEY",
  "CLAW_REQUEST_TO_EMAIL",
  "CLAW_REQUEST_FROM_EMAIL",
] as const;

type StorageEnvName = (typeof storageEnvNames)[number];

function snapshotStorageEnv() {
  return Object.fromEntries(
    storageEnvNames.map((name) => [name, process.env[name]]),
  ) as Record<StorageEnvName, string | undefined>;
}

function restoreStorageEnv(snapshot: Record<StorageEnvName, string | undefined>) {
  const mutableEnv = process.env as Record<string, string | undefined>;
  for (const name of storageEnvNames) {
    const value = snapshot[name];
    if (value === undefined) delete mutableEnv[name];
    else mutableEnv[name] = value;
  }
}

function configureStorageEnv(nodeEnv: string, localFallback?: string) {
  const mutableEnv = process.env as Record<string, string | undefined>;
  mutableEnv.NODE_ENV = nodeEnv;
  delete mutableEnv.REQUEST_SUBMISSION_ENABLED;
  delete mutableEnv.NEXT_PUBLIC_SUPABASE_URL;
  delete mutableEnv.SUPABASE_SERVICE_ROLE_KEY;
  delete mutableEnv.RESEND_API_KEY;
  delete mutableEnv.CLAW_REQUEST_TO_EMAIL;
  delete mutableEnv.CLAW_REQUEST_FROM_EMAIL;
  if (localFallback === undefined) delete mutableEnv.CLAW_ALLOW_LOCAL_REQUEST_STORAGE;
  else mutableEnv.CLAW_ALLOW_LOCAL_REQUEST_STORAGE = localFallback;
}

function submissionHeaders(ip: string, extra: Record<string, string> = {}) {
  return {
    "content-type": "application/json",
    origin: "https://claw.example",
    "sec-fetch-site": "same-origin",
    "x-vercel-forwarded-for": ip,
    ...extra,
  };
}

async function withLocalStorageSpy<T>(
  callback: (writes: Array<{ filePath: string; content: string }>) => Promise<T>,
) {
  const originalMkdir = fs.mkdir;
  const originalReadFile = fs.readFile;
  const originalWriteFile = fs.writeFile;
  const originalRename = fs.rename;
  const writes: Array<{ filePath: string; content: string }> = [];
  let currentContent: string | undefined;

  fs.mkdir = (async () => undefined) as typeof fs.mkdir;
  fs.readFile = (async () => {
    if (currentContent !== undefined) return currentContent;
    const error = new Error("Synthetic missing local request file") as NodeJS.ErrnoException;
    error.code = "ENOENT";
    throw error;
  }) as unknown as typeof fs.readFile;
  fs.writeFile = (async (filePath, content) => {
    currentContent = String(content);
    writes.push({ filePath: String(filePath), content: currentContent });
  }) as typeof fs.writeFile;
  fs.rename = (async () => undefined) as typeof fs.rename;

  try {
    return await callback(writes);
  } finally {
    fs.mkdir = originalMkdir;
    fs.readFile = originalReadFile;
    fs.writeFile = originalWriteFile;
    fs.rename = originalRename;
  }
}

async function startFailingSupabaseServer() {
  let capturedBody = "";
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    incoming.on("end", () => {
      capturedBody += Buffer.concat(chunks).toString("utf8");
      outgoing.writeHead(500, { "content-type": "application/json" });
      outgoing.end(JSON.stringify({
        message: "synthetic provider body that must not be logged",
        code: "SYNTHETIC_PROVIDER_DETAIL",
      }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    capturedBody: () => capturedBody,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function startSuccessfulSupabaseServer() {
  const capturedBodies: Array<Record<string, unknown>> = [];
  const capturedPaths: string[] = [];
  const requestId = "30000000-0000-4000-8000-000000000001";
  const server = createServer((incoming, outgoing) => {
    const chunks: Buffer[] = [];
    incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    incoming.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
      capturedBodies.push(body);
      capturedPaths.push(incoming.url ?? "");
      outgoing.writeHead(200, { "content-type": "application/json" });
      outgoing.end(JSON.stringify([{
        request_id: requestId,
        was_created: capturedBodies.length === 1,
        accepted_at: "2026-07-30T20:00:00.000Z",
        brief: body.p_brief,
        notification_states: [
          { recipient_type: "customer", status: "pending" },
          { recipient_type: "team", status: "pending" },
        ],
      }]));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return {
    url: `http://127.0.0.1:${address.port}`,
    capturedBodies,
    capturedPaths,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("canonical submission rejects browser-simple and cross-site requests", async () => {
  const plainText = await POST(
    request({
      "content-type": "text/plain",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }),
  );
  assert.equal(plainText.status, 415);

  const crossSite = await POST(
    request({
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }),
  );
  assert.equal(crossSite.status, 403);
});

test("canonical submission rejects oversized bodies before parsing", async () => {
  const response = await POST(
    request(
      {
        "content-type": "application/json",
        origin: "https://claw.example",
        "sec-fetch-site": "same-origin",
        "x-vercel-forwarded-for": "203.0.113.41",
      },
      JSON.stringify({ ...validPayload, request: "x".repeat(17 * 1024) }),
    ),
  );
  assert.equal(response.status, 413);
});

test("canonical submission requires a UUID idempotency key", async () => {
  const missing = new Request(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://claw.example",
      "sec-fetch-site": "same-origin",
      "x-vercel-forwarded-for": "203.0.113.40",
    },
    body: JSON.stringify(validPayload),
  });
  const invalid = request(
    submissionHeaders("203.0.113.41", { "idempotency-key": "not-a-uuid" }),
  );

  for (const candidate of [missing, invalid]) {
    const response = await POST(candidate);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      ok: false,
      error: "invalid_idempotency_key",
    });
  }
});

test("canonical submission rejects consent modes that are not enabled", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("development", "true");

  try {
    await withLocalStorageSpy(async (writes) => {
      for (const [index, consents] of [
        {
          aiProcessing: false,
          productAnalytics: true,
          modelTraining: false,
        },
        {
          aiProcessing: false,
          productAnalytics: false,
          modelTraining: true,
        },
      ].entries()) {
        const response = await POST(request(
          submissionHeaders(`203.0.113.${61 + index}`),
          JSON.stringify({ ...validPayload, consents }),
        ));
        assert.equal(response.status, 422);
        assert.deepEqual(await response.json(), {
          ok: false,
          error: "consent_not_available",
        });
      }
      assert.equal(writes.length, 0);
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("canonical submission blocks sensitive task content before local storage", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("development", "true");

  try {
    await withLocalStorageSpy(async (writes) => {
      const samples = [
        {
          ip: "203.0.113.43",
          payload: {
            ...validPayload,
            request: `Configure the launch with ${syntheticCredential} before handoff.`,
          },
        },
        {
          ip: "203.0.113.44",
          payload: {
            ...validPayload,
            budget: "Charge test card 4242 4242 4242 4242",
          },
        },
      ];
      const results: Array<{ status: number; body: unknown }> = [];

      for (const sample of samples) {
        const response = await POST(
          request(
            submissionHeaders(sample.ip),
            JSON.stringify(sample.payload),
          ),
        );
        results.push({ status: response.status, body: await response.json() });
      }

      assert.deepEqual(results, [
        { status: 422, body: { ok: false, error: "sensitive_content_detected" } },
        { status: 422, body: { ok: false, error: "sensitive_content_detected" } },
      ]);
      assert.equal(writes.length, 0, "sensitive task content reached local storage");
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("canonical submission does not scan normal identity fields", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("production", "true");
  process.env.REQUEST_SUBMISSION_ENABLED = "true";

  try {
    const response = await POST(
      request(
        submissionHeaders("203.0.113.45"),
        JSON.stringify({
          ...validPayload,
          name: `${syntheticCredential}`,
          businessUrl: "https://example.test/profile?token=1234567890abcdef",
        }),
      ),
    );

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { ok: false, error: "storage_not_configured" });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("development submission fails closed unless local storage is explicitly enabled", async () => {
  const originalEnv = snapshotStorageEnv();

  try {
    await withLocalStorageSpy(async (writes) => {
      const results: Array<{ flag: string; status: number; body: unknown }> = [];
      for (const [index, flag] of [undefined, "false"].entries()) {
        configureStorageEnv("development", flag);
        const response = await POST(
          request(submissionHeaders(`203.0.113.${46 + index}`)),
        );
        results.push({
          flag: flag ?? "missing",
          status: response.status,
          body: await response.json(),
        });
      }

      assert.deepEqual(results, [
        {
          flag: "missing",
          status: 503,
          body: { ok: false, error: "storage_not_configured" },
        },
        {
          flag: "false",
          status: 503,
          body: { ok: false, error: "storage_not_configured" },
        },
      ]);
      assert.equal(writes.length, 0, "disabled local fallback reached the filesystem");
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("explicit development fallback stores minimized metadata", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("development", "true");
  const syntheticUserAgent = "synthetic-sensitive-user-agent";

  try {
    await withLocalStorageSpy(async (writes) => {
      const response = await POST(
        request(
          submissionHeaders("203.0.113.48", { "user-agent": syntheticUserAgent }),
        ),
      );
      const body = await response.json();

      assert.equal(response.status, 201);
      assert.equal(body.ok, true);
      assert.equal(body.storage?.mode, "local-json");
      assert.equal(body.storage?.wasCreated, true);
      assert.deepEqual(body.notifications, {
        customer: "not_queued",
        team: "not_queued",
      });
      assert.equal(writes.length, 1);

      const stored = JSON.parse(writes[0].content) as Array<{
        metadata: Record<string, unknown>;
      }>;
      assert.deepEqual(stored[0].metadata, { assistant_mode: "guided" });
      assert.doesNotMatch(writes[0].content, new RegExp(syntheticUserAgent));
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("development fallback replays one idempotency key without a duplicate record", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("development", "true");
  const idempotencyKey = "10000000-0000-4000-8000-000000000001";

  try {
    await withLocalStorageSpy(async (writes) => {
      const headers = submissionHeaders("203.0.113.58", {
        "idempotency-key": idempotencyKey,
      });
      const first = await POST(request(headers));
      const second = await POST(request(headers));
      const firstBody = await first.json();
      const secondBody = await second.json();

      assert.equal(first.status, 201);
      assert.equal(second.status, 200);
      assert.equal(firstBody.requestId, secondBody.requestId);
      assert.equal(firstBody.storage.wasCreated, true);
      assert.equal(secondBody.storage.wasCreated, false);
      assert.equal(writes.length, 1, "idempotent replay rewrote local storage");
      assert.equal(JSON.parse(writes[0].content).length, 1);
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("development fallback rejects a changed payload under the same idempotency key", async () => {
  const originalEnv = snapshotStorageEnv();
  configureStorageEnv("development", "true");
  const idempotencyKey = "10000000-0000-4000-8000-000000000002";

  try {
    await withLocalStorageSpy(async (writes) => {
      const headers = submissionHeaders("203.0.113.59", {
        "idempotency-key": idempotencyKey,
      });
      const first = await POST(request(headers));
      const conflict = await POST(request(
        headers,
        JSON.stringify({
          ...validPayload,
          request: "Build a materially different operator workflow for this launch.",
        }),
      ));

      assert.equal(first.status, 201);
      assert.equal(conflict.status, 409);
      assert.deepEqual(await conflict.json(), {
        ok: false,
        error: "idempotency_conflict",
      });
      assert.equal(writes.length, 1);
    });
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("request readiness reports the explicit local fallback gate", async () => {
  const originalEnv = snapshotStorageEnv();

  try {
    configureStorageEnv("development");
    const disabled = await GET();
    assert.deepEqual(await disabled.json(), {
      ok: false,
      storage: "unavailable",
      submissionEnabled: true,
      contract: "v1",
      acceptance: "claw_accept_request_v1",
      notificationOutbox: "schema-ready-worker-not-configured",
      resendConfigured: false,
      requiredEnv: [
        "NEXT_PUBLIC_SUPABASE_URL",
        "SUPABASE_SERVICE_ROLE_KEY",
        "REQUEST_SUBMISSION_ENABLED",
        "CLAW_ALLOW_LOCAL_REQUEST_STORAGE",
        "RESEND_API_KEY",
        "CLAW_REQUEST_TO_EMAIL",
        "CLAW_REQUEST_FROM_EMAIL",
      ],
    });

    configureStorageEnv("development", "true");
    const enabled = await GET();
    assert.equal((await enabled.json()).storage, "local-json-development");

    configureStorageEnv("production", "true");
    const production = await GET();
    const productionBody = await production.json();
    assert.equal(productionBody.ok, false);
    assert.equal(productionBody.storage, "unavailable");
  } finally {
    restoreStorageEnv(originalEnv);
  }
});

test("Supabase acceptance uses the atomic RPC and returns its canonical receipt", async () => {
  const originalEnv = snapshotStorageEnv();
  const supabase = await startSuccessfulSupabaseServer();
  configureStorageEnv("test");
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabase.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key";
  const idempotencyKey = "10000000-0000-4000-8000-000000000003";
  const headers = submissionHeaders("203.0.113.60", {
    "idempotency-key": idempotencyKey,
  });

  try {
    const first = await POST(request(headers));
    const replay = await POST(request(headers));
    const firstBody = await first.json();
    const replayBody = await replay.json();

    assert.equal(first.status, 201);
    assert.equal(replay.status, 200);
    assert.equal(firstBody.requestId, replayBody.requestId);
    assert.deepEqual(firstBody.notifications, {
      customer: "pending",
      team: "pending",
    });
    assert.equal(firstBody.storage.wasCreated, true);
    assert.equal(replayBody.storage.wasCreated, false);
    assert.deepEqual(
      supabase.capturedPaths,
      ["/rest/v1/rpc/claw_accept_request_v1", "/rest/v1/rpc/claw_accept_request_v1"],
    );

    const [firstRpc, replayRpc] = supabase.capturedBodies;
    assert.equal(firstRpc.p_idempotency_key, idempotencyKey);
    assert.equal(firstRpc.p_source, undefined);
    assert.equal(firstRpc.p_status, undefined);
    assert.equal(firstRpc.p_ai_granted, false);
    assert.equal(firstRpc.p_analytics_granted, false);
    assert.equal(firstRpc.p_training_granted, false);
    assert.deepEqual(firstRpc.p_metadata, {
      assistant_mode: "guided",
      landing_path: "/request",
    });
    assert.equal(firstRpc.p_session_id, replayRpc.p_session_id);
    assert.equal(firstRpc.p_correlation_id, replayRpc.p_correlation_id);
    assert.doesNotMatch(JSON.stringify(firstRpc), /user-agent|203\\.0\\.113\\.60/);
  } finally {
    restoreStorageEnv(originalEnv);
    await supabase.close();
  }
});

test("Supabase failures fail closed without local fallback and use bounded logs", async () => {
  const originalEnv = snapshotStorageEnv();
  const failingSupabase = await startFailingSupabaseServer();
  const originalConsoleError = console.error;
  const logs: unknown[][] = [];
  configureStorageEnv("development");
  process.env.NEXT_PUBLIC_SUPABASE_URL = failingSupabase.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-service-role-key";
  console.error = (...args: unknown[]) => { logs.push(args); };

  try {
    await withLocalStorageSpy(async (writes) => {
      const syntheticUserAgent = "remote-sensitive-user-agent";
      const response = await POST(
        request(
          submissionHeaders("203.0.113.49", { "user-agent": syntheticUserAgent }),
        ),
      );

      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { ok: false, error: "storage_unavailable" });
      assert.equal(writes.length, 0, "Supabase failure reached disabled local storage");
      assert.doesNotMatch(failingSupabase.capturedBody(), new RegExp(syntheticUserAgent));
      assert.match(failingSupabase.capturedBody(), /"p_metadata":\{"assistant_mode":"guided","landing_path":"\/request"\}/);
      assert.equal(logs.length, 1);
      assert.equal(logs[0][0], "request_storage_failed");
      assert.deepEqual(Object.keys(logs[0][1] as Record<string, unknown>), ["code"]);
      assert.equal((logs[0][1] as Record<string, unknown>).code, "storage_unavailable");
      assert.doesNotMatch(JSON.stringify(logs), /synthetic provider body|SYNTHETIC_PROVIDER_DETAIL/);
    });
  } finally {
    console.error = originalConsoleError;
    restoreStorageEnv(originalEnv);
    await failingSupabase.close();
  }
});

test("production submission fails closed when durable storage is not configured", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalLocalFallback = process.env.CLAW_ALLOW_LOCAL_REQUEST_STORAGE;
  const originalSubmissionEnabled = process.env.REQUEST_SUBMISSION_ENABLED;

  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    configurable: true,
    writable: true,
    enumerable: true,
  });
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.REQUEST_SUBMISSION_ENABLED;
  process.env.CLAW_ALLOW_LOCAL_REQUEST_STORAGE = "true";

  try {
    const response = await POST(
      request({
        "content-type": "application/json",
        origin: "https://claw.example",
        "sec-fetch-site": "same-origin",
        "x-vercel-forwarded-for": "203.0.113.42",
      }),
    );
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, "submission_disabled");
  } finally {
    Object.defineProperty(process.env, "NODE_ENV", {
      value: originalNodeEnv,
      configurable: true,
      writable: true,
      enumerable: true,
    });
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    if (originalLocalFallback === undefined) delete process.env.CLAW_ALLOW_LOCAL_REQUEST_STORAGE;
    else process.env.CLAW_ALLOW_LOCAL_REQUEST_STORAGE = originalLocalFallback;
    if (originalSubmissionEnabled === undefined) delete process.env.REQUEST_SUBMISSION_ENABLED;
    else process.env.REQUEST_SUBMISSION_ENABLED = originalSubmissionEnabled;
  }
});
