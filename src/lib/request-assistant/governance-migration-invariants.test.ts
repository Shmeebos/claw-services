import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationPath = path.join(
  repositoryRoot,
  "supabase/migrations/202607280002_claw_request_governance_foundation.sql",
);

const publicTables = [
  "public.claw_request_sessions",
  "public.claw_request_consents",
  "public.claw_request_product_events",
] as const;
const allNewTables = [
  ...publicTables,
  "private.claw_deletion_tombstones",
] as const;
const appendOnlyTables = [
  "public.claw_request_consents",
  "public.claw_request_product_events",
  "private.claw_deletion_tombstones",
] as const;

const environments = ["unknown", "production", "preview", "development", "test"] as const;
const consentTypes = ["ai_processing", "product_analytics", "model_training"] as const;
const consentEvents = ["grant", "decline", "withdraw"] as const;
const productEventNames = [
  "assistant_opened",
  "ai_opt_in_changed",
  "field_prompted",
  "field_answered",
  "field_edited",
  "ai_requested",
  "ai_suggestion_shown",
  "ai_suggestion_applied",
  "ai_suggestion_dismissed",
  "review_started",
  "training_opt_in_changed",
  "submission_started",
  "submission_accepted",
  "submission_failed",
] as const;
const fieldNames = [
  "name",
  "email",
  "business_url",
  "service",
  "request",
  "budget",
  "timeline",
] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withoutSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function tableBody(sql: string, qualifiedName: string) {
  const match = sql.match(
    new RegExp(
      `create\\s+table\\s+if\\s+not\\s+exists\\s+${escapeRegExp(qualifiedName)}\\s*\\(([\\s\\S]*?)\\n\\);`,
      "i",
    ),
  );
  assert.ok(match, `missing table definition for ${qualifiedName}`);
  return match[1];
}

