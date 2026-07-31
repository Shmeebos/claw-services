import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const DEFAULT_OPERATING_MEMORY_PATH =
  "/Users/ibrahimaftabodeen/Desktop/Shmeeb Notes/Shmeeb/System/Operating Memory.md";
export const DEFAULT_PROJECT_CONTEXT_PATH =
  "/Users/ibrahimaftabodeen/Desktop/Shmeeb Notes/Shmeeb/Projects/Claw Services Operating Context.md";

const sourceRef = "Obsidian: Projects/Claw Services Operating Context";
const uuidNamespace = "claw-operating-context-v1";

export type ActiveTarget = {
  id: string;
  target_key: string;
  title: string;
  target_kind: "business_outcome" | "leading_metric" | "operating_gate";
  authority_status: "adopted" | "proposed" | "unknown";
  execution_status:
    | "not_started"
    | "active"
    | "blocked"
    | "completed"
    | "cancelled"
    | "unknown";
  owner_role: string;
  owner_acceptance_status:
    | "founder_owned"
    | "proposed"
    | "sent"
    | "accepted"
    | "unknown";
  baseline_status: "verified" | "unknown";
  baseline_label: string | null;
  target_label: string | null;
  next_gate: string;
  source_ref: string;
};

export type SourceProjection = {
  observedAt: string;
  sourceBundleSha256: string;
  operatingMemorySha256: string;
  projectContextSha256: string;
  contextSummary: {
    company: string;
    operating_principles: string[];
    active_constraints: string[];
    lead_activation_authorized: false;
    outreach_authorized: false;
    external_crm_writes_authorized: false;
    commercial_baselines: "unknown";
    source_refs: string[];
  };
  targets: ActiveTarget[];
};

const coachSchema = z
  .object({
    diagnosis: z.string().min(1).max(1000),
    metric_to_improve_first: z.string().min(1).max(500),
    target_assessments: z
      .array(
        z
          .object({
            target_key: z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,95}$/),
            interpretation: z.string().min(1).max(500),
            safeguard: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(64),
    owner_actions: z
      .array(
        z
          .object({
            owner_role: z.string().min(1).max(80),
            action: z.string().min(1).max(500),
            authority_status: z.enum(["adopted", "proposed", "unknown"]),
          })
          .strict(),
      )
      .max(32),
    review_rule: z.string().min(1).max(1000),
    source_refs: z.array(z.string().min(1).max(240)).max(16),
  })
  .strict();

const ceoRequestSchema = z
  .object({
    target_key: z
      .string()
      .regex(/^[a-z0-9][a-z0-9:_-]{0,95}$/)
      .nullable(),
    request_type: z.enum([
      "confirm_target",
      "confirm_owner",
      "confirm_gate",
      "request_missing_evidence",
      "request_decision",
    ]),
    question: z.string().min(1).max(500),
    recommended_default: z.string().min(1).max(500).nullable(),
    risk_class: z.enum(["low", "medium", "high"]),
    source_ref: z.string().min(1).max(240),
  })
  .strict();

const ceoBriefSchema = z
  .object({
    summary: z.string().min(1).max(1000),
    confirmation_requests: z.array(ceoRequestSchema).max(32),
    information_requests: z.array(ceoRequestSchema).max(32),
    source_refs: z.array(z.string().min(1).max(240)).max(16),
  })
  .strict();

export type CoachAnalysis = z.infer<typeof coachSchema>;
export type CeoBrief = z.infer<typeof ceoBriefSchema>;

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function deterministicUuid(value: string) {
  const bytes = Buffer.from(sha256(`${uuidNamespace}:${value}`).slice(0, 32), "hex");
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72);
}

function section(markdown: string, heading: string) {
  const lines = markdown.split("\n");
  const headingIndex = lines.findIndex(
    (line) => /^#{2,3} /.test(line) && line.replace(/^#{2,3}\s+/, "").trim() === heading,
  );
  if (headingIndex < 0) throw new Error(`missing_source_section:${heading}`);
  const nextHeadingOffset = lines
    .slice(headingIndex + 1)
    .findIndex((line) => /^#{2,3} /.test(line));
  const endIndex =
    nextHeadingOffset < 0 ? lines.length : headingIndex + 1 + nextHeadingOffset;
  return lines.slice(headingIndex + 1, endIndex).join("\n");
}

function tableRows(markdownSection: string) {
  const rows = markdownSection
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split("|")
        .map((cell) => cell.trim()),
    )
    .filter((cells) => !cells.every((cell) => /^:?-+:?$/.test(cell)));
  if (rows.length < 2) throw new Error("missing_source_table");
  const headers = rows[0];
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])),
  );
}

