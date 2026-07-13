import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/api/requests/route";
import { serviceOptions } from "../landing-content";

const endpoint = "https://claw.example/api/requests";
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
  return new Request(endpoint, { method: "POST", headers, body });
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

test("production submission fails closed when durable storage is not configured", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  Object.defineProperty(process.env, "NODE_ENV", {
    value: "production",
    configurable: true,
    writable: true,
    enumerable: true,
  });
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    assert.equal((await response.json()).error, "storage_not_configured");
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
  }
});
