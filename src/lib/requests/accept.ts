import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClawRequestInput } from "@/lib/request-schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildCanonicalBrief,
  canonicalSubmissionFingerprint,
  deriveSubmissionUuid,
  requestAppVersion,
  requestContract,
  requestEnvironment,
  type CanonicalBrief,
  type SubmissionConsents,
} from "./canonical";

type NotificationState = {
  recipient_type: "customer" | "team";
  status: "pending" | "processing" | "sent" | "failed" | "cancelled";
};

export type AcceptedRequest = {
  requestId: string;
  acceptedAt: string;
  brief: CanonicalBrief;
  notificationStates: NotificationState[];
  wasCreated: boolean;
  storageMode: "supabase" | "local-json";
};

export type AcceptanceFailure =
  | "storage_not_configured"
  | "storage_unavailable"
  | "idempotency_conflict";

type LocalStoredRequest = {
  id: string;
  idempotency_key: string;
  input_fingerprint: string;
  created_at: string;
  name: string;
  email: string;
  business_url: string | null;
  service: string;
  request: string;
  budget: string | null;
  timeline: string | null;
  brief: CanonicalBrief;
  status: "new";
  source: "web";
  metadata: { assistant_mode: "guided" | "ai_assisted" };
};

let localWriteTail = Promise.resolve();

function localRequestStorageEnabled(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.NODE_ENV !== "production" &&
    env.CLAW_ALLOW_LOCAL_REQUEST_STORAGE === "true"
  );
}

async function withLocalWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = localWriteTail;
  let release: () => void = () => undefined;
  localWriteTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

async function acceptLocally(
  request: ClawRequestInput,
  idempotencyKey: string,
  consents: SubmissionConsents,
): Promise<{ ok: true; value: AcceptedRequest } | { ok: false; error: AcceptanceFailure }> {
  return withLocalWriteLock(async () => {
    const dataDir = path.join(process.cwd(), ".data");
    const filePath = path.join(dataDir, "claw-requests.json");
    await fs.mkdir(dataDir, { recursive: true });

    let existing: LocalStoredRequest[] = [];
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
      if (!Array.isArray(parsed)) {
        return { ok: false as const, error: "storage_unavailable" as const };
      }
      existing = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return { ok: false as const, error: "storage_unavailable" as const };
      }
    }

    const inputFingerprint = canonicalSubmissionFingerprint({
      idempotencyKey,
      request,
      consents,
    });
    const replay = existing.find((item) => item.idempotency_key === idempotencyKey);
    if (replay) {
      if (replay.input_fingerprint !== inputFingerprint) {
        return { ok: false as const, error: "idempotency_conflict" as const };
      }
      return {
        ok: true as const,
        value: {
          requestId: replay.id,
          acceptedAt: replay.created_at,
          brief: replay.brief,
          notificationStates: [],
          wasCreated: false,
          storageMode: "local-json",
        },
      };
    }

    const acceptedAt = new Date().toISOString();
    const brief = buildCanonicalBrief(request);
    const record: LocalStoredRequest = {
      id: crypto.randomUUID(),
      idempotency_key: idempotencyKey,
      input_fingerprint: inputFingerprint,
      created_at: acceptedAt,
      name: request.name,
      email: request.email,
      business_url: request.businessUrl || null,
      service: request.service,
      request: request.request,
      budget: request.budget || null,
      timeline: request.timeline || null,
      brief,
      status: "new",
      source: "web",
      metadata: {
        assistant_mode: consents.aiProcessing ? "ai_assisted" : "guided",
      },
    };
    existing.unshift(record);
    const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(
      temporaryPath,
      JSON.stringify(existing.slice(0, 250), null, 2),
    );
    await fs.rename(temporaryPath, filePath);

    return {
      ok: true as const,
      value: {
        requestId: record.id,
        acceptedAt,
        brief,
        notificationStates: [],
        wasCreated: true,
        storageMode: "local-json",
      },
    };
  });
}