function checkedValues(sql: string, constraintName: string, column: string) {
  const match = sql.match(
    new RegExp(
      `constraint\\s+${escapeRegExp(constraintName)}[\\s\\S]*?\\b${escapeRegExp(column)}\\s+in\\s*\\(([^)]*)\\)`,
      "i",
    ),
  );
  assert.ok(match, `missing closed ${column} taxonomy in ${constraintName}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function assertBoundedText(tableSql: string, column: string, maximum: number) {
  assert.match(
    tableSql,
    new RegExp(
      `char_length\\s*\\(\\s*(?:btrim\\s*\\(\\s*)?${escapeRegExp(column)}\\s*\\)?\\s*\\)\\s*(?:between\\s+\\d+\\s+and|<=)\\s*${maximum}\\b`,
      "i",
    ),
    `${column} must have an explicit ${maximum}-character bound`,
  );
}

test("Claw governance foundation is private, bounded, and append-only where required", () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    "the versioned governance-foundation migration must exist before its invariants can be verified",
  );

  const migration = readFileSync(migrationPath, "utf8");
  const executableSql = withoutSqlComments(migration);

  assert.match(executableSql, /^\s*begin\s*;/i);
  assert.match(executableSql, /commit\s*;\s*$/i);
  assert.doesNotMatch(executableSql, /create\s+policy\b/i);
  assert.doesNotMatch(executableSql, /security\s+definer/i);
  assert.doesNotMatch(executableSql, /create\s+(?:or\s+replace\s+)?function\b/i);

  for (const [column, definition] of [
    ["correlation_id", "uuid"],
    ["environment", "text"],
    ["data_class", "text"],
    ["is_synthetic", "boolean"],
    ["is_canary", "boolean"],
    ["is_employee_test", "boolean"],
    ["retention_expires_at", "timestamptz"],
    ["deletion_requested_at", "timestamptz"],
    ["deleted_at", "timestamptz"],
  ] as const) {
    assert.match(
      executableSql,
      new RegExp(
        `alter\\s+table\\s+public\\.claw_requests[\\s\\S]*?add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\s+${definition}`,
        "i",
      ),
      `claw_requests must add ${column} repeatably`,
    );
  }

  assert.match(
    executableSql,
    /alter\s+column\s+correlation_id\s+set\s+not\s+null/i,
  );
  assert.match(
    executableSql,
    /create\s+index\s+if\s+not\s+exists\s+claw_requests_correlation_id_idx\s+on\s+public\.claw_requests\s*\(\s*correlation_id\s*\)/i,
  );
  assert.deepEqual(
    checkedValues(
      executableSql,
      "claw_requests_environment_check",
      "environment",
    ),
    [...environments],
  );
  assert.match(
    executableSql,
    /add\s+column\s+if\s+not\s+exists\s+environment\s+text\s+not\s+null\s+default\s+'unknown'/i,
  );
  assert.doesNotMatch(
    executableSql,
    /alter\s+column\s+environment\s+set\s+default\s+'production'/i,
  );
  assert.deepEqual(
    checkedValues(executableSql, "claw_requests_data_class_check", "data_class"),
    ["service_delivery_only"],
  );
  for (const column of ["is_synthetic", "is_canary", "is_employee_test"]) {
    assert.match(
      executableSql,
      new RegExp(
        `add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\s+boolean\\s+not\\s+null\\s+default\\s+false`,
        "i",
      ),
    );
  }
  assert.match(
    executableSql,
    /update\s+public\.claw_requests[\s\S]*?retention_expires_at\s*=\s*accepted_at\s*\+\s*interval\s+'24 months'/i,
  );
  assert.match(
    executableSql,
    /alter\s+column\s+retention_expires_at\s+set\s+default\s*\(\s*now\s*\(\s*\)\s*\+\s*interval\s+'24 months'\s*\)/i,
  );
  assert.match(
    executableSql,
    /alter\s+column\s+retention_expires_at\s+set\s+not\s+null/i,
  );
  for (const constraintName of [
    "claw_requests_environment_check",
    "claw_requests_data_class_check",
    "claw_requests_retention_check",
    "claw_requests_deletion_timestamps_check",
  ]) {
    assert.match(executableSql, new RegExp(`\\b${constraintName}\\b`, "i"));
  }
  assert.match(executableSql, /select\s+1\s+from\s+pg_catalog\.pg_constraint/i);

  const bodies = Object.fromEntries(
    allNewTables.map((qualifiedName) => [qualifiedName, tableBody(executableSql, qualifiedName)]),
  ) as Record<(typeof allNewTables)[number], string>;

  const sessionBody = bodies["public.claw_request_sessions"];
  assert.match(sessionBody, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);
  for (const column of [
    "created_at",
    "updated_at",
    "ended_at",
    "source",
    "environment",
    "schema_version",
    "app_version",
    "is_synthetic",
    "is_canary",
    "is_employee_test",
  ]) {
    assert.match(sessionBody, new RegExp(`\\b${column}\\b`, "i"), `missing session ${column}`);
  }
  assert.deepEqual(
    checkedValues(sessionBody, "claw_request_sessions_source_check", "source"),
    ["web", "apple_app"],
  );
  assert.deepEqual(
    checkedValues(
      sessionBody,
      "claw_request_sessions_environment_check",
      "environment",
    ),
    [...environments],
  );
  assert.match(sessionBody, /\benvironment\s+text\s+not\s+null\s+default\s+'unknown'/i);
  assertBoundedText(sessionBody, "schema_version", 32);
  assertBoundedText(sessionBody, "app_version", 64);
  assert.match(
    executableSql,
    /constraint\s+claw_request_sessions_version_tokens_check[\s\S]*?schema_version\s*~[\s\S]*?app_version\s*~/i,
  );
  assert.doesNotMatch(
    sessionBody,
    /^\s*(?:transcript|answers?|prompts?|identity|content|payload|properties|metadata)\s+/im,
  );
  assert.doesNotMatch(sessionBody, /\b(?:jsonb|bytea)\b/i);
  assert.match(
    executableSql,
    /create\s+trigger\s+claw_request_sessions_set_updated_at[\s\S]*?before\s+update\s+on\s+public\.claw_request_sessions[\s\S]*?public\.claw_set_updated_at\s*\(\s*\)/i,
  );

  const consentBody = bodies["public.claw_request_consents"];
  assert.match(consentBody, /\bid\s+uuid\s+primary\s+key(?!\s+default)/i);
  assert.match(consentBody, /\brequest_id\s+uuid\b/i);
  assert.doesNotMatch(
    consentBody,
    /\brequest_id\s+uuid\s+references\s+public\.claw_requests/i,
  );
  assert.match(
    consentBody,
    /\bledger_sequence\s+bigint\s+generated\s+always\s+as\s+identity/i,
  );
  assert.match(
    consentBody,
    /constraint\s+claw_request_consents_ledger_sequence_key\s+unique\s*\(\s*ledger_sequence\s*\)/i,
  );
  assert.match(
    consentBody,
    /\bsession_id\s+uuid\s+not\s+null\s+references\s+public\.claw_request_sessions\s*\(\s*id\s*\)/i,
  );
  assert.deepEqual(
    checkedValues(consentBody, "claw_request_consents_consent_type_check", "consent_type"),
    [...consentTypes],
  );
  assert.deepEqual(
    checkedValues(consentBody, "claw_request_consents_event_type_check", "event_type"),
    [...consentEvents],
  );
  assert.deepEqual(
    checkedValues(consentBody, "claw_request_consents_source_check", "source"),
    ["web"],
  );
  assertBoundedText(executableSql, "notice_version", 64);
  assertBoundedText(executableSql, "provider_policy_version", 64);
  assert.match(
    executableSql,
    /constraint\s+claw_request_consents_version_tokens_check[\s\S]*?notice_version\s*~[\s\S]*?provider_policy_version\s*~[\s\S]*?'\^\[A-Za-z0-9\]/i,
  );
  assert.match(
    executableSql,
    /constraint\s+claw_request_consents_ai_policy_version_check[\s\S]*?consent_type\s*<>\s*'ai_processing'[\s\S]*?event_type\s*<>\s*'grant'[\s\S]*?provider_policy_version\s+is\s+not\s+null/i,
  );
  assert.match(
    executableSql,
    /event_type\s*=\s*'grant'[\s\S]*?granted\s*=\s*true[\s\S]*?withdrawn_at\s+is\s+null/i,
  );
  assert.match(
    executableSql,
    /event_type\s*=\s*'decline'[\s\S]*?granted\s*=\s*false[\s\S]*?withdrawn_at\s+is\s+null/i,
  );
  assert.match(
    executableSql,
    /event_type\s*=\s*'withdraw'[\s\S]*?granted\s*=\s*false[\s\S]*?withdrawn_at\s+is\s+not\s+null/i,
  );
  assert.doesNotMatch(consentBody, /\b(?:jsonb|bytea)\b/i);

  const productEventBody = bodies["public.claw_request_product_events"];
  assert.match(productEventBody, /\bevent_id\s+uuid\s+primary\s+key(?!\s+default)/i);
  assert.match(productEventBody, /\brequest_id\s+uuid\b/i);
  assert.doesNotMatch(
    productEventBody,
    /\brequest_id\s+uuid\s+references\s+public\.claw_requests/i,
  );
  assert.deepEqual(
    checkedValues(
      productEventBody,
      "claw_request_product_events_event_name_check",
      "event_name",
    ),
    [...productEventNames],
  );
  assert.deepEqual(
    checkedValues(
      productEventBody,
      "claw_request_product_events_field_name_check",
      "field_name",
    ),
    [...fieldNames],
  );
  assert.match(productEventBody, /\bsequence\s+integer\s+not\s+null/i);
  assert.match(
    productEventBody,
    /constraint\s+claw_request_product_events_session_sequence_key\s+unique\s*\(\s*session_id\s*,\s*sequence\s*\)/i,
  );
  assert.match(productEventBody, /sequence\s+between\s+1\s+and\s+1000000/i);
  assert.match(productEventBody, /duration_ms\s+between\s+0\s+and\s+3600000/i);
  assertBoundedText(productEventBody, "app_version", 64);
  assertBoundedText(productEventBody, "event_schema_version", 32);
  assert.match(
    productEventBody,
    /\bproperties\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i,
  );
  assert.match(productEventBody, /jsonb_typeof\s*\(\s*properties\s*\)\s*=\s*'object'/i);
  assert.match(productEventBody, /octet_length\s*\(\s*properties::text\s*\)\s*<=\s*512/i);
  assert.match(
    productEventBody,
    /properties\s*-\s*array\s*\[\s*'status'\s*,\s*'count'\s*,\s*'enabled'\s*,\s*'reason_code'\s*\]\s*=\s*'\{\}'::jsonb/i,
  );
  for (const property of ["status", "count", "enabled", "reason_code"]) {
    assert.match(productEventBody, new RegExp(`properties\\s*\\?\\s*'${property}'`, "i"));
  }
  assert.match(
    productEventBody,
    /constraint\s+claw_request_product_events_version_tokens_check[\s\S]*?app_version\s*~[\s\S]*?event_schema_version\s*~/i,
  );
  assert.match(
    productEventBody,
    /constraint\s+claw_request_product_events_properties_by_event_check/i,
  );
  for (const eventName of [
    "ai_opt_in_changed",
    "training_opt_in_changed",
    "ai_requested",
    "ai_suggestion_dismissed",
    "submission_accepted",
    "submission_failed",
  ]) {
    assert.match(
      productEventBody,
      new RegExp(
        `claw_request_product_events_properties_by_event_check[\\s\\S]*?'${eventName}'`,
        "i",
      ),
    );
  }
  assert.doesNotMatch(
    productEventBody,
    /properties\s*-\s*array\s*\[[^\]]*'(?:text|answer|prompt|output|message|content)'/i,
  );

  const tombstoneBody = bodies["private.claw_deletion_tombstones"];
  assert.match(tombstoneBody, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);
  assert.deepEqual(
    checkedValues(
      tombstoneBody,
      "claw_deletion_tombstones_source_table_check",
      "source_table",
    ),
    [
      "claw_requests",
      "claw_request_sessions",
      "claw_request_consents",
      "claw_request_product_events",
    ],
  );
  assert.deepEqual(
    checkedValues(
      tombstoneBody,
      "claw_deletion_tombstones_reason_code_check",
      "reason_code",
    ),
    [
      "customer_request",
      "retention_expired",
      "operator_correction",
      "test_data_cleanup",
      "legal_requirement",
    ],
  );
  assert.match(tombstoneBody, /\bsource_record_id\s+uuid\s+not\s+null/i);
  assert.match(tombstoneBody, /\brequest_pseudonym\s+text/i);
  assert.match(
    tombstoneBody,
    /char_length\s*\(\s*request_pseudonym\s*\)\s+between\s+43\s+and\s+43/i,
  );
  assert.match(
    tombstoneBody,
    /request_pseudonym\s*~\s*'\^\[A-Za-z0-9_-\]\{43\}\$'/i,
  );
  assert.match(
    tombstoneBody,
    /\bpseudonym_version\s+text\s+not\s+null\s+default\s+'hmac-sha256-v1'/i,
  );
  assert.match(
    tombstoneBody,
    /pseudonym_version\s*=\s*'hmac-sha256-v1'/i,
  );
  assertBoundedText(tombstoneBody, "policy_version", 64);
  assert.doesNotMatch(
    tombstoneBody,
    /^\s*(?:name|email|business_url|request|content|payload|metadata)\s+/im,
  );
  assert.doesNotMatch(tombstoneBody, /\b(?:jsonb|bytea)\b/i);

  assert.match(executableSql, /create\s+schema\s+if\s+not\s+exists\s+private\s*;/i);
  assert.match(
    executableSql,
    /revoke\s+all\s+on\s+schema\s+private\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*;/i,
  );
  assert.match(executableSql, /grant\s+usage\s+on\s+schema\s+private\s+to\s+service_role\s*;/i);

  for (const qualifiedName of allNewTables) {
    assert.match(
      executableSql,
      new RegExp(
        `alter\\s+table\\s+${escapeRegExp(qualifiedName)}\\s+enable\\s+row\\s+level\\s+security\\s*;`,
        "i",
      ),
      `RLS must be enabled on ${qualifiedName}`,
    );
    assert.match(
      executableSql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+table\\s+${escapeRegExp(qualifiedName)}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*;`,
        "i",
      ),
      `${qualifiedName} must be closed to every API-facing role`,
    );
    assert.match(
      executableSql,
      new RegExp(
        `revoke\\s+all\\s+on\\s+table\\s+${escapeRegExp(qualifiedName)}\\s+from\\s+service_role\\s*;`,
        "i",
      ),
      `${qualifiedName} service_role grants must be reset before least-privilege grants`,
    );
  }

  assert.match(
    executableSql,
    /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.claw_request_sessions\s+to\s+service_role\s*;/i,
  );
  assert.match(
    executableSql,
    /grant\s+update\s*\(\s*ended_at\s*\)\s+on\s+table\s+public\.claw_request_sessions\s+to\s+service_role\s*;/i,
  );
  assert.doesNotMatch(
    executableSql,
    /grant\s+[^;]*\bupdate\b[^;(]*\s+on\s+table\s+public\.claw_request_sessions\s+to\s+service_role\s*;/i,
  );
  assert.match(
    executableSql,
    /grant\s+usage\s*,\s*select\s+on\s+sequence\s+public\.claw_request_consents_ledger_sequence_seq\s+to\s+service_role\s*;/i,
  );
  for (const qualifiedName of appendOnlyTables) {
    assert.match(
      executableSql,
      new RegExp(
        `grant\\s+select\\s*,\\s*insert\\s+on\\s+table\\s+${escapeRegExp(qualifiedName)}\\s+to\\s+service_role\\s*;`,
        "i",
      ),
    );
    assert.doesNotMatch(
      executableSql,
      new RegExp(
        `grant\\s+[^;]*\\b(?:update|delete)\\b[^;]*\\s+on\\s+table\\s+${escapeRegExp(qualifiedName)}\\s+to\\s+service_role\\s*;`,
        "i",
      ),
      `${qualifiedName} must remain append-only for service_role`,
    );
  }

  for (const indexDefinition of [
    /create\s+index\s+if\s+not\s+exists\s+claw_requests_correlation_id_idx\s+on\s+public\.claw_requests\s*\(\s*correlation_id\s*\)\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_sessions_environment_created_at_idx\s+on\s+public\.claw_request_sessions\s*\(\s*environment\s*,\s*created_at\s+desc\s*\)\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_sessions_active_updated_at_idx\s+on\s+public\.claw_request_sessions\s*\(\s*updated_at\s+desc\s*\)\s*where\s+ended_at\s+is\s+null\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_consents_session_type_sequence_idx\s+on\s+public\.claw_request_consents\s*\(\s*session_id\s*,\s*consent_type\s*,\s*ledger_sequence\s+desc\s*\)\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_consents_request_created_at_idx\s+on\s+public\.claw_request_consents\s*\(\s*request_id\s*,\s*created_at\s+desc\s*\)\s*where\s+request_id\s+is\s+not\s+null\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_product_events_session_occurred_at_idx\s+on\s+public\.claw_request_product_events\s*\(\s*session_id\s*,\s*occurred_at\s*,\s*sequence\s*\)\s*;/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_product_events_request_occurred_at_idx\s+on\s+public\.claw_request_product_events\s*\(\s*request_id\s*,\s*occurred_at\s+desc\s*\)\s*where\s+request_id\s+is\s+not\s+null\s*;/i,
    /create\s+unique\s+index\s+if\s+not\s+exists\s+claw_deletion_tombstones_source_record_idx\s+on\s+private\.claw_deletion_tombstones\s*\(\s*source_table\s*,\s*source_record_id\s*\)\s*;/i,
  ]) {
    assert.match(executableSql, indexDefinition);
  }

  assert.doesNotMatch(
    executableSql,
    /grant\s+(?:all|select|insert|update|delete|truncate|references|trigger|execute|usage)[\s\S]*?\s+to\s+(?:public|anon|authenticated)\s*;/i,
  );
  assert.doesNotMatch(executableSql, /\b(?:serial|bigserial|smallserial)\b/i);
  assert.doesNotMatch(executableSql, /create\s+sequence\b/i);

  assert.match(migration, /no raw transcript, answer, prompt, model output, headers, IP address, user agent, or arbitrary content/i);
  assert.match(migration, /append-only/i);
  assert.match(migration, /separate consent event/i);
  assert.match(migration, /retention policy[^\n]*pending[^\n]*Ibrahim[^\n]*legal approval/i);
  assert.match(
    migration,
    /temporary\s+local-only[\s\S]*direct\s+select\s*\/\s*insert[\s\S]*remote blocker/i,
  );
  assert.match(
    migration,
    /before any remote migration[\s\S]*narrow[\s\S]*rpc[\s\S]*revoke[\s\S]*direct insert/i,
  );
  assert.match(
    migration,
    /target[ -]project[\s\S]*cost approval/i,
  );
});
