import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migration = readFileSync(
  path.join(
    repositoryRoot,
    "supabase/migrations/202607300005_claw_operating_context_and_ceo_review.sql",
  ),
  "utf8",
);
const executable = migration
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--.*$/gm, "")
  .replace(/\s+/g, " ")
  .trim();

test("operating context is a private append-only, service-RPC boundary", () => {
  assert.match(executable, /^begin;/i);
  assert.match(executable, /commit;$/i);
  assert.doesNotMatch(executable, /\bcascade\b/i);

  for (const table of [
    "claw_operating_context_snapshots",
    "claw_active_target_revisions",
    "claw_ceo_review_requests",
    "claw_ceo_review_events",
  ]) {
    assert.match(executable, new RegExp(`create table if not exists private\\.${table}`, "i"));
    assert.match(executable, new RegExp(`alter table private\\.${table} enable row level security`, "i"));
  }
  assert.doesNotMatch(executable, /\bcreate policy\b/i);
  assert.doesNotMatch(
    executable,
    /grant (?:select|insert|update|delete|truncate)[^;]*private\./i,
  );

  for (const rpc of [
    "claw_ingest_operating_context_v1",
    "claw_append_ceo_review_event_v1",
    "claw_get_ceo_review_queue_v1",
    "claw_get_active_targets_v1",
    "claw_get_latest_context_source_v1",
  ]) {
    assert.match(
      executable,
      new RegExp(`create function public\\.${rpc}[\\s\\S]*?security definer`, "i"),
    );
    assert.match(
      executable,
      new RegExp(`revoke all on function public\\.${rpc}[\\s\\S]*?from public, anon, authenticated, service_role`, "i"),
    );
    assert.match(
      executable,
      new RegExp(`grant execute on function public\\.${rpc}[\\s\\S]*?to service_role`, "i"),
    );
  }

  assert.match(executable, /set search_path = pg_catalog/i);
  assert.match(executable, /pg_advisory_xact_lock/i);
  assert.match(executable, /claw_context_idempotency_mismatch/i);
  assert.match(executable, /claw_context_unknown_json_key/i);
  assert.match(executable, /claw_context_external_action_not_authorized/i);
  assert.match(
    executable,
    /lead_activation_authorized[\s\S]*outreach_authorized[\s\S]*external_crm_writes_authorized/i,
  );
  assert.match(executable, /event_type in \('created', 'confirmed', 'changed', 'rejected', 'deferred', 'cancelled'\)/i);
  assert.match(executable, /v_latest\.event_type not in \('created','deferred'\)/i);
  assert.match(executable, /claw_ceo_review_terminal/i);
  assert.match(migration, /never[\s\S]*raw notes[\s\S]*prompts[\s\S]*transcripts/i);
  assert.match(migration, /does not authorize outreach[\s\S]*lead activation\/import/i);
});