export async function acceptRequest(input: {
  request: ClawRequestInput;
  idempotencyKey: string;
  consents: SubmissionConsents;
  env?: NodeJS.ProcessEnv;
}): Promise<{ ok: true; value: AcceptedRequest } | { ok: false; error: AcceptanceFailure }> {
  const env = input.env ?? process.env;
  const admin = createSupabaseAdminClient(env);
  if (!admin.ok) {
    if (!localRequestStorageEnabled(env)) return admin;
    return acceptLocally(input.request, input.idempotencyKey, input.consents);
  }

  const brief = buildCanonicalBrief(input.request);
  const environment = requestEnvironment(env);
  const appVersion = requestAppVersion(env);
  const ids = {
    correlation: deriveSubmissionUuid(input.idempotencyKey, "correlation"),
    session: deriveSubmissionUuid(input.idempotencyKey, "session"),
    aiConsent: deriveSubmissionUuid(input.idempotencyKey, "consent-ai"),
    analyticsConsent: deriveSubmissionUuid(input.idempotencyKey, "consent-analytics"),
    trainingConsent: deriveSubmissionUuid(input.idempotencyKey, "consent-training"),
  };

  const { data, error } = await admin.client.rpc(requestContract.rpc, {
    p_idempotency_key: input.idempotencyKey,
    p_correlation_id: ids.correlation,
    p_session_id: ids.session,
    p_name: input.request.name,
    p_email: input.request.email,
    p_business_url: input.request.businessUrl || "",
    p_service: input.request.service,
    p_request: input.request.request,
    p_budget: input.request.budget || "",
    p_timeline: input.request.timeline || "",
    p_brief: brief,
    p_privacy_notice_version: requestContract.privacyNoticeVersion,
    p_request_schema_version: requestContract.requestSchemaVersion,
    p_metadata: {
      assistant_mode: input.consents.aiProcessing ? "ai_assisted" : "guided",
      landing_path: "/request",
    },
    p_environment: environment,
    p_session_schema_version: requestContract.sessionSchemaVersion,
    p_app_version: appVersion,
    p_is_synthetic: environment !== "production",
    p_is_canary: false,
    p_is_employee_test: false,
    p_ai_consent_id: ids.aiConsent,
    p_ai_granted: input.consents.aiProcessing,
    p_ai_notice_version: requestContract.aiNoticeVersion,
    p_ai_provider_policy_version: input.consents.aiProcessing
      ? requestContract.aiProviderPolicyVersion
      : "",
    p_analytics_consent_id: ids.analyticsConsent,
    p_analytics_granted: input.consents.productAnalytics,
    p_analytics_notice_version: requestContract.analyticsNoticeVersion,
    p_training_consent_id: ids.trainingConsent,
    p_training_granted: input.consents.modelTraining,
    p_training_notice_version: requestContract.trainingNoticeVersion,
    p_product_events: [],
  });

  if (error) {
    const message = typeof error.message === "string" ? error.message : "";
    if (message.includes("claw_accept_request_idempotency_mismatch")) {
      return { ok: false, error: "idempotency_conflict" };
    }
    return { ok: false, error: "storage_unavailable" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row.request_id !== "string" ||
    typeof row.accepted_at !== "string" ||
    typeof row.was_created !== "boolean" ||
    typeof row.brief !== "object" ||
    !Array.isArray(row.notification_states)
  ) {
    return { ok: false, error: "storage_unavailable" };
  }
  const notificationStates = (row.notification_states as unknown[]).filter(
    (item: unknown): item is NotificationState => {
      if (!item || typeof item !== "object") return false;
      const state = item as Record<string, unknown>;
      return (
        (state.recipient_type === "customer" || state.recipient_type === "team") &&
        ["pending", "processing", "sent", "failed", "cancelled"].includes(
          String(state.status),
        )
      );
    },
  );
  if (
    notificationStates.length !== 2 ||
    new Set(notificationStates.map((state) => state.recipient_type)).size !== 2
  ) {
    return { ok: false, error: "storage_unavailable" };
  }

  return {
    ok: true,
    value: {
      requestId: row.request_id,
      acceptedAt: row.accepted_at,
      brief: row.brief as CanonicalBrief,
      notificationStates,
      wasCreated: row.was_created,
      storageMode: "supabase",
    },
  };
}

export function requestStorageReadiness(env: NodeJS.ProcessEnv = process.env) {
  const remoteConfigured = Boolean(
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const localEnabled = localRequestStorageEnabled(env);
  return {
    ok: remoteConfigured || localEnabled,
    storage: remoteConfigured
      ? "supabase-configured"
      : localEnabled
        ? "local-json-development"
        : "unavailable",
  } as const;
}
