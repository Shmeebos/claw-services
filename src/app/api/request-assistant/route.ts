import { NextResponse } from "next/server";
import {
  checkDurableAiQuota,
  durableAiQuotaConfig,
  localAiQuotaOverrideEnabled,
} from "@/lib/request-assistant/durable-rate-limit";
import {
  containsProviderRestrictedData,
  scanSensitiveContent,
} from "@/lib/request-assistant/guardrails";
import {
  applyDeterministicAnswer,
  buildGuidedReply,
  evaluateDraft,
  getNextRequiredField,
  prepareProviderSuggestion,
} from "@/lib/request-assistant/logic";
import {
  generateRequestAssistantSuggestion,
  providerEligibleForField,
  requestAssistantProviderConfig,
} from "@/lib/request-assistant/provider";
import {
  checkRequestAssistantRateLimit,
  requestAssistantClientKey,
  requestAssistantRateLimitConfig,
} from "@/lib/request-assistant/rate-limit";
import {
  MAX_ASSISTANT_BODY_BYTES,
  readRequestBodyWithLimit,
  validateRequestPolicy,
} from "@/lib/request-assistant/request-policy";
import {
  requestAssistantInputSchema,
  type ProviderTaskDraft,
  type TaskField,
} from "@/lib/request-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(privateHeaders);
  if (init.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  return NextResponse.json(body, { ...init, headers });
}