function executionStatus(state: string): ActiveTarget["execution_status"] {
  const normalized = state.toUpperCase();
  if (normalized.includes("BLOCKED") || normalized.includes("NOT AUTHORIZED")) return "blocked";
  if (normalized.includes("NOT STARTED") || normalized.includes("NOT CREATED") || normalized.includes("NOT SENT"))
    return "not_started";
  if (normalized.includes("COMPLETE")) return "completed";
  if (normalized.includes("ACTIVE")) return "active";
  return "unknown";
}

function ownerAcceptance(owner: string, definition: string): ActiveTarget["owner_acceptance_status"] {
  if (/Shane|Javed/i.test(owner) || /after acceptance|explicitly accepts/i.test(definition)) return "proposed";
  if (/Ibrahim/i.test(owner)) return "founder_owned";
  return "unknown";
}

export async function loadSourceProjection(options: {
  operatingMemoryPath?: string;
  projectContextPath?: string;
  observedAt?: string;
} = {}): Promise<SourceProjection> {
  const operatingMemoryPath = options.operatingMemoryPath ?? DEFAULT_OPERATING_MEMORY_PATH;
  const projectContextPath = options.projectContextPath ?? DEFAULT_PROJECT_CONTEXT_PATH;
  const [operatingMemory, projectContext] = await Promise.all([
    readFile(operatingMemoryPath, "utf8"),
    readFile(projectContextPath, "utf8"),
  ]);

  const metricRows = tableRows(section(projectContext, "Adopted measurement sprint — 2026-07-30"));
  const gateRows = tableRows(section(projectContext, "Active gates after founder review"));
  const observedAt = options.observedAt ?? new Date().toISOString();

  const metricTargets: ActiveTarget[] = metricRows.map((row, index) => {
    const title = row.Metric.replace(/^Primary outcome:\s*/i, "");
    const targetKey = `metric:${slug(title)}`;
    return {
      id: deterministicUuid(`${observedAt}:${targetKey}`),
      target_key: targetKey,
      title,
      target_kind: index === 0 ? "business_outcome" : "leading_metric",
      authority_status: "adopted",
      execution_status: /not started/i.test(row["Current status"]) ? "not_started" : "unknown",
      owner_role: row["Accountable owner"].slice(0, 80),
      owner_acceptance_status: ownerAcceptance(row["Accountable owner"], row["Current status"]),
      baseline_status: /^UNKNOWN/i.test(row["Current status"]) ? "unknown" : "verified",
      baseline_label: /^UNKNOWN/i.test(row["Current status"]) ? null : row["Current status"].slice(0, 120),
      target_label: null,
      next_gate: `Measure exactly as defined: ${row["Exact definition"]}`.slice(0, 500),
      source_ref: `${sourceRef}#Adopted measurement sprint — 2026-07-30`,
    };
  });

  const gateTargets: ActiveTarget[] = gateRows.map((row) => {
    const targetKey = `gate:${slug(row.Gate)}`;
    const proposed = /^PROPOSED/i.test(row["Current state"]);
    return {
      id: deterministicUuid(`${observedAt}:${targetKey}`),
      target_key: targetKey,
      title: row.Gate,
      target_kind: "operating_gate",
      authority_status: proposed ? "proposed" : "adopted",
      execution_status: executionStatus(row["Current state"]),
      owner_role: row["Accountable owner"].slice(0, 80),
      owner_acceptance_status: ownerAcceptance(row["Accountable owner"], row["Definition of done"]),
      baseline_status: "unknown",
      baseline_label: null,
      target_label: null,
      next_gate: row["Definition of done"].slice(0, 500),
      source_ref: `${sourceRef}#Active gates after founder review`,
    };
  });

  const operatingPrinciples = [
    "Use canonical Obsidian operating memory first, then verify live repositories and services.",
    "Keep CEO decisions distinct from unapproved recommendations and ask one bounded decision at a time.",
    "Separate automatic work, work requiring manual input, and the evidence that proves success.",
    "Prefer incremental implementation and verification; avoid unapproved direction changes.",
  ];

  return {
    observedAt,
    operatingMemorySha256: sha256(operatingMemory),
    projectContextSha256: sha256(projectContext),
    sourceBundleSha256: sha256(
      JSON.stringify({
        operatingMemorySha256: sha256(operatingMemory),
        projectContextSha256: sha256(projectContext),
        parser: "claw-operating-context-v1",
      }),
    ),
    contextSummary: {
      company: "Claw Services",
      operating_principles: operatingPrinciples,
      active_constraints: [
        "No outreach or first touch is authorized.",
        "No lead activation or stale lead import is authorized.",
        "Public contact information is not consent.",
        "No external CRM write or production release is authorized.",
        "Commercial KPI baselines and targets remain unknown until measured or founder-set.",
      ],
      lead_activation_authorized: false,
      outreach_authorized: false,
      external_crm_writes_authorized: false,
      commercial_baselines: "unknown",
      source_refs: [
        "Obsidian: System/Operating Memory",
        sourceRef,
      ],
    },
    targets: [...metricTargets, ...gateTargets],
  };
}

