import { NextResponse } from "next/server";
import { z } from "zod";
import { requestSchema } from "@/lib/request-schema";
import { acceptRequest, requestStorageReadiness } from "@/lib/requests/accept";
import {
  readRequestBodyWithLimit,
  validateRequestPolicy,
} from "@/lib/request-assistant/request-policy";
import {
  checkRequestAssistantRateLimit,
  requestAssistantClientKey,
} from "@/lib/request-assistant/rate-limit";
import { scanSensitiveContent } from "@/lib/request-assistant/guardrails";

export const runtime = "nodejs";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const submissionSchema = requestSchema.extend({
  consents: z
    .object({
      aiProcessing: z.boolean().default(false),
      productAnalytics: z.boolean().default(false),
      modelTraining: z.boolean().default(false),
    })
    .strict()
    .optional()
    .default({
      aiProcessing: false,
      productAnalytics: false,
      modelTraining: false,
    }),
});

function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  return NextResponse.json(body, { ...init, headers });
}

function requestSubmissionEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.REQUEST_SUBMISSION_ENABLED === "true"
  );
}

function notificationSummary(
  states: Array<{ recipient_type: "customer" | "team"; status: string }>,
  local: boolean,
) {
  const byRecipient = new Map(states.map((state) => [state.recipient_type, state.status]));
  return {
    customer: local ? "not_queued" : byRecipient.get("customer") ?? "unknown",
    team: local ? "not_queued" : byRecipient.get("team") ?? "unknown",
  };
}

export async function POST(request: Request) {
  const policyFailure = validateRequestPolicy(request);
  if (policyFailure) {
    const { status, ...errorBody } = policyFailure;
    return noStoreJson({ ok: false, ...errorBody }, { status });
  }
  if (!requestSubmissionEnabled()) {
    return noStoreJson(
      { ok: false, error: "submission_disabled" },
      { status: 503 },
    );
  }

  const clientKey = `request-submit:${requestAssistantClientKey(request)}`;
  const limit = checkRequestAssistantRateLimit(clientKey);
  if (!limit.allowed) {
    return noStoreJson(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  const body = await readRequestBodyWithLimit(request, 16 * 1024);
  if (!body.ok) {
    return noStoreJson({ ok: false, error: body.error }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return noStoreJson({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = submissionSchema.safeParse(payload);
  if (!parsed.success) {
    return noStoreJson(
      {
        ok: false,
        error: "validation_error",
        issues: parsed.error.flatten().fieldErrors,
      },
      { status: 422 },
    );
  }

  if (parsed.data.honeypot) {
    return noStoreJson({ ok: true, ignored: true });
  }

  const aiConsentAvailable =
    process.env.NODE_ENV !== "production" &&
    process.env.REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW === "true" &&
    Boolean(process.env.OPENAI_API_KEY);
  if (
    parsed.data.consents.productAnalytics ||
    parsed.data.consents.modelTraining ||
    (parsed.data.consents.aiProcessing && !aiConsentAvailable)
  ) {
    return noStoreJson(
      { ok: false, error: "consent_not_available" },
      { status: 422 },
    );
  }

  const idempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (!uuidPattern.test(idempotencyKey)) {
    return noStoreJson(
      { ok: false, error: "invalid_idempotency_key" },
      { status: 400 },
    );
  }

  const sensitiveContentFlags = scanSensitiveContent([
    parsed.data.service,
    parsed.data.request,
    parsed.data.budget,
    parsed.data.timeline,
  ]);
  if (sensitiveContentFlags.length > 0) {
    return noStoreJson(
      { ok: false, error: "sensitive_content_detected" },
      { status: 422 },
    );
  }

  const { consents, ...requestInput } = parsed.data;
  let acceptance: Awaited<ReturnType<typeof acceptRequest>>;
  try {
    acceptance = await acceptRequest({
      request: requestInput,
      idempotencyKey,
      consents,
    });
  } catch {
    console.error("request_storage_failed", { code: "storage_exception" });
    return noStoreJson(
      { ok: false, error: "storage_unavailable" },
      { status: 503 },
    );
  }

  if (!acceptance.ok) {
    const status = acceptance.error === "idempotency_conflict" ? 409 : 503;
    console.error("request_storage_failed", { code: acceptance.error });
    return noStoreJson(
      { ok: false, error: acceptance.error },
      { status },
    );
  }

  const accepted = acceptance.value;
  return noStoreJson(
    {
      ok: true,
      requestId: accepted.requestId,
      acceptedAt: accepted.acceptedAt,
      brief: accepted.brief,
      notifications: notificationSummary(
        accepted.notificationStates,
        accepted.storageMode === "local-json",
      ),
      storage: {
        mode: accepted.storageMode,
        wasCreated: accepted.wasCreated,
      },
    },
    { status: accepted.wasCreated ? 201 : 200 },
  );
}

export async function GET() {
  const readiness = requestStorageReadiness();
  const resendConfigured = Boolean(
    process.env.RESEND_API_KEY &&
      process.env.CLAW_REQUEST_TO_EMAIL &&
      process.env.CLAW_REQUEST_FROM_EMAIL,
  );

  return noStoreJson({
    ...readiness,
    submissionEnabled: requestSubmissionEnabled(),
    contract: "v1",
    acceptance: "claw_accept_request_v1",
    notificationOutbox: "schema-ready-worker-not-configured",
    resendConfigured,
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
}
