import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationPath = path.join(
  repositoryRoot,
  "supabase/migrations/202607280001_claw_request_core.sql",
);
const freshInstallPath = path.join(repositoryRoot, "supabase/claw_requests.sql");

const coreTables = [
  "public.claw_requests",
  "public.claw_request_notifications",
  "public.claw_request_events",
] as const;

const requestStatuses = [
  "new",
  "scoping",
  "in_progress",
  "review",
  "completed",
  "rejected",
] as const;

const eventTypes = [
  "accepted",
  "status_changed",
  "internal_note_added",
  "notification_sent",
  "notification_failed",
  "consent_withdrawn",
  "training_candidate_approved",
  "training_candidate_rejected",
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

function checkedValues(tableSql: string, column: string) {
  const match = tableSql.match(
    new RegExp(`\\b${escapeRegExp(column)}\\s+in\\s*\\(([^)]*)\\)`, "i"),
  );
  assert.ok(match, `missing closed check taxonomy for ${column}`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function arrayValuesAfter(sql: string, marker: RegExp) {
  const match = sql.match(
    new RegExp(`${marker.source}[\\s\\S]*?array\\s*\\[([^\\]]*)\\]`, "i"),
  );
  assert.ok(match, `missing SQL array after ${marker.source}`);
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

test("operational Claw request core migration preserves the service-only privacy boundary", () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    "the versioned operational-core migration must exist before its invariants can be verified",
  );

  const migration = readFileSync(migrationPath, "utf8");
  const freshInstall = readFileSync(freshInstallPath, "utf8");
  const executableSql = withoutSqlComments(migration);

  assert.equal(
    freshInstall,
    migration,
    "fresh-install SQL must be byte-for-byte identical to the core migration during Task A",
  );
  assert.match(
    executableSql,
    /^\s*begin\s*;/i,
    "the migration must open an explicit transaction before any schema change",
  );
  assert.match(
    executableSql,
    /commit\s*;\s*$/i,
    "the migration must commit its explicit transaction after every schema change",
  );
  assert.match(executableSql, /create\s+extension\s+if\s+not\s+exists\s+pgcrypto\s*;/i);

  const bodies = Object.fromEntries(
    coreTables.map((qualifiedName) => [qualifiedName, tableBody(executableSql, qualifiedName)]),
  ) as Record<(typeof coreTables)[number], string>;

  for (const qualifiedName of coreTables) {
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
      `${qualifiedName} must be explicitly closed to public, anon, and authenticated`,
    );
  }
  assert.doesNotMatch(executableSql, /create\s+policy\b/i);
  assert.doesNotMatch(
    executableSql,
    /grant\s+(?:all|select|insert|update|delete|truncate|references|trigger|execute|usage)[\s\S]*?\s+to\s+(?:public|anon|authenticated)\s*;/i,
  );

  const requestBody = bodies["public.claw_requests"];
  assert.match(requestBody, /\bid\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\s*\(\s*\)/i);
  assert.match(requestBody, /\bidempotency_key\s+uuid\s+not\s+null/i);
  assert.match(
    requestBody,
    /constraint\s+claw_requests_idempotency_key_key\s+unique\s*\(\s*idempotency_key\s*\)/i,
  );
  for (const column of [
    "created_at",
    "updated_at",
    "accepted_at",
    "name",
    "email",
    "business_url",
    "service",
    "request",
    "budget",
    "timeline",
    "brief",
    "status",
    "source",
    "contact_email_verified_at",
    "privacy_notice_version",
    "schema_version",
    "metadata",
  ]) {
    assert.match(requestBody, new RegExp(`\\b${column}\\b`, "i"), `missing ${column}`);
  }
  assert.match(requestBody, /\bbrief\s+jsonb\s+not\s+null/i);
  assert.match(requestBody, /jsonb_typeof\s*\(\s*brief\s*\)\s*=\s*'object'/i);
  assert.match(requestBody, /octet_length\s*\(\s*brief::text\s*\)\s*<=\s*16384/i);
  const briefKeys = [
    "summary",
    "objectives",
    "deliverables",
    "constraints",
    "success_criteria",
  ];
  assert.deepEqual(arrayValuesAfter(requestBody, /brief\s*-/i), briefKeys);
  assert.deepEqual(arrayValuesAfter(requestBody, /brief\s*\?&/i), briefKeys);
  assert.deepEqual(checkedValues(requestBody, "status"), [...requestStatuses]);
  assert.deepEqual(checkedValues(requestBody, "source"), ["web", "apple_app"]);
  assert.doesNotMatch(requestBody, /'website'/i);

  for (const [column, maximum] of [
    ["name", 120],
    ["email", 254],
    ["business_url", 2048],
    ["service", 120],
    ["request", 4000],
    ["budget", 120],
    ["timeline", 120],
    ["privacy_notice_version", 64],
    ["schema_version", 32],
  ] as const) {
    assertBoundedText(requestBody, column, maximum);
  }

  assert.match(requestBody, /\bmetadata\s+jsonb\s+not\s+null\s+default\s+'\{\}'::jsonb/i);
  assert.match(requestBody, /jsonb_typeof\s*\(\s*metadata\s*\)\s*=\s*'object'/i);
  assert.match(requestBody, /octet_length\s*\(\s*metadata::text\s*\)\s*<=\s*2048/i);
  assert.deepEqual(arrayValuesAfter(requestBody, /metadata\s*-/i), [
    "campaign_source",
    "campaign_medium",
    "campaign_name",
    "landing_path",
    "locale",
    "assistant_mode",
  ]);
  assert.doesNotMatch(
    requestBody,
    /\b(?:raw_ip|ip_address|user_agent|headers?|referrer_url|full_referrer)\b/i,
  );

  const notificationBody = bodies["public.claw_request_notifications"];
  for (const column of [
    "request_id",
    "recipient_type",
    "template_key",
    "status",
    "attempt_count",
    "max_attempts",
    "last_error_class",
    "available_at",
    "locked_at",
    "sent_at",
    "created_at",
    "updated_at",
    "deduplication_key",
  ]) {
    assert.match(notificationBody, new RegExp(`\\b${column}\\b`, "i"), `missing ${column}`);
  }
  assert.deepEqual(checkedValues(notificationBody, "recipient_type"), ["customer", "team"]);
  assert.deepEqual(checkedValues(notificationBody, "template_key"), [
    "request_received_customer",
    "request_received_team",
  ]);
  assert.match(
    notificationBody,
    /constraint\s+claw_request_notifications_recipient_template_pair_check[\s\S]*?recipient_type\s*=\s*'customer'[\s\S]*?template_key\s*=\s*'request_received_customer'[\s\S]*?recipient_type\s*=\s*'team'[\s\S]*?template_key\s*=\s*'request_received_team'/i,
  );
  assert.deepEqual(checkedValues(notificationBody, "status"), [
    "pending",
    "processing",
    "sent",
    "failed",
    "cancelled",
  ]);
  assert.match(notificationBody, /attempt_count\s+smallint\s+not\s+null\s+default\s+0/i);
  assert.match(notificationBody, /attempt_count\s+between\s+0\s+and\s+10/i);
  assert.match(
    notificationBody,
    /constraint\s+claw_request_notifications_deduplication_key_key\s+unique\s*\(\s*deduplication_key\s*\)/i,
  );
  assert.doesNotMatch(notificationBody, /^\s*(?:message_body|body|payload|content|headers?)\s+/im);
  assert.doesNotMatch(notificationBody, /\b(?:jsonb|bytea)\b/i);

  const eventBody = bodies["public.claw_request_events"];
  assert.deepEqual(checkedValues(eventBody, "event_type"), [...eventTypes]);
  assert.doesNotMatch(
    eventBody,
    /^\s*(?:note|note_body|message|body|payload|content|ui_event|clickstream)\s+/im,
  );
  assert.doesNotMatch(eventBody, /\b(?:jsonb|bytea)\b/i);

  assert.match(
    executableSql,
    /create\s+or\s+replace\s+function\s+public\.claw_set_updated_at\s*\(\s*\)[\s\S]*?returns\s+trigger/i,
  );
  assert.match(
    executableSql,
    /revoke\s+all\s+on\s+function\s+public\.claw_set_updated_at\s*\(\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated\s*,\s*service_role\s*;/i,
  );
  for (const [triggerName, tableName] of [
    ["claw_requests_set_updated_at", "claw_requests"],
    ["claw_request_notifications_set_updated_at", "claw_request_notifications"],
  ] as const) {
    assert.match(
      executableSql,
      new RegExp(
        `create\\s+trigger\\s+${triggerName}[\\s\\S]*?before\\s+update\\s+on\\s+public\\.${tableName}`,
        "i",
      ),
    );
  }

  for (const indexPattern of [
    /create\s+index\s+if\s+not\s+exists\s+claw_requests_status_created_at_idx\s+on\s+public\.claw_requests\s*\(\s*status\s*,\s*created_at\s+desc\s*\)/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_notifications_status_available_at_idx\s+on\s+public\.claw_request_notifications\s*\(\s*status\s*,\s*available_at\s*,\s*created_at\s*\)/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_notifications_request_id_idx\s+on\s+public\.claw_request_notifications\s*\(\s*request_id\s*\)/i,
    /create\s+index\s+if\s+not\s+exists\s+claw_request_events_request_id_created_at_idx\s+on\s+public\.claw_request_events\s*\(\s*request_id\s*,\s*created_at\s+desc\s*\)/i,
  ]) {
    assert.match(executableSql, indexPattern);
  }

  assert.match(
    executableSql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.claw_requests\s+to\s+service_role\s*;/i,
  );
  assert.match(
    executableSql,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.claw_request_notifications\s+to\s+service_role\s*;/i,
  );
  assert.match(
    executableSql,
    /grant\s+select\s*,\s*insert\s+on\s+table\s+public\.claw_request_events\s+to\s+service_role\s*;/i,
  );
  for (const [tableName, forbiddenPrivileges] of [
    ["claw_requests", "delete|truncate|references|trigger|all"],
    ["claw_request_notifications", "delete|truncate|references|trigger|all"],
    ["claw_request_events", "update|delete|truncate|references|trigger|all"],
  ] as const) {
    assert.doesNotMatch(
      executableSql,
      new RegExp(
        `grant\\s+[^;]*\\b(?:${forbiddenPrivileges})\\b[^;]*\\s+on\\s+table\\s+public\\.${tableName}\\s+to\\s+service_role\\s*;`,
        "i",
      ),
      `${tableName} grants exceed the documented service_role privilege surface`,
    );
  }
  assert.doesNotMatch(executableSql, /\b(?:serial|bigserial|smallserial)\b/i);
  assert.doesNotMatch(executableSql, /generated\s+(?:always|by\s+default)\s+as\s+identity/i);
  assert.doesNotMatch(executableSql, /create\s+sequence\b/i);

  assert.doesNotMatch(
    executableSql,
    /create\s+(?:or\s+replace\s+)?function\s+public\.claw_accept_request(?:_v[0-9]+)?\s*\(/i,
  );
  for (const taskBTable of [
    "claw_request_consent_events",
    "claw_request_sessions",
    "claw_model_runs",
    "claw_request_feedback",
    "claw_training_candidates",
    "claw_deletion_tombstones",
  ]) {
    assert.doesNotMatch(
      executableSql,
      new RegExp(`create\\s+table[\\s\\S]*?\\b${taskBTable}\\b`, "i"),
    );
  }

  assert.match(migration, /service-role-only Next\.js trust boundary/i);
  assert.match(migration, /no raw IP addresses, raw user agents, arbitrary headers, or full referrer URLs/i);
  assert.match(migration, /no message body or arbitrary payload/i);
  assert.match(migration, /no note body, UI clickstream, or arbitrary JSON content channel/i);
});
