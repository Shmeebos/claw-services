import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationPath = path.join(
  repositoryRoot,
  "supabase/migrations/202607280004_claw_append_consent_event_v1.sql",
);
const exactSignature = "uuid, uuid, uuid, text, text, text, text";

function withoutSqlComments(sql: string) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

function compact(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

test("append-only consent lifecycle RPC is serialized, replay-safe, and least-privilege", () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    "missing ordered B2A append-only consent lifecycle migration",
  );

  const migration = readFileSync(migrationPath, "utf8");
  const executable = compact(withoutSqlComments(migration));
  const withComments = compact(migration);

  assert.match(executable, /^begin;/i);
  assert.match(executable, /commit;$/i);
  assert.doesNotMatch(executable, /\bcascade\b/i);

  const functionDefinition = executable.match(
    /create function public\.claw_append_consent_event_v1\s*\(([\s\S]*?)\)\s*returns table\s*\(([\s\S]*?)\)\s*language plpgsql\s+volatile\s+security definer/i,
  );
  assert.ok(functionDefinition, "missing exact VOLATILE SECURITY DEFINER function");

  const argumentsList = functionDefinition[1]
    .split(",")
    .map((argument) => compact(argument));
  assert.deepEqual(argumentsList, [
    "p_event_id uuid",
    "p_request_id uuid",
    "p_session_id uuid",
    "p_consent_type text",
    "p_event_type text",
    "p_notice_version text",
    "p_provider_policy_version text",
  ]);
  assert.doesNotMatch(functionDefinition[1], /\bdefault\b|:=/i);

  const returnColumns = functionDefinition[2]
    .split(",")
    .map((column) => compact(column));
  assert.deepEqual(returnColumns, [
    "event_id uuid",
    "ledger_sequence bigint",
    "recorded_at timestamptz",
    "event_type text",
    "recorded_granted boolean",
  ]);

  assert.match(executable, /set search_path = pg_catalog/i);
  assert.match(executable, /set timezone = 'UTC'/i);
  assert.match(executable, /set datestyle = 'ISO, YMD'/i);
  assert.match(
    withComments,
    /recorded historical event fields[\s\S]*never current state[\s\S]*propagation proof/i,
  );

  const staleCleanup = executable.match(
    /do \$drop_old_consent_event_overloads\$[\s\S]*?\$drop_old_consent_event_overloads\$;/i,
  );
  assert.ok(staleCleanup, "missing signature-specific stale-overload cleanup");
  assert.match(staleCleanup[0], /pg_catalog\.pg_proc/i);
  assert.match(staleCleanup[0], /pg_catalog\.pg_namespace/i);
  assert.match(staleCleanup[0], /procedure\.proname = 'claw_append_consent_event_v1'/i);
  assert.match(staleCleanup[0], /pg_catalog\.pg_get_function_identity_arguments/i);
  assert.match(staleCleanup[0], /drop function %I\.%I\(%s\)/i);
  assert.doesNotMatch(staleCleanup[0], /cascade/i);

  assert.match(executable, /pg_catalog\.btrim\(p_consent_type\)/i);
  assert.match(executable, /pg_catalog\.btrim\(p_event_type\)/i);
  assert.match(executable, /pg_catalog\.btrim\(p_notice_version\)/i);
  assert.match(executable, /pg_catalog\.btrim\(p_provider_policy_version\)/i);
  assert.match(
    executable,
    /v_consent_type not in \('ai_processing', 'product_analytics', 'model_training'\)/i,
  );
  assert.match(executable, /v_event_type not in \('grant', 'withdraw'\)/i);
  assert.match(executable, /char_length\(v_notice_version\) between 1 and 64/i);
  assert.match(executable, /char_length\(v_provider_policy_version\) between 1 and 64/i);
  assert.match(executable, /claw_append_consent_event_invalid_input/i);
  assert.match(executable, /claw_append_consent_event_invalid_version/i);
  assert.match(executable, /claw_append_consent_event_invalid_policy/i);
  assert.match(executable, /claw_append_consent_event_request_unavailable/i);
  assert.match(executable, /claw_append_consent_event_session_unavailable/i);
  assert.match(executable, /claw_append_consent_event_lineage_unavailable/i);
  assert.match(executable, /claw_append_consent_event_invalid_transition/i);
  assert.match(executable, /claw_append_consent_event_idempotency_mismatch/i);

  assert.match(executable, /v_now timestamptz := pg_catalog\.statement_timestamp\(\)/i);
  assert.doesNotMatch(
    functionDefinition[1],
    /p_(?:granted|source|created_at|recorded_at|withdrawn_at|current_state)/i,
  );

  const lockIndex = executable.search(/pg_catalog\.pg_advisory_xact_lock\s*\(/i);
  const replayIndex = executable.search(/where existing_consent\.id = p_event_id/i);
  const requestGuardIndex = executable.search(
    /where request_row\.id = p_request_id[\s\S]*?request_row\.deleted_at is null/i,
  );
  const latestStateIndex = executable.search(
    /order by latest_consent\.ledger_sequence desc[\s\S]*?limit 1/i,
  );
  const transitionIndex = executable.search(/claw_append_consent_event_invalid_transition/i);
  assert.ok(lockIndex >= 0, "missing transaction advisory lock");
  assert.match(
    executable,
    /perform pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\([\s\S]*?p_request_id::text[\s\S]*?p_session_id::text[\s\S]*?v_consent_type[\s\S]*?, 0\s*\)\s*\);/i,
  );
  assert.ok(replayIndex > lockIndex, "event UUID replay lookup must occur under the lock");
  assert.ok(
    requestGuardIndex > replayIndex,
    "exact historical replay must precede live-request checks",
  );
  assert.ok(
    latestStateIndex > lockIndex,
    "latest-state SELECT must be a later statement after lock acquisition",
  );
  assert.ok(
    transitionIndex > replayIndex,
    "event UUID replay must be checked before current-transition rules",
  );

  assert.match(
    executable,
    /v_existing_consent\.request_id is not distinct from p_request_id[\s\S]*?v_existing_consent\.session_id is not distinct from p_session_id[\s\S]*?v_existing_consent\.consent_type is not distinct from v_consent_type[\s\S]*?v_existing_consent\.event_type is not distinct from v_event_type[\s\S]*?v_existing_consent\.notice_version is not distinct from v_notice_version[\s\S]*?v_existing_consent\.provider_policy_version is not distinct from v_provider_policy_version/i,
  );
  assert.match(
    executable,
    /v_existing_consent\.granted is not distinct from v_recorded_granted[\s\S]*?v_existing_consent\.source is not distinct from 'web'/i,
  );
  assert.match(
    executable,
    /v_event_type = 'grant'[\s\S]*?v_latest_consent\.event_type not in \('decline', 'withdraw'\)[\s\S]*?v_event_type = 'withdraw'[\s\S]*?v_latest_consent\.event_type <> 'grant'/i,
  );

  const consentInsertIndex = executable.search(
    /insert into public\.claw_request_consents\s*\(/i,
  );
  const auditInsertIndex = executable.search(/insert into public\.claw_request_events\s*\(/i);
  assert.ok(consentInsertIndex >= 0, "missing closed consent ledger insert");
  assert.ok(auditInsertIndex > consentInsertIndex, "audit must follow successful consent insert");
  assert.match(
    executable,
    /insert into public\.claw_request_consents\s*\( id, request_id, session_id, consent_type, granted, notice_version, provider_policy_version, created_at, withdrawn_at, source, event_type \)[\s\S]*?on conflict \(id\) do nothing returning \*/i,
  );
  assert.match(
    executable,
    /v_event_type = 'withdraw'[\s\S]*?insert into public\.claw_request_events\s*\( request_id, created_at, event_type, actor_type, actor_id, previous_status, new_status \)[\s\S]*?'consent_withdrawn'[\s\S]*?'service_role'[\s\S]*?null[\s\S]*?null[\s\S]*?null/i,
  );
  assert.match(executable, /created_at,[\s\S]*?withdrawn_at,[\s\S]*?source,[\s\S]*?event_type/i);
  assert.match(executable, /v_now,[\s\S]*?case when v_event_type = 'withdraw' then v_now else null end,[\s\S]*?'web'/i);
  assert.match(
    executable,
    /if not v_inserted then[\s\S]*?where raced_consent\.id = p_event_id[\s\S]*?claw_append_consent_event_idempotency_mismatch/i,
  );
  assert.match(
    executable,
    /v_raced_consent\.request_id is not distinct from p_request_id[\s\S]*?v_raced_consent\.session_id is not distinct from p_session_id[\s\S]*?v_raced_consent\.consent_type is not distinct from v_consent_type[\s\S]*?v_raced_consent\.event_type is not distinct from v_event_type[\s\S]*?v_raced_consent\.notice_version is not distinct from v_notice_version[\s\S]*?v_raced_consent\.provider_policy_version is not distinct from v_provider_policy_version[\s\S]*?v_raced_consent\.granted is not distinct from v_recorded_granted[\s\S]*?v_raced_consent\.source is not distinct from 'web'/i,
  );

  const escapedSignature = exactSignature.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(
    executable,
    new RegExp(
      `revoke all on function public\\.claw_append_consent_event_v1\\(\\s*${escapedSignature}\\s*\\) from public, anon, authenticated, service_role`,
      "i",
    ),
  );
  assert.match(
    executable,
    new RegExp(
      `grant execute on function public\\.claw_append_consent_event_v1\\(\\s*${escapedSignature}\\s*\\) to service_role`,
      "i",
    ),
  );
  assert.match(
    executable,
    /revoke all on table public\.claw_request_consents from service_role/i,
  );
  assert.match(executable, /pg_catalog\.has_any_column_privilege\(/i);
  assert.match(
    executable,
    /revoke all on sequence public\.claw_request_consents_ledger_sequence_seq from service_role/i,
  );
  assert.doesNotMatch(
    executable,
    /grant [^;]* on (?:table public\.claw_request_consents|sequence public\.claw_request_consents_ledger_sequence_seq) to service_role/i,
  );
  assert.doesNotMatch(
    executable,
    /(?:revoke|grant) [^;]* on (?:table )?(?:public\.claw_request_sessions|public\.claw_request_product_events|private\.claw_deletion_tombstones|public\.claw_requests|public\.claw_request_notifications|public\.claw_request_events)/i,
  );

  assert.doesNotMatch(
    migration,
    /src\/app|route\.ts|RequestWorkspace|NextResponse|export\s+async\s+function/i,
  );
  assert.match(withComments, /LOCAL-ONLY/i);
  assert.match(withComments, /remaining direct grants/i);
  assert.match(withComments, /prospective[\s\S]*enforcement[\s\S]*propagation[\s\S]*deletion/i);
  assert.match(withComments, /legal[\s\S]*product/i);
  assert.match(withComments, /hosted verification/i);
});
