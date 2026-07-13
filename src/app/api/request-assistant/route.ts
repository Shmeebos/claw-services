import { NextResponse } from "next/server";
import { scanSensitiveContent } from "@/lib/request-assistant/guardrails";
import {
  applyDeterministicAnswer,
  buildGuidedReply,
  evaluateDraft,
  getNextRequiredField,
  isUnsafeAssistantReply,
  mergeDraft,
} from "@/lib/request-assistant/logic";
import {
  generateRequestAssistantDraft,
  requestAssistantProviderConfig,
} from "@/lib/request-assistant/provider";
import {
  checkRequestAssistantRateLimit,
  clientRateLimitKey,
  requestAssistantRateLimitConfig,
} from "@/lib/request-assistant/rate-limit";
import { requestAssistantInputSchema, type RequestDraft } from "@/lib/request-assistant/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 24 * 1024;
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

function rateLimitHeaders(result: ReturnType<typeof checkRequestAssistantRateLimit>) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };
}

export async function GET() {
  const provider = requestAssistantProviderConfig();
  const rateLimit = requestAssistantRateLimitConfig();

  return json({
    ok: true,
    service: "claw-request-assistant",
    enabled: publicAssistantEnabled(),
    provider: {
      configured: provider.configured,
      model: provider.model,
      fallback: "guided-intake",
    },
    privacy: {
      persistence: "none",
      privatePortalRetrieval: false,
      autoSubmit: false,
      externalAiOptInRequired: true,
    },
    rateLimit: {
      mode: "best-effort-instance",
      limit: rateLimit.limit,
      windowMs: rateLimit.windowMs,
    },
    requiredProductionEnv: ["REQUEST_ASSISTANT_PUBLIC_ENABLED"],
    optionalEnv: [
      "OPENROUTER_API_KEY",
      "CLAW_REQUEST_ASSISTANT_MODEL",
      "REQUEST_ASSISTANT_RATE_LIMIT",
      "REQUEST_ASSISTANT_RATE_WINDOW_MS",
      "REQUEST_ASSISTANT_PROVIDER_TIMEOUT_MS",
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
        message: "The public request assistant is not enabled.",
        correlationId,
      },
      { status: 503 },
    );
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return json({ ok: false, error: "payload_too_large", correlationId }, { status: 413 });
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
      return json({ ok: false, error: "payload_too_large", correlationId }, { status: 413 });
    }
    payload = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "invalid_json", correlationId }, { status: 400 });
  }

  const parsed = requestAssistantInputSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        ok: false,
        error: "validation_error",
        issues: parsed.error.flatten().fieldErrors,
        correlationId,
      },
      { status: 422 },
    );
  }

  if (parsed.data.honeypot) {
    return json({ ok: true, ignored: true, correlationId });
  }

  const rateLimit = checkRequestAssistantRateLimit(clientRateLimitKey(request));
  const requestRateHeaders = rateLimitHeaders(rateLimit);
  if (!rateLimit.allowed) {
    return json(
      {
        ok: false,
        error: "rate_limited",
        message: "Too many assistant requests. Please wait before trying again.",
        correlationId,
      },
      {
        status: 429,
        headers: { ...requestRateHeaders, "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const sensitiveValues = [
    ...parsed.data.messages.map((message) => message.content),
    ...Object.values(parsed.data.draft).filter((value): value is string => typeof value === "string"),
  ];
  const inputRiskFlags = scanSensitiveContent(sensitiveValues);
  if (inputRiskFlags.length > 0) {
    return json(
      {
        ok: false,
        error: "sensitive_content",
        message:
          "Remove passwords, API keys, access tokens, private keys, or payment-card details before using the request assistant. Rotate any credential that was pasted here.",
        riskFlags: inputRiskFlags,
        correlationId,
      },
      { status: 422, headers: requestRateHeaders },
    );
  }

  const latestUserMessage = [...parsed.data.messages]
    .reverse()
    .find((message) => message.role === "user")?.content;
  if (!latestUserMessage) {
    return json(
      {
        ok: false,
        error: "user_message_required",
        message: "At least one user message is required.",
        correlationId,
      },
      { status: 422, headers: requestRateHeaders },
    );
  }

  const deterministicDraft = applyDeterministicAnswer(
    parsed.data.draft,
    parsed.data.answering,
    latestUserMessage,
  );
  const provider = parsed.data.useAi
    ? await generateRequestAssistantDraft({
        ...parsed.data,
        draft: deterministicDraft,
      })
    : {
        ok: false as const,
        reason: "ai-not-requested" as const,
        model: requestAssistantProviderConfig().model,
      };

  let draft: RequestDraft = deterministicDraft;
  let reply = buildGuidedReply(draft);
  let providerMode: "openrouter" | "guided-fallback" = "guided-fallback";
  let fallbackReason: string | null = provider.ok ? null : provider.reason;

  if (provider.ok) {
    const providerDraft = mergeDraft(draft, provider.output.draft);
    const outputRiskFlags = scanSensitiveContent([
      provider.output.reply,
      ...Object.values(providerDraft).filter((value): value is string => typeof value === "string"),
    ]);

    if (outputRiskFlags.length === 0 && !isUnsafeAssistantReply(provider.output.reply)) {
      draft = providerDraft;
      reply = provider.output.reply;
      providerMode = "openrouter";
      fallbackReason = null;
    } else {
      fallbackReason = "unsafe-provider-output";
    }
  }

  const evaluation = evaluateDraft(draft);
  const nextField = getNextRequiredField(draft);

  return json(
    {
      ok: true,
      correlationId,
      reply,
      draft,
      nextField,
      missing: evaluation.missing,
      issues: evaluation.issues,
      readyToSubmit: evaluation.readyToSubmit,
      submissionPayload: evaluation.submissionPayload,
      autoSubmitted: false,
      aiRequested: parsed.data.useAi,
      provider: {
        mode: providerMode,
        model: provider.model,
        fallbackReason,
      },
    },
    { headers: requestRateHeaders },
  );
}
