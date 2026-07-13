import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ASSISTANT_BODY_BYTES,
  readRequestBodyWithLimit,
  validateRequestPolicy,
} from "./request-policy";

const endpoint = "https://claw.example/api/request-assistant";

function postRequest(headers: Record<string, string>, body = "{}") {
  return new Request(endpoint, { method: "POST", headers, body });
}

test("same-origin application/json requests are accepted", () => {
  const failure = validateRequestPolicy(
    postRequest({
      "content-type": "application/json; charset=utf-8",
      origin: "https://claw.example",
      "sec-fetch-site": "same-origin",
    }),
  );
  assert.equal(failure, null);
});

test("browser-simple content types are rejected before parsing", () => {
  const failure = validateRequestPolicy(
    postRequest({
      "content-type": "text/plain",
      origin: "https://claw.example",
    }),
  );
  assert.equal(failure?.status, 415);
  assert.equal(failure?.error, "unsupported_media_type");
});

test("cross-site and unverified same-site requests are rejected", () => {
  const crossSite = validateRequestPolicy(
    postRequest({
      "content-type": "application/json",
      origin: "https://attacker.example",
      "sec-fetch-site": "cross-site",
    }),
  );
  const sameSiteWithoutOrigin = validateRequestPolicy(
    postRequest({
      "content-type": "application/json",
      "sec-fetch-site": "same-site",
    }),
  );

  assert.equal(crossSite?.status, 403);
  assert.equal(sameSiteWithoutOrigin?.status, 403);
});

test("body reading stops once the byte cap is crossed", async () => {
  const request = postRequest(
    { "content-type": "application/json" },
    JSON.stringify({ content: "x".repeat(MAX_ASSISTANT_BODY_BYTES) }),
  );
  const result = await readRequestBodyWithLimit(request);
  assert.deepEqual(result, { ok: false, error: "payload_too_large" });
});
