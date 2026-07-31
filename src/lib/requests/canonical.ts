import { createHash } from "node:crypto";
import type { ClawRequestInput } from "@/lib/request-schema";

export const requestContract = {
  rpc: "claw_accept_request_v1",
  requestSchemaVersion: "request-v1",
  sessionSchemaVersion: "request-session-v1",
  privacyNoticeVersion: "request-intake-local-preview-v1",
  aiNoticeVersion: "request-ai-local-preview-v1",
  aiProviderPolicyVersion: "task-only-redacted-preview-v1",
  analyticsNoticeVersion: "request-analytics-local-preview-v1",
  trainingNoticeVersion: "request-training-local-preview-v1",
} as const;

export type SubmissionConsents = {
  aiProcessing: boolean;
  productAnalytics: boolean;
  modelTraining: boolean;
};

export type CanonicalBrief = {
  summary: string;
  objectives: string[];
  deliverables: string[];
  constraints: string[];
  success_criteria: string[];
};

export function buildCanonicalBrief(input: ClawRequestInput): CanonicalBrief {
  const constraints = [
    input.businessUrl ? `Business URL: ${input.businessUrl}` : null,
    input.budget ? `Budget: ${input.budget}` : null,
    input.timeline ? `Timeline: ${input.timeline}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    summary: input.request.slice(0, 2000),
    objectives: [input.request],
    deliverables: [input.service],
    constraints,
    success_criteria: [],
  };
}

export function deriveSubmissionUuid(idempotencyKey: string, label: string) {
  const bytes = createHash("sha256")
    .update(`claw-request-v1:${idempotencyKey}:${label}`, "utf8")
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

export function requestEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "test") return "test";
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.NODE_ENV === "production") return "production";
  return "development";
}

export function requestAppVersion(env: NodeJS.ProcessEnv = process.env) {
  const candidate = env.VERCEL_GIT_COMMIT_SHA?.slice(0, 40) || "local";
  return /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$/.test(candidate)
    ? candidate
    : "unknown";
}

export function canonicalSubmissionFingerprint(input: {
  idempotencyKey: string;
  request: ClawRequestInput;
  consents: SubmissionConsents;
}) {
  return createHash("sha256")
    .update(JSON.stringify({
      contract: requestContract.rpc,
      idempotencyKey: input.idempotencyKey,
      request: input.request,
      consents: input.consents,
    }), "utf8")
    .digest("hex");
}