function extractJson(output: string) {
  const clean = output.replace(/\u001b\[[0-9;]*m/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("hermes_non_json_output");
  return JSON.parse(clean.slice(start, end + 1)) as unknown;
}

export type HermesRunner = (profile: "sales-coach" | "default", prompt: string) => Promise<string>;

export function hermesSubprocessEnvironment(
  source: Record<string, string | undefined> = process.env,
) {
  const environment = { ...source };
  for (const key of [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_SECRET_KEY",
    "DATABASE_URL",
    "DB_URL",
    "POSTGRES_URL",
    "POSTGRES_PASSWORD",
    "REDIS_URL",
    "RESEND_API_KEY",
  ]) {
    delete environment[key];
  }
  environment.HERMES_KANBAN_TASK = "";
  return environment as NodeJS.ProcessEnv;
}

export const runHermes: HermesRunner = async (profile, prompt) => {
  const executable =
    profile === "sales-coach"
      ? process.env.HERMES_SALES_COACH_CLI ?? path.join(homedir(), ".local/bin/sales-coach")
      : process.env.HERMES_DEFAULT_CLI ?? path.join(homedir(), ".local/bin/hermes");
  const { stdout, stderr } = await execFileAsync(executable, ["-t", "context_engine", "-z", prompt], {
    cwd: process.cwd(),
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: hermesSubprocessEnvironment(),
  });
  if (stderr && !stdout.trim()) throw new Error(`hermes_failed:${profile}`);
  return stdout;
};

function sourcePacket(source: SourceProjection) {
  return {
    context_summary: source.contextSummary,
    active_targets: source.targets.map((target) => {
      const sourceOnlyTarget: Partial<ActiveTarget> = { ...target };
      delete sourceOnlyTarget.id;
      return sourceOnlyTarget;
    }),
  };
}

export async function buildHermesProjection(source: SourceProjection, runner: HermesRunner = runHermes) {
  const validTargetKeys = new Set(source.targets.map((target) => target.target_key));
  const packet = JSON.stringify(sourcePacket(source));
  const coachPrompt = [
    "Act as the configured private Claw sales coach. This is read-only analysis with no tools.",
    "Use only the structured source packet below. Preserve adopted/proposed/unknown authority exactly.",
    "Do not authorize outreach, lead activation/import, messages, production release, or external CRM writes.",
    "Do not invent numeric baselines or targets; identify founder-set values as missing.",
    "Return JSON only, with exactly: diagnosis:string, metric_to_improve_first:string,",
    "target_assessments:[{target_key,interpretation,safeguard}],",
    "owner_actions:[{owner_role,action,authority_status}], review_rule:string, source_refs:string[].",
    "Hard bounds: diagnosis/review_rule <=1000 characters; every other string <=500 characters.",
    'Every owner_actions.authority_status MUST be exactly "adopted", "proposed", or "unknown" with no added text.',
    `SOURCE_PACKET=${packet}`,
  ].join("\n");
  const coach = coachSchema.parse(extractJson(await runner("sales-coach", coachPrompt)));
  for (const assessment of coach.target_assessments) {
    if (!validTargetKeys.has(assessment.target_key)) throw new Error("coach_unknown_target");
  }

  const defaultPrompt = [
    "Act as the configured default CEO confirmation formatter. This is read-only with no tools.",
    "Use only the structured source packet and sales-coach analysis below.",
    "Create bounded questions for decisions or missing evidence on active targets; do not make the CEO decision.",
    "Do not activate leads, authorize outreach, send messages, import leads, release production, or write another CRM.",
    "Return JSON only, with exactly: summary:string,",
    "confirmation_requests:[{target_key|null,request_type,question,recommended_default|null,risk_class,source_ref}],",
    "information_requests:[same shape], source_refs:string[].",
    'request_type MUST be exactly one of "confirm_target","confirm_owner","confirm_gate","request_missing_evidence","request_decision".',
    'risk_class MUST be exactly "low","medium",or "high"; every question/default <=500 characters.',
    `SOURCE_PACKET=${packet}`,
    `SALES_COACH_ANALYSIS=${JSON.stringify(coach)}`,
  ].join("\n");
  const brief = ceoBriefSchema.parse(extractJson(await runner("default", defaultPrompt)));
  for (const request of [...brief.confirmation_requests, ...brief.information_requests]) {
    if (request.target_key && !validTargetKeys.has(request.target_key)) {
      throw new Error("default_unknown_target");
    }
  }
  return { coach, brief };
}

export function buildIngestPayload(source: SourceProjection, coach: CoachAnalysis, brief: CeoBrief) {
  const requests = [...brief.confirmation_requests, ...brief.information_requests].map(
    (request, index) => {
      const stableKey = `${source.sourceBundleSha256}:${index}:${request.request_type}:${request.target_key ?? "general"}:${request.question}`;
      return {
        id: deterministicUuid(`request:${stableKey}`),
        created_event_id: deterministicUuid(`request-created:${stableKey}`),
        ...request,
      };
    },
  );
  return {
    snapshotId: deterministicUuid(`snapshot:${source.sourceBundleSha256}:${source.observedAt}`),
    observedAt: source.observedAt,
    sourceBundleSha256: source.sourceBundleSha256,
    operatingMemorySha256: source.operatingMemorySha256,
    projectContextSha256: source.projectContextSha256,
    payload: {
      schema_version: "operating-context.v1",
      context_summary: source.contextSummary,
      sales_coach_analysis: coach,
      default_ceo_brief: brief,
      targets: source.targets,
      ceo_requests: requests,
    },
  };
}

export async function writeLocalSupabase(
  ingest: ReturnType<typeof buildIngestPayload>,
  options: { url?: string; serviceRoleKey?: string; fetchImpl?: typeof fetch } = {},
) {
  const url = options.url ?? process.env.SUPABASE_URL;
  const serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("missing_local_supabase_credentials");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("remote_context_sync_not_authorized");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `${url.replace(/\/$/, "")}/rest/v1/rpc/claw_ingest_operating_context_v1`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_snapshot_id: ingest.snapshotId,
        p_observed_at: ingest.observedAt,
        p_source_bundle_sha256: ingest.sourceBundleSha256,
        p_operating_memory_sha256: ingest.operatingMemorySha256,
        p_project_context_sha256: ingest.projectContextSha256,
        p_payload: ingest.payload,
        p_environment: "development",
        p_is_synthetic: false,
      }),
    },
  );
  if (!response.ok) throw new Error(`supabase_context_ingest_failed:${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function getLatestLocalSourceHash(
  options: { url?: string; serviceRoleKey?: string; fetchImpl?: typeof fetch } = {},
) {
  const url = options.url ?? process.env.SUPABASE_URL;
  const serviceRoleKey = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("missing_local_supabase_credentials");
  const parsed = new URL(url);
  if (!["localhost", "127.0.0.1", "::1"].includes(parsed.hostname)) {
    throw new Error("remote_context_sync_not_authorized");
  }
  const response = await (options.fetchImpl ?? fetch)(
    `${url.replace(/\/$/, "")}/rest/v1/rpc/claw_get_latest_context_source_v1`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  if (!response.ok) throw new Error(`supabase_context_status_failed:${response.status}`);
  const rows = (await response.json()) as Array<{ source_bundle_sha256?: unknown }>;
  const value = rows[0]?.source_bundle_sha256;
  return typeof value === "string" ? value : null;
}