function publicAssistantEnabled() {
  const configured = process.env.REQUEST_ASSISTANT_PUBLIC_ENABLED?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function localRateHeaders(limit: ReturnType<typeof checkRequestAssistantRateLimit>) {
  return {
    "X-RateLimit-Limit": String(limit.limit),
    "X-RateLimit-Remaining": String(limit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(limit.resetAt / 1000)),
  };
}

export async function GET() {
  const provider = requestAssistantProviderConfig();
  const localLimit = requestAssistantRateLimitConfig();
  const durableQuota = durableAiQuotaConfig();
  const localAiOverride = localAiQuotaOverrideEnabled();

  return json({
    ok: true,
    service: "claw-request-assistant",
    enabled: publicAssistantEnabled(),
    provider: {
      name: provider.providerName,
      mode: provider.provider,
      configured: provider.configured,
      model: provider.model,
      previewEnabled: provider.previewEnabled,
      previewOnly: provider.previewOnly,
      zeroDataRetentionVerified: provider.zeroDataRetentionVerified,
      retention: provider.zeroDataRetentionVerified
        ? "zero-data-retention-verified"
        : "abuse-monitoring-up-to-30-days",
      configurationReadyForPublicAi: false,
      configurationReadyForLocalAi:
        provider.configured && (localAiOverride || durableQuota.configured),
    },
    privacy: {
      applicationPersistence: "none",
      providerProcessing: "explicit-useAi-opt-in-only",
      providerData: "explicit-task-answer-with-known-identity-and-common-contact-redaction",
      providerRetention: provider.zeroDataRetentionVerified
        ? "zero-data-retention-verified"
        : "redacted-task-text-may-be-retained-for-abuse-monitoring-up-to-30-days",
      providerPreviewOnly: true,
      privatePortalRetrieval: false,
      autoSubmit: false,
    },
    rateLimit: {
      local: { mode: "bounded-instance", limit: localLimit.limit, windowMs: localLimit.windowMs },
      ai: {
        mode: localAiOverride ? "local-development" : "upstash-distributed",
        configured: localAiOverride || durableQuota.configured,
        clientLimit: durableQuota.clientLimit,
        windowMs: durableQuota.windowMs,
        dailyLimit: durableQuota.dailyAiLimit,
      },
    },
    requiredProductionEnv: ["REQUEST_ASSISTANT_PUBLIC_ENABLED"],
    requiredForAi: [
      "OPENAI_API_KEY",
      "REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ],
    optionalEnv: [
      "OPENAI_ZERO_DATA_RETENTION_VERIFIED",
      "REQUEST_ASSISTANT_ALLOWED_ORIGINS",
      "REQUEST_ASSISTANT_RATE_LIMIT",
      "REQUEST_ASSISTANT_RATE_WINDOW_MS",
      "REQUEST_ASSISTANT_AI_RATE_LIMIT",
      "REQUEST_ASSISTANT_AI_RATE_WINDOW_MS",
      "REQUEST_ASSISTANT_DAILY_AI_LIMIT",
      "REQUEST_ASSISTANT_PROVIDER_TIMEOUT_MS",
      "REQUEST_ASSISTANT_ALLOW_LOCAL_AI",
    ],
  });
}

export async function POST(request: Request) {
  const correlationId = crypto.randomUUID();
  if (!publicAssistantEnabled()) {
    return json(
      {
        ok: false,
        error: "assistant_disabled",
        message: "Request assistant is not enabled.",
        correlationId,
      },
      { status: 503 },
    );
  }

  const policyFailure = validateRequestPolicy(request);
  if (policyFailure) {
    const { status, ...errorBody } = policyFailure;
    return json({ ok: false, ...errorBody, correlationId }, { status });
  }

  const clientKey = requestAssistantClientKey(request);
  const localLimit = checkRequestAssistantRateLimit(clientKey);
  if (!localLimit.allowed) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        message: "Too many assistant requests. Please wait before trying again.",
        correlationId,
      },
      {
        status: 429,
        headers: {
          ...localRateHeaders(localLimit),
          "Retry-After": String(localLimit.retryAfterSeconds),
        },
      },
    );
  }

  const body = await readRequestBodyWithLimit(request, MAX_ASSISTANT_BODY_BYTES);
  if (!body.ok) {
    return json(
      { ok: false, error: body.error, correlationId },
      { status: 413, headers: localRateHeaders(localLimit) },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return json(
      { ok: false, error: "invalid_json", correlationId },
      { status: 400, headers: localRateHeaders(localLimit) },
    );
  }

  const parsed = requestAssistantInputSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "validation_error",
        issues: parsed.error.flatten(),
        correlationId,
      },
      { status: 422, headers: localRateHeaders(localLimit) },
    );
  }

  if (parsed.data.honeypot) {
    return json(
      { ok: true, ignored: true, correlationId },
      { status: 200, headers: localRateHeaders(localLimit) },
    );
  }

  const valuesToScan = [
    ...parsed.data.messages.map((message) => message.content),
    ...Object.values(parsed.data.draft).filter((value): value is string => typeof value === "string"),
  ];
  const inputRiskFlags = scanSensitiveContent(valuesToScan);
  if (inputRiskFlags.length > 0) {
    return json(
      {
        ok: false,
        error: "sensitive_content",
        message:
          "Remove passwords, API keys, access tokens, private keys, configuration secrets, or payment-card details before using the request assistant. Rotate any credential that was pasted here.",
        riskFlags: inputRiskFlags,
        correlationId,
      },
      { status: 422, headers: localRateHeaders(localLimit) },
    );
  }

  const latestUserMessage = [...parsed.data.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (!latestUserMessage) {
    return json(
      { ok: false, error: "missing_user_message", correlationId },
      { status: 422, headers: localRateHeaders(localLimit) },
    );
  }

  const draft = applyDeterministicAnswer(parsed.data.draft, parsed.data.answering, latestUserMessage);
  const providerConfig = requestAssistantProviderConfig();
  let providerAttempted = false;
  let fallbackReason: string | null = parsed.data.useAi
    ? "provider-not-attempted"
    : "ai-not-requested";
  let suggestedDraft: ProviderTaskDraft | null = null;
  let suggestedField: TaskField | null = null;

  if (parsed.data.useAi) {
    if (!providerConfig.configured) {
      fallbackReason = "provider-not-configured";
    } else if (!providerEligibleForField(parsed.data.answering)) {
      fallbackReason = "identity-field-local-only";
    } else {
      const durableQuota = localAiQuotaOverrideEnabled()
        ? null
        : await checkDurableAiQuota(clientKey);
      if (durableQuota && !durableQuota.allowed) {
        fallbackReason = `durable-quota-${durableQuota.reason}`;
      } else {
        providerAttempted = true;
        const provider = await generateRequestAssistantSuggestion({
          messages: parsed.data.messages,
          draft,
          answering: parsed.data.answering,
        });
        if (provider.ok) {
          const prepared = prepareProviderSuggestion(
            parsed.data.draft,
            provider.output.draft,
            parsed.data.answering,
          );
          const outputValues = Object.values(prepared?.draft ?? {}).filter(
            (value): value is string => typeof value === "string",
          );
          const unsafeOutput =
            scanSensitiveContent(outputValues).length > 0 ||
            containsProviderRestrictedData(outputValues);
          if (!unsafeOutput && prepared) {
            suggestedDraft = prepared.draft;
            suggestedField = prepared.field;
            fallbackReason = null;
          } else {
            fallbackReason = unsafeOutput ? "unsafe-provider-output" : "no-new-suggestion";
          }
        } else {
          fallbackReason = provider.reason;
        }
      }
    }
  }

  const evaluation = evaluateDraft(draft);
  return json(
    {
      ok: true,
      correlationId,
      reply: buildGuidedReply(draft),
      draft,
      suggestedDraft,
      suggestedField,
      nextField: getNextRequiredField(draft),
      missing: evaluation.missing,
      readyToSubmit: evaluation.readyToSubmit,
      submissionPayload: evaluation.submissionPayload,
      autoSubmitted: false,
      aiRequested: parsed.data.useAi,
      aiProviderAttempted: providerAttempted,
      aiSuggestionAvailable: suggestedDraft !== null,
      provider: {
        mode: suggestedDraft ? "openai" : "guided-fallback",
        name: providerConfig.providerName,
        model: providerConfig.model,
        previewOnly: providerConfig.previewOnly,
        fallbackReason,
        zeroDataRetentionVerified: providerConfig.zeroDataRetentionVerified,
        retention: providerConfig.zeroDataRetentionVerified
          ? "zero-data-retention-verified"
          : "abuse-monitoring-up-to-30-days",
      },
    },
    { status: 200, headers: localRateHeaders(localLimit) },
  );
}
