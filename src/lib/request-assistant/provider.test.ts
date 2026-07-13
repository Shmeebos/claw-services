import assert from "node:assert/strict";
import test from "node:test";
import { serviceOptions } from "../landing-content";
import {
  generateRequestAssistantSuggestion,
  parseProviderPayload,
  providerEligibleForField,
} from "./provider";

test("provider payload parsing rejects extra or malformed output", () => {
  assert.deepEqual(
    parseProviderPayload(
      JSON.stringify({
        draft: {
          service: serviceOptions[3],
          request: "Research the market and summarize qualified opportunities.",
        },
      }),
    ),
    {
      draft: {
        service: serviceOptions[3],
        request: "Research the market and summarize qualified opportunities.",
      },
    },
  );
  assert.equal(parseProviderPayload('{"draft":{},"reply":"submitted"}'), null);
  assert.equal(parseProviderPayload("not json"), null);
});

test("only explicit task fields are provider-eligible", () => {
  assert.equal(providerEligibleForField(undefined), false);
  assert.equal(providerEligibleForField("name"), false);
  assert.equal(providerEligibleForField("email"), false);
  assert.equal(providerEligibleForField("businessUrl"), false);
  assert.equal(providerEligibleForField("request"), true);
});

test("OpenRouter receives ZDR task-only input with identity redacted", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENROUTER_API_KEY;
  let requestBody: Record<string, unknown> | undefined;

  process.env.OPENROUTER_API_KEY = "test-openrouter-key-not-a-real-secret";
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                draft: {
                  service: serviceOptions[3],
                  request: "Research the market and summarize qualified opportunities.",
                },
              }),
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  try {
    const result = await generateRequestAssistantSuggestion({
      messages: [
        { role: "assistant", content: "Private assistant context must not be forwarded." },
        {
          role: "user",
          content:
            "Prepare a launch brief for Ibrahim Aftabodeen. Email ibrahim@example.com and see https://private.example.",
        },
      ],
      draft: {
        name: "Ibrahim Aftabodeen",
        email: "ibrahim@example.com",
        businessUrl: "https://private.example",
        request: "Research launch options for Ibrahim Aftabodeen and summarize the strongest path.",
      },
      answering: "request",
    });

    assert.equal(result.ok, true);
    const serialized = JSON.stringify(requestBody);
    assert.equal(serialized.includes("Ibrahim Aftabodeen"), false);
    assert.equal(serialized.includes("ibrahim@example.com"), false);
    assert.equal(serialized.includes("https://private.example"), false);
    assert.equal(serialized.includes("Private assistant context"), false);

    const provider = requestBody?.provider as { zdr?: boolean };
    assert.equal(provider.zdr, true);
    const messages = requestBody?.messages as Array<{ role: string }>;
    assert.deepEqual(
      messages.map((message) => message.role),
      ["system", "user"],
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
  }
});
