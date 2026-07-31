import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const migrationPath = path.join(
  repositoryRoot,
  "supabase/migrations/202607280003_claw_accept_request_v1.sql",
);

const signatureTypes = [
  "uuid", "uuid", "uuid",
  "text", "text", "text", "text", "text", "text", "text",
  "jsonb", "text", "text", "jsonb",
  "text", "text", "text", "boolean", "boolean", "boolean",
  "uuid", "boolean", "text", "text",
  "uuid", "boolean", "text",
  "uuid", "boolean", "text",
  "jsonb",
].join(", ");

test("atomic request acceptance RPC is private, replay-safe, and bounded", () => {
  assert.equal(
    existsSync(migrationPath),
    true,
    "missing ordered B1B acceptance RPC migration",
  );

  const sql = readFileSync(migrationPath, "utf8");
  const normalizedWithComments = sql.replace(/\s+/g, " ").trim();
  const normalized = sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  assert.match(normalized, /^begin;/i);
  assert.match(normalized, /commit;$/i);
  assert.doesNotMatch(normalized, /\bcascade\b/i);

  assert.match(
    normalized,
    /create table if not exists private\.claw_request_acceptance_receipts/i,
  );
  assert.match(normalized, /input_fingerprint bytea not null/i);
  assert.match(normalized, /octet_length\(input_fingerprint\) = 32/i);
  assert.match(
    normalized,
    /alter table private\.claw_request_acceptance_receipts enable row level security/i,
  );
  assert.match(
    normalized,
    /revoke all on table private\.claw_request_acceptance_receipts from public, anon, authenticated, service_role/i,
  );

  assert.match(
    normalized,
    /from pg_catalog\.pg_proc[\s\S]*proname = 'claw_accept_request_v1'[\s\S]*drop function/i,
  );
  assert.match(
    normalized,
    new RegExp(
      `create function public\\.claw_accept_request_v1\\s*\\([\\s\\S]*?\\) returns table`,
      "i",
    ),
  );
  assert.match(normalized, /language plpgsql security definer set search_path = pg_catalog/i);
  assert.match(normalized, /set timezone = 'UTC'/i);
  assert.match(normalized, /set datestyle = 'ISO, YMD'/i);
  assert.match(
    normalized,
    /exception when data_exception then raise exception using errcode = '22023', message = 'claw_accept_request_invalid_telemetry_value'/i,
  );
  assert.match(normalized, /on conflict \(idempotency_key\) do nothing/i);
  assert.match(normalized, /for update/i);
  assert.match(normalized, /claw_accept_request_idempotency_mismatch/i);
  assert.match(normalized, /extensions\.digest\([\s\S]*'sha256'/i);
  assert.match(normalized, /pg_catalog\.gen_random_uuid\(\)/i);
  assert.doesNotMatch(normalized, /public\.(digest|gen_random_uuid)\(/i);

  assert.match(normalized, /jsonb_array_length\(p_product_events\) > 50/i);
  assert.match(normalized, /octet_length\(p_product_events::text\) > 32768/i);
  assert.match(
    normalized,
    /v_item - array\[ 'event_id', 'occurred_at', 'sequence', 'event_name', 'field_name', 'duration_ms', 'app_version', 'event_schema_version', 'properties' \] <> '\{\}'::jsonb/i,
  );
  assert.match(normalized, /not p_analytics_granted[\s\S]*jsonb_array_length\(p_product_events\) > 0/i);
  assert.match(normalized, /claw_accept_request_analytics_consent_required/i);

  assert.match(normalized, /'web'[\s\S]*'new'[\s\S]*'service_delivery_only'/i);
  assert.match(normalized, /interval '24 months'/i);
  assert.match(normalized, /request_received_customer/i);
  assert.match(normalized, /request_received_team/i);
  assert.match(normalized, /event_type[\s\S]*'accepted'/i);
  assert.match(normalized, /'ai_processing'/i);
  assert.match(normalized, /'product_analytics'/i);
  assert.match(normalized, /'model_training'/i);

  assert.match(
    normalized,
    new RegExp(
      `revoke all on function public\\.claw_accept_request_v1\\(${signatureTypes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) from public, anon, authenticated, service_role`,
      "i",
    ),
  );
  assert.match(
    normalized,
    new RegExp(
      `grant execute on function public\\.claw_accept_request_v1\\(${signatureTypes.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\) to service_role`,
      "i",
    ),
  );

  assert.match(normalizedWithComments, /TEMPORARY LOCAL-ONLY/i);
  assert.match(normalizedWithComments, /remote blocker/i);
  assert.match(normalizedWithComments, /narrow lifecycle RPCs/i);
});
