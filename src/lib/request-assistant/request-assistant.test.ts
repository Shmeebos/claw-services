import assert from "node:assert/strict";
import test from "node:test";
import { scanSensitiveContent } from "./guardrails";
import {
  applyDeterministicAnswer,
  buildGuidedReply,
  evaluateDraft,
  getNextRequiredField,
  isMisleadingSubmissionClaim,
  isUnsafeAssistantReply,
  mergeDraft,
} from "./logic";
import { checkRequestAssistantRateLimit } from "./rate-limit";
import { generateRequestAssistantDraft, parseProviderPayload } from "./provider";

const validDraft = {
  name: "Acme Plumbing",
  email: "hello@acme.test",
  service: "Premium website / landing page" as const,
  request: "Build a clear website that turns local visitors into qualified plumbing leads.",
};

test("guided intake infers a service and preserves the client's request", () => {
  const draft = applyDeterministicAnswer(
    {},
    undefined,
    "I need a website for my plumbing business that can bring in better local leads.",
  );

  assert.equal(draft.service, "Premium website / landing page");
  assert.match(draft.request ?? "", /plumbing business/);
  assert.equal(getNextRequiredField(draft), "name");
  assert.match(buildGuidedReply(draft), /name or business name/i);
});

test("explicit field answers complete a reviewable request without auto-submission", () => {
  let draft = applyDeterministicAnswer(
    {},
    "service",
    "Lead intake automation",
  );
  draft = applyDeterministicAnswer(
    draft,
    "request",
    "Route website leads into one clean queue and send reliable follow-up reminders.",
  );
  draft = applyDeterministicAnswer(draft, "name", "My name is Ibrahim");
  draft = applyDeterministicAnswer(draft, "email", "Use ibrahim@example.com please");

  const evaluation = evaluateDraft(draft);
  assert.equal(evaluation.readyToSubmit, true);
  assert.deepEqual(evaluation.missing, []);
  assert.equal(evaluation.submissionPayload?.name, "Ibrahim");
  assert.equal(evaluation.submissionPayload?.email, "ibrahim@example.com");
  assert.match(buildGuidedReply(draft), /not submitted anything yet/i);
});

test("an explicit name answer is not reused as the request description", () => {
  const draft = applyDeterministicAnswer({}, "name", "Test Plumbing Company");
  assert.equal(draft.name, "Test Plumbing Company");
  assert.equal(draft.request, undefined);
});

test("invalid provider updates cannot erase already validated draft fields", () => {
  const merged = mergeDraft(validDraft, {
    name: "",
    request: "",
    service: "Premium website / landing page",
  });

  assert.equal(merged.name, validDraft.name);
  assert.equal(merged.request, validDraft.request);
});

test("sensitive-content scanner blocks credentials and payment cards", () => {
  assert.deepEqual(scanSensitiveContent(["ordinary project brief"]), []);
  assert.ok(scanSensitiveContent(["api_key=super-secret-value-123"]).includes("credential_assignment"));
  assert.ok(scanSensitiveContent(["card 4242 4242 4242 4242"]).includes("payment_card"));
  assert.ok(scanSensitiveContent(["-----BEGIN PRIVATE KEY-----"]).includes("private_key"));
});

test("provider JSON is accepted only when it matches the bounded schema", () => {
  const parsed = parseProviderPayload(
    '```json\n{"reply":"What result do you want?","draft":{"service":"Research or admin pack"},"nextField":"request"}\n```',
  );
  assert.equal(parsed?.nextField, "request");
  assert.equal(parsed?.draft.service, "Research or admin pack");
  assert.equal(parseProviderPayload('{"reply":"ok","draft":{"service":"not-real"}}'), null);
});

test("OpenRouter adapter sends a bounded request and validates the response", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.CLAW_REQUEST_ASSISTANT_MODEL;
  let capturedInit: RequestInit | undefined;

  process.env.OPENROUTER_API_KEY = "test-only-key";
  process.env.CLAW_REQUEST_ASSISTANT_MODEL = "test/model";
  globalThis.fetch = async (_input, init) => {
    capturedInit = init;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                '{"reply":"What result do you want?","draft":{"service":"Research or admin pack"},"nextField":"request"}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await generateRequestAssistantDraft({
      messages: [{ role: "user", content: "I need research help." }],
      draft: {},
      useAi: true,
      honeypot: "",
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.output.nextField, "request");
    const sentBody = JSON.parse(String(capturedInit?.body));
    assert.equal(sentBody.model, "test/model");
    assert.equal(sentBody.response_format.type, "json_object");
    assert.equal(sentBody.messages[0].role, "system");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.CLAW_REQUEST_ASSISTANT_MODEL;
    else process.env.CLAW_REQUEST_ASSISTANT_MODEL = originalModel;
  }
});

test("misleading completion claims are rejected", () => {
  assert.equal(isMisleadingSubmissionClaim("I have submitted your request."), true);
  assert.equal(isMisleadingSubmissionClaim("Your draft is ready for review."), false);
  assert.equal(isUnsafeAssistantReply("Paste your API key so I can continue."), true);
  assert.equal(isUnsafeAssistantReply("Continue at https://malicious.example"), true);
  assert.equal(isUnsafeAssistantReply("What outcome do you want from the website?"), false);
});

test("rate limiter permits the configured budget and then closes", () => {
  const key = `test-${Date.now()}-${Math.random()}`;
  const first = checkRequestAssistantRateLimit(key, { limit: 2, windowMs: 1_000, now: 10_000 });
  const second = checkRequestAssistantRateLimit(key, { limit: 2, windowMs: 1_000, now: 10_100 });
  const third = checkRequestAssistantRateLimit(key, { limit: 2, windowMs: 1_000, now: 10_200 });
  const reset = checkRequestAssistantRateLimit(key, { limit: 2, windowMs: 1_000, now: 11_001 });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(reset.allowed, true);
});
