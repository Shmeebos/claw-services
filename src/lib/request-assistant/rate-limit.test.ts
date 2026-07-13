import assert from "node:assert/strict";
import test from "node:test";
import { requestAssistantClientKey } from "./rate-limit";

test("client quota identity cannot be multiplied by rotating user agents", () => {
  const first = new Request("https://claw.example/api/request-assistant", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.10",
      "user-agent": "browser-one",
    },
  });
  const second = new Request("https://claw.example/api/request-assistant", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.10",
      "user-agent": "browser-two",
    },
  });
  const differentIp = new Request("https://claw.example/api/request-assistant", {
    headers: {
      "x-vercel-forwarded-for": "203.0.113.11",
      "user-agent": "browser-one",
    },
  });

  assert.equal(requestAssistantClientKey(first), requestAssistantClientKey(second));
  assert.notEqual(requestAssistantClientKey(first), requestAssistantClientKey(differentIp));
});
