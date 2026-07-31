import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildHermesProjection,
  buildIngestPayload,
  type CeoBrief,
  type CoachAnalysis,
  getLatestLocalSourceHash,
  hermesSubprocessEnvironment,
  loadSourceProjection,
  writeLocalSupabase,
} from "./operating-context";

const coach: CoachAnalysis = {
  diagnosis: "The operating gates precede authorized touches.",
  metric_to_improve_first: "Same-day verified target accounts",
  target_assessments: [
    {
      target_key: "metric:collected-new-client-revenue",
      interpretation: "A lagging outcome with no current baseline.",
      safeguard: "Never count proposals or unpaid invoices.",
    },
  ],
  owner_actions: [
    {
      owner_role: "Ibrahim",
      action: "Resolve the private verification gate.",
      authority_status: "adopted",
    },
  ],
  review_rule: "Review counts with denominators after the first approved delivered touch.",
  source_refs: ["Obsidian: Projects/Claw Services Operating Context"],
};

const brief: CeoBrief = {
  summary: "Two active gates need CEO disposition.",
  confirmation_requests: [
    {
      target_key: "gate:private-entity-payment-verification",
      request_type: "request_missing_evidence",
      question: "Is private entity/payment verification complete?",
      recommended_default: "Keep the gate blocked until evidence exists.",
      risk_class: "high",
      source_ref: "Obsidian: Projects/Claw Services Operating Context#Active gates after founder review",
    },
  ],
  information_requests: [],
  source_refs: ["Obsidian: Projects/Claw Services Operating Context"],
};

test("canonical Obsidian projection preserves targets and authorization gates", async () => {
  const source = await loadSourceProjection({ observedAt: "2026-07-30T12:00:00.000Z" });
  assert.equal(source.targets.length, 14);
  assert.equal(source.targets.filter((target) => target.target_kind === "operating_gate").length, 8);
  assert.equal(source.targets.filter((target) => target.target_kind !== "operating_gate").length, 6);
  assert.equal(source.contextSummary.outreach_authorized, false);
  assert.equal(source.contextSummary.lead_activation_authorized, false);
  assert.equal(source.contextSummary.external_crm_writes_authorized, false);
  assert.equal(source.contextSummary.commercial_baselines, "unknown");
  assert.ok(source.targets.every((target) => target.target_label === null));
});

test("Hermes outputs are closed, target-bound JSON", async () => {
  const source = await loadSourceProjection({ observedAt: "2026-07-30T12:00:00.000Z" });
  const calls: string[] = [];
  const runner = async (profile: "sales-coach" | "default", prompt: string) => {
    calls.push(`${profile}:${prompt}`);
    return JSON.stringify(profile === "sales-coach" ? coach : brief);
  };
  const projection = await buildHermesProjection(source, runner);
  assert.equal(projection.brief.confirmation_requests.length, 1);
  assert.match(calls[0], /^sales-coach:/);
  assert.match(calls[1], /^default:/);
  assert.ok(calls.every((call) => call.includes("no tools")));
  assert.ok(calls.every((call) => call.includes("Do not")));
  assert.ok(calls.every((call) => !call.includes("Ibrahim wants one canonical")));
});

test("unknown model target and schema expansion fail closed", async () => {
  const source = await loadSourceProjection({ observedAt: "2026-07-30T12:00:00.000Z" });
  await assert.rejects(
    buildHermesProjection(source, async (profile) =>
      JSON.stringify(
        profile === "sales-coach"
          ? {
              ...coach,
              target_assessments: [
                { target_key: "metric:invented", interpretation: "x", safeguard: "y" },
              ],
            }
          : brief,
      ),
    ),
    /coach_unknown_target/,
  );
  await assert.rejects(
    buildHermesProjection(source, async (profile) =>
      JSON.stringify(profile === "sales-coach" ? { ...coach, hidden_reasoning: "no" } : brief),
    ),
    /unrecognized_keys/,
  );
});

test("ingest identity is deterministic and remote writes fail closed", async () => {
  const source = await loadSourceProjection({ observedAt: "2026-07-30T12:00:00.000Z" });
  const first = buildIngestPayload(source, coach, brief);
  const second = buildIngestPayload(source, coach, brief);
  assert.deepEqual(first, second);
  assert.equal(first.payload.ceo_requests.length, 1);
  await assert.rejects(
    writeLocalSupabase(first, {
      url: "https://example.supabase.co",
      serviceRoleKey: "test-only",
      fetchImpl: async () => new Response("[]"),
    }),
    /remote_context_sync_not_authorized/,
  );
});

test("Hermes subprocess never inherits database or delivery credentials", () => {
  const environment = hermesSubprocessEnvironment({
    PATH: "/bin",
    OPENAI_API_KEY: "provider-needed",
    SUPABASE_SERVICE_ROLE_KEY: "never-pass",
    DATABASE_URL: "never-pass",
    RESEND_API_KEY: "never-pass",
  });
  assert.equal(environment.OPENAI_API_KEY, "provider-needed");
  assert.equal(environment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(environment.DATABASE_URL, undefined);
  assert.equal(environment.RESEND_API_KEY, undefined);
  assert.equal(environment.HERMES_KANBAN_TASK, "");
});

test("source hash preflight is local-only and returns the latest hash", async () => {
  const response = async () =>
    new Response(JSON.stringify([{ source_bundle_sha256: "a".repeat(64) }]), {
      status: 200,
    });
  assert.equal(
    await getLatestLocalSourceHash({
      url: "http://127.0.0.1:54321",
      serviceRoleKey: "test-only",
      fetchImpl: response,
    }),
    "a".repeat(64),
  );
  await assert.rejects(
    getLatestLocalSourceHash({
      url: "https://example.supabase.co",
      serviceRoleKey: "test-only",
      fetchImpl: response,
    }),
    /remote_context_sync_not_authorized/,
  );
});

test("parser fails closed when required source sections are absent", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "claw-context-"));
  const memoryPath = path.join(directory, "memory.md");
  const contextPath = path.join(directory, "context.md");
  await writeFile(memoryPath, "# Operating Memory\n");
  await writeFile(contextPath, "# Claw\n");
  await assert.rejects(
    loadSourceProjection({
      operatingMemoryPath: memoryPath,
      projectContextPath: contextPath,
      observedAt: "2026-07-30T12:00:00.000Z",
    }),
    /missing_source_section/,
  );
});
