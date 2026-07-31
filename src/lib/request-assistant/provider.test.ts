import assert from "node:assert/strict";
import test from "node:test";
import { serviceOptions } from "../landing-content";
import {
  generateRequestAssistantSuggestion,
  parseProviderPayload,
  providerEligibleForField,
  requestAssistantProviderConfig,
} from "./provider";

const providerEnvKeys = [
  "NODE_ENV",
  "OPENAI_API_KEY",
  "REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW",
  "OPENAI_ZERO_DATA_RETENTION_VERIFIED",
] as const;

type ProviderEnv = Partial<Record<(typeof providerEnvKeys)[number], string | undefined>>;

async function withProviderEnv(overrides: ProviderEnv, run: () => void | Promise<void>) {
  const env = process.env as Record<string, string | undefined>;
  const original = new Map(providerEnvKeys.map((key) => [key, env[key]]));

  for (const key of providerEnvKeys) {
    const value = overrides[key];
    if (value === undefined) delete env[key];
    else env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

function completedProviderResponse() {
  return new Response(
    JSON.stringify({
      status: "completed",
      output: [
        {
          type: "reasoning",
          id: "synthetic-reasoning-item",
          summary: [],
        },
        {
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                draft: {
                  service: serviceOptions[3],
                  request: "Research the market and summarize qualified opportunities.",
                  budget: null,
                  timeline: null,
                },
              }),
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("provider payload parsing normalizes required nulls and rejects malformed or extra output", () => {
  assert.deepEqual(
    parseProviderPayload(
      JSON.stringify({
        draft: {
          service: serviceOptions[3],
          request: "Research the market and summarize qualified opportunities.",
          budget: null,
          timeline: null,
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
  assert.equal(
    parseProviderPayload(
      JSON.stringify({
        draft: {
          service: null,
          request: null,
          budget: null,
          timeline: null,
          email: "must-not-be-accepted@example.invalid",
        },
      }),
    ),
    null,
  );
  assert.equal(parseProviderPayload('{"draft":{},"reply":"submitted"}'), null);
  assert.equal(parseProviderPayload("```json\n{\"draft\":{}}\n```"), null);
  assert.equal(parseProviderPayload("not json"), null);
});

test("only explicit task fields are provider-eligible", () => {
  assert.equal(providerEligibleForField(undefined), false);
  assert.equal(providerEligibleForField("name"), false);
  assert.equal(providerEligibleForField("email"), false);
  assert.equal(providerEligibleForField("businessUrl"), false);
  assert.equal(providerEligibleForField("service"), true);
  assert.equal(providerEligibleForField("request"), true);
  assert.equal(providerEligibleForField("budget"), true);
  assert.equal(providerEligibleForField("timeline"), true);
});

test("OpenAI preview requires both a key and the exact preview opt-in", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "development",
      OPENAI_API_KEY: undefined,
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: undefined,
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    () => {
      assert.equal(requestAssistantProviderConfig().configured, false);
    },
  );

  await withProviderEnv(
    {
      NODE_ENV: "development",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: undefined,
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    () => {
      assert.equal(requestAssistantProviderConfig().configured, false);
    },
  );

  await withProviderEnv(
    {
      NODE_ENV: "development",
      OPENAI_API_KEY: undefined,
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    () => {
      assert.equal(requestAssistantProviderConfig().configured, false);
    },
  );

  await withProviderEnv(
    {
      NODE_ENV: "development",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    () => {
      const config = requestAssistantProviderConfig();
      assert.equal(config.configured, true);
      assert.equal(config.model, "gpt-5.6-luna");
      assert.equal(config.previewOnly, true);
      assert.equal(config.zeroDataRetentionVerified, false);
    },
  );
});

test("OpenAI preview remains disabled in production even with key, opt-in, and verified ZDR display flag", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "production",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: "true",
    },
    () => {
      const config = requestAssistantProviderConfig();
      assert.equal(config.configured, false);
      assert.equal(config.key, null);
      assert.equal(config.previewOnly, true);
      assert.equal(config.zeroDataRetentionVerified, true);
    },
  );
});

test("OpenAI Responses API receives the fixed Luna, store:false, strict task-only payload", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "test",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    async () => {
      const originalFetch = globalThis.fetch;
      let requestUrl: string | undefined;
      let requestInit: RequestInit | undefined;
      let requestBody: Record<string, unknown> | undefined;

      globalThis.fetch = async (input, init) => {
        requestUrl = String(input);
        requestInit = init;
        requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return completedProviderResponse();
      };

      try {
        const result = await generateRequestAssistantSuggestion({
          messages: [
            { role: "assistant", content: "Private assistant history must not be forwarded." },
            {
              role: "user",
              content:
                "Prepare a launch brief for Ibrahim Aftabodeen. Email ibrahim@example.com or owner-contact-handle and see https://private.example plus acme.example.",
            },
          ],
          draft: {
            name: "Ibrahim Aftabodeen",
            email: "owner-contact-handle",
            businessUrl: "acme.example",
            request: "Research launch options for Ibrahim Aftabodeen and summarize the strongest path.",
          },
          answering: "request",
        });

        assert.equal(result.ok, true);
        if (!result.ok) assert.fail("expected a validated Luna suggestion");
        assert.deepEqual(result.output, {
          draft: {
            service: serviceOptions[3],
            request: "Research the market and summarize qualified opportunities.",
          },
        });

        assert.equal(requestUrl, "https://api.openai.com/v1/responses");
        assert.equal(requestInit?.method, "POST");
        assert.equal(new Headers(requestInit?.headers).get("content-type"), "application/json");
        assert.match(
          new Headers(requestInit?.headers).get("authorization") ?? "",
          /^Bearer synthetic-openai-preview-key-not-a-secret$/,
        );
        assert.equal(requestBody?.model, "gpt-5.6-luna");
        assert.equal(requestBody?.store, false);
        assert.equal(requestBody?.max_output_tokens, 25_000);
        assert.equal("tools" in (requestBody ?? {}), false);
        assert.equal("background" in (requestBody ?? {}), false);

        assert.deepEqual(requestBody?.text, {
          format: {
            type: "json_schema",
            name: "claw_request_assistant_suggestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                draft: {
                  type: "object",
                  properties: {
                    service: {
                      type: ["string", "null"],
                      enum: [...serviceOptions, null],
                    },
                    request: { type: ["string", "null"] },
                    budget: { type: ["string", "null"] },
                    timeline: { type: ["string", "null"] },
                  },
                  required: ["service", "request", "budget", "timeline"],
                  additionalProperties: false,
                },
              },
              required: ["draft"],
              additionalProperties: false,
            },
          },
        });

        const providerInput = requestBody?.input as Array<{ role: string; content: string }>;
        assert.deepEqual(providerInput.map(({ role }) => role), ["system", "user"]);
        const taskPayload = JSON.parse(providerInput[1].content) as Record<string, unknown>;
        assert.deepEqual(Object.keys(taskPayload).sort(), [
          "answering",
          "currentTaskDraft",
          "latestTaskText",
        ]);
        assert.deepEqual(Object.keys(taskPayload.currentTaskDraft as object).sort(), [
          "budget",
          "request",
          "service",
          "timeline",
        ]);

        const serialized = JSON.stringify(requestBody);
        assert.equal(serialized.includes("Ibrahim Aftabodeen"), false);
        assert.equal(serialized.includes("ibrahim@example.com"), false);
        assert.equal(serialized.includes("https://private.example"), false);
        assert.equal(serialized.includes("owner-contact-handle"), false);
        assert.equal(serialized.includes("acme.example"), false);
        assert.equal(serialized.includes("Private assistant history"), false);
        assert.equal("name" in taskPayload, false);
        assert.equal("email" in taskPayload, false);
        assert.equal("businessUrl" in taskPayload, false);
        assert.equal("name" in (taskPayload.currentTaskDraft as object), false);
        assert.equal("email" in (taskPayload.currentTaskDraft as object), false);
        assert.equal("businessUrl" in (taskPayload.currentTaskDraft as object), false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

test("refusal and incomplete Responses API results fail closed", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "test",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    async () => {
      const originalFetch = globalThis.fetch;
      const input = {
        messages: [{ role: "user" as const, content: "Research a market launch plan." }],
        draft: {},
        answering: "request" as const,
      };

      try {
        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              output: [
                {
                  type: "message",
                  status: "completed",
                  content: [{ type: "refusal", refusal: "raw refusal details must stay private" }],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        const refusal = await generateRequestAssistantSuggestion(input);
        assert.deepEqual(refusal, {
          ok: false,
          reason: "invalid-provider-response",
          model: "gpt-5.6-luna",
        });
        assert.equal(JSON.stringify(refusal).includes("raw refusal details"), false);

        globalThis.fetch = async () =>
          new Response(
            JSON.stringify({
              status: "incomplete",
              incomplete_details: { reason: "max_output_tokens" },
              output: [
                {
                  type: "message",
                  status: "incomplete",
                  content: [
                    {
                      type: "output_text",
                      text: JSON.stringify({
                        draft: {
                          service: null,
                          request: "Research a market launch plan.",
                          budget: null,
                          timeline: null,
                        },
                      }),
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        const incomplete = await generateRequestAssistantSuggestion(input);
        assert.deepEqual(incomplete, {
          ok: false,
          reason: "invalid-provider-response",
          model: "gpt-5.6-luna",
        });
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

test("extra, mixed, multiple, or wrong-role Responses output fails closed", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "test",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    async () => {
      const originalFetch = globalThis.fetch;
      const input = {
        messages: [{ role: "user" as const, content: "Research a market launch plan." }],
        draft: {},
        answering: "request" as const,
      };
      const outputText = {
        type: "output_text",
        text: JSON.stringify({
          draft: {
            service: null,
            request: "Research a market launch plan.",
            budget: null,
            timeline: null,
          },
        }),
      };
      const assistantMessage = {
        type: "message",
        status: "completed",
        role: "assistant",
        content: [outputText],
      };
      const invalidOutputs = [
        [
          { type: "function_call", status: "completed", name: "unexpected_tool" },
          assistantMessage,
        ],
        [
          assistantMessage,
          { type: "message", status: "completed", role: "assistant", content: [] },
        ],
        [{ ...assistantMessage, role: "user" }],
      ];

      try {
        for (const output of invalidOutputs) {
          globalThis.fetch = async () =>
            new Response(JSON.stringify({ status: "completed", output }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          const result = await generateRequestAssistantSuggestion(input);
          assert.deepEqual(result, {
            ok: false,
            reason: "invalid-provider-response",
            model: "gpt-5.6-luna",
          });
        }
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});

test("429 and raw provider failures return only bounded fallback reasons", async () => {
  await withProviderEnv(
    {
      NODE_ENV: "test",
      OPENAI_API_KEY: "synthetic-openai-preview-key-not-a-secret",
      REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW: "true",
      OPENAI_ZERO_DATA_RETENTION_VERIFIED: undefined,
    },
    async () => {
      const originalFetch = globalThis.fetch;
      const input = {
        messages: [{ role: "user" as const, content: "Research a market launch plan." }],
        draft: {},
        answering: "request" as const,
      };

      try {
        globalThis.fetch = async () =>
          new Response("raw upstream quota body with internal identifiers", { status: 429 });
        const rateLimited = await generateRequestAssistantSuggestion(input);
        assert.deepEqual(rateLimited, {
          ok: false,
          reason: "provider-rate-limited",
          model: "gpt-5.6-luna",
        });
        assert.equal(JSON.stringify(rateLimited).includes("raw upstream"), false);

        globalThis.fetch = async () => {
          throw new Error("raw transport failure with internal identifiers");
        };
        const unavailable = await generateRequestAssistantSuggestion(input);
        assert.deepEqual(unavailable, {
          ok: false,
          reason: "provider-unavailable",
          model: "gpt-5.6-luna",
        });
        assert.equal(JSON.stringify(unavailable).includes("raw transport"), false);
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
});
