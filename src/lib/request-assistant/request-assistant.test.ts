import assert from "node:assert/strict";
import test from "node:test";
import { serviceOptions } from "../landing-content";
import {
  containsProviderRestrictedData,
  redactProviderText,
  scanSensitiveContent,
} from "./guardrails";
import {
  applyDeterministicAnswer,
  buildGuidedReply,
  evaluateDraft,
  filterProviderSuggestion,
} from "./logic";
import { requestAssistantInputSchema } from "./types";

test("guided intake builds a canonical draft from explicit user answers", () => {
  let draft = applyDeterministicAnswer({}, undefined, "I need a website for a new consulting offer.");
  assert.equal(draft.service, serviceOptions[0]);
  assert.equal(draft.request, "I need a website for a new consulting offer.");

  draft = applyDeterministicAnswer(draft, "name", "My name is Ibrahim Aftabodeen");
  draft = applyDeterministicAnswer(draft, "email", "ibrahim@example.com");

  const evaluation = evaluateDraft(draft);
  assert.equal(evaluation.readyToSubmit, true);
  assert.equal(evaluation.submissionPayload?.name, "Ibrahim Aftabodeen");
  assert.match(buildGuidedReply(draft), /not submitted/i);
});

test("identity answers are not misclassified as the request", () => {
  const draft = applyDeterministicAnswer({}, "name", "My name is Ibrahim Aftabodeen");
  assert.equal(draft.name, "Ibrahim Aftabodeen");
  assert.equal(draft.request, undefined);
});

test("derived values respect the canonical field limits", () => {
  const overlongBudget = "x".repeat(81);
  const overlongName = "x".repeat(121);
  assert.equal(applyDeterministicAnswer({}, "budget", overlongBudget).budget, undefined);
  assert.equal(applyDeterministicAnswer({}, "name", overlongName).name, undefined);
});

test("provider suggestions cannot overwrite canonical data", () => {
  const canonical = {
    service: serviceOptions[0],
    request: "Build a premium site for the existing consulting offer.",
  };
  const suggestion = filterProviderSuggestion(canonical, {
    service: serviceOptions[3],
    request: "Replace the canonical request with an invented one.",
    budget: "$5,000",
  });

  assert.deepEqual(suggestion, { budget: "$5,000" });
  assert.deepEqual(canonical, {
    service: serviceOptions[0],
    request: "Build a premium site for the existing consulting offer.",
  });
});

test("provider suggestions are disabled while collecting identity fields", () => {
  const suggestion = filterProviderSuggestion(
    {},
    { request: "This otherwise valid task summary must remain a suggestion." },
    "email",
  );
  assert.deepEqual(suggestion, {});
});

test("an explicit task answer may receive a separate suggestion", () => {
  const suggestion = filterProviderSuggestion(
    {},
    { request: "Build a concise launch site for the consulting offer." },
    "request",
  );
  assert.deepEqual(suggestion, {
    request: "Build a concise launch site for the consulting offer.",
  });
});

test("sensitive-content scanning catches common credential forms", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signatureABC123";
  const flags = scanSensitiveContent([
    jwt,
    "DATABASE_URL=postgresql://user:supersecret@db.example.com/app",
    "export SUPABASE_SERVICE_ROLE_KEY=do-not-paste-this-value",
    "4242 4242 4242 4242",
  ]);

  assert.ok(flags.includes("jwt_or_session"));
  assert.ok(flags.includes("credential_uri"));
  assert.ok(flags.includes("credential_assignment"));
  assert.ok(flags.includes("config_or_code"));
  assert.ok(flags.includes("payment_card"));
});

test("provider suggestions reject contact data without blocking normal task language", () => {
  assert.equal(
    containsProviderRestrictedData(["Email me at owner@example.com about the build."]),
    true,
  );
  assert.equal(
    containsProviderRestrictedData(["I am looking for a concise consulting launch site."]),
    false,
  );
});

test("provider redaction preserves unrelated words and ISO timeline dates", () => {
  assert.equal(redactProviderText("Launch the landing page goal", ["Al"]), "Launch the landing page goal");
  assert.equal(redactProviderText("Prepare this for Al by 2026-07-13", ["Al"]), "Prepare this for [name removed] by 2026-07-13");
});

test("AI use requires an explicit opt-in", () => {
  const parsed = requestAssistantInputSchema.parse({
    messages: [{ role: "user", content: "I need research support." }],
  });
  assert.equal(parsed.useAi, false);
});
