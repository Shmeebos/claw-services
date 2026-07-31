-- Claw operating-context and CEO-review ledger (LOCAL-ONLY).
--
-- A local worker may read the approved Obsidian operating memory and ask the
-- tool-disabled Hermes sales-coach/default profiles for bounded JSON. Only hashes,
-- citations, active-target facts, and decision requests cross this boundary: never
-- raw notes, prompts, transcripts, secrets, contact data, or model reasoning.
--
-- This migration does not authorize outreach, lead activation/import, CRM mutation,
-- production release, or any other external action.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.claw_operating_context_snapshots (
  id uuid primary key,
  ledger_sequence bigint generated always as identity unique,
  observed_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.statement_timestamp(),
  source_bundle_sha256 text not null,
  operating_memory_sha256 text not null,
  project_context_sha256 text not null,
  sales_coach_profile text not null,
  default_profile text not null,
  schema_version text not null,
  environment text not null,
  is_synthetic boolean not null,
  context_summary jsonb not null,
  sales_coach_analysis jsonb not null,
  default_ceo_brief jsonb not null,
  ingest_fingerprint bytea not null,

  constraint claw_context_source_hashes_check check (
    source_bundle_sha256 ~ '^[0-9a-f]{64}$'
    and operating_memory_sha256 ~ '^[0-9a-f]{64}$'
    and project_context_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint claw_context_profiles_check check (
    sales_coach_profile = 'sales-coach' and default_profile = 'default'
  ),
  constraint claw_context_schema_version_check check (
    schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,31}$'
  ),
  constraint claw_context_environment_check check (
    environment in ('development', 'test')
  ),
  constraint claw_context_json_sizes_check check (
    pg_catalog.octet_length(context_summary::text) <= 65536
    and pg_catalog.octet_length(sales_coach_analysis::text) <= 65536
    and pg_catalog.octet_length(default_ceo_brief::text) <= 65536
  )
);

create table if not exists private.claw_active_target_revisions (
  id uuid primary key,
  ledger_sequence bigint generated always as identity unique,
  snapshot_id uuid not null references private.claw_operating_context_snapshots(id) on delete restrict,
  target_key text not null,
  title text not null,
  target_kind text not null,
  authority_status text not null,
  execution_status text not null,
  owner_role text not null,
  owner_acceptance_status text not null,
  baseline_status text not null,
  baseline_label text,
  target_label text,
  next_gate text not null,
  source_ref text not null,
  observed_at timestamptz not null,

  constraint claw_target_key_check check (
    target_key ~ '^[a-z0-9][a-z0-9:_-]{0,95}$'
  ),
  constraint claw_target_title_check check (char_length(btrim(title)) between 1 and 240),
  constraint claw_target_kind_check check (target_kind in ('business_outcome', 'leading_metric', 'operating_gate')),
  constraint claw_target_authority_check check (authority_status in ('adopted', 'proposed', 'unknown')),
  constraint claw_target_execution_check check (
    execution_status in ('not_started', 'active', 'blocked', 'completed', 'cancelled', 'unknown')
  ),
  constraint claw_target_owner_check check (
    char_length(btrim(owner_role)) between 1 and 80
    and owner_acceptance_status in ('founder_owned', 'proposed', 'sent', 'accepted', 'unknown')
  ),
  constraint claw_target_baseline_check check (
    baseline_status in ('verified', 'unknown')
    and (baseline_label is null or char_length(btrim(baseline_label)) between 1 and 120)
    and (target_label is null or char_length(btrim(target_label)) between 1 and 120)
  ),
  constraint claw_target_gate_source_check check (
    char_length(btrim(next_gate)) between 1 and 500
    and char_length(btrim(source_ref)) between 1 and 240
  ),
  constraint claw_target_snapshot_key_unique unique (snapshot_id, target_key)
);

create table if not exists private.claw_ceo_review_requests (
  id uuid primary key,
  ledger_sequence bigint generated always as identity unique,
  snapshot_id uuid not null references private.claw_operating_context_snapshots(id) on delete restrict,
  target_key text,
  request_type text not null,
  question text not null,
  recommended_default text,
  risk_class text not null,
  requested_by_profile text not null,
  coached_by_profile text not null,
  source_ref text not null,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),

  constraint claw_ceo_request_target_key_check check (
    target_key is null or target_key ~ '^[a-z0-9][a-z0-9:_-]{0,95}$'
  ),
  constraint claw_ceo_request_type_check check (
    request_type in ('confirm_target', 'confirm_owner', 'confirm_gate', 'request_missing_evidence', 'request_decision')
  ),
  constraint claw_ceo_request_text_check check (
    char_length(btrim(question)) between 1 and 500
    and (recommended_default is null or char_length(btrim(recommended_default)) between 1 and 500)
    and char_length(btrim(source_ref)) between 1 and 240
  ),
  constraint claw_ceo_request_risk_check check (risk_class in ('low', 'medium', 'high')),
  constraint claw_ceo_request_profiles_check check (
    requested_by_profile = 'default' and coached_by_profile = 'sales-coach'
  )
);

create table if not exists private.claw_ceo_review_events (
  id uuid primary key,
  ledger_sequence bigint generated always as identity unique,
  review_request_id uuid not null references private.claw_ceo_review_requests(id) on delete restrict,
  event_type text not null,
  actor_type text not null,
  decision_value text,
  evidence_ref text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),

  constraint claw_ceo_event_type_check check (
    event_type in ('created', 'confirmed', 'changed', 'rejected', 'deferred', 'cancelled')
  ),
  constraint claw_ceo_event_actor_check check (actor_type in ('system', 'ceo')),
  constraint claw_ceo_event_shape_check check (
    (event_type = 'created' and actor_type = 'system' and decision_value is null)
    or (
      event_type <> 'created'
      and actor_type = 'ceo'
      and (
        (event_type = 'changed' and char_length(btrim(decision_value)) between 1 and 500)
        or (event_type <> 'changed' and decision_value is null)
      )
    )
  ),
  constraint claw_ceo_event_evidence_check check (
    evidence_ref is null or char_length(btrim(evidence_ref)) between 1 and 240
  )
);

create index if not exists claw_active_targets_key_sequence_idx
  on private.claw_active_target_revisions(target_key, ledger_sequence desc);
create index if not exists claw_ceo_review_events_request_sequence_idx
  on private.claw_ceo_review_events(review_request_id, ledger_sequence desc);

alter table private.claw_operating_context_snapshots enable row level security;
alter table private.claw_active_target_revisions enable row level security;
alter table private.claw_ceo_review_requests enable row level security;
alter table private.claw_ceo_review_events enable row level security;

comment on table private.claw_operating_context_snapshots is
  'Append-only, bounded operating-context projections. Raw Obsidian text, Hermes prompts/transcripts, secrets, contact data, and hidden reasoning are forbidden.';
comment on table private.claw_active_target_revisions is
  'Append-only target facts. Proposed and unknown states must never be upgraded by model inference.';
comment on table private.claw_ceo_review_requests is
  'Decision and evidence questions for the CEO; a request is not authorization or execution.';
comment on table private.claw_ceo_review_events is
  'Append-only CEO disposition ledger. No event activates leads, sends outreach, or mutates another CRM.';

create function public.claw_ingest_operating_context_v1(
  p_snapshot_id uuid,
  p_observed_at timestamptz,
  p_source_bundle_sha256 text,
  p_operating_memory_sha256 text,
  p_project_context_sha256 text,
  p_payload jsonb,
  p_environment text,
  p_is_synthetic boolean
)
returns table (
  snapshot_id uuid,
  was_created boolean,
  target_count integer,
  ceo_request_count integer,
  recorded_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
set DateStyle = 'ISO, YMD'
as $function$
declare
  v_payload jsonb := p_payload;
  v_context jsonb;
  v_coach jsonb;
  v_brief jsonb;
  v_targets jsonb;
  v_requests jsonb;
  v_fingerprint bytea;
  v_existing private.claw_operating_context_snapshots%rowtype;
  v_recorded_at timestamptz := pg_catalog.statement_timestamp();
  v_target jsonb;
  v_request jsonb;
  v_target_count integer;
  v_request_count integer;
  v_allowed_keys text[] := array['schema_version','context_summary','sales_coach_analysis','default_ceo_brief','targets','ceo_requests'];
begin
  if p_snapshot_id is null or p_observed_at is null or v_payload is null
    or p_source_bundle_sha256 !~ '^[0-9a-f]{64}$'
    or p_operating_memory_sha256 !~ '^[0-9a-f]{64}$'
    or p_project_context_sha256 !~ '^[0-9a-f]{64}$'
    or p_environment not in ('development', 'test')
    or p_is_synthetic is null
    or pg_catalog.jsonb_typeof(v_payload) <> 'object'
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_payload) as supplied(key)
      where not (supplied.key = any(v_allowed_keys))
    )
    or not (v_payload ?& v_allowed_keys)
  then
    raise exception using errcode = '22023', message = 'claw_context_invalid_input';
  end if;

  v_context := v_payload -> 'context_summary';
  v_coach := v_payload -> 'sales_coach_analysis';
  v_brief := v_payload -> 'default_ceo_brief';
  v_targets := v_payload -> 'targets';
  v_requests := v_payload -> 'ceo_requests';

  if (v_payload ->> 'schema_version') !~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,31}$'
    or pg_catalog.jsonb_typeof(v_context) <> 'object'
    or pg_catalog.jsonb_typeof(v_coach) <> 'object'
    or pg_catalog.jsonb_typeof(v_brief) <> 'object'
    or pg_catalog.jsonb_typeof(v_targets) <> 'array'
    or pg_catalog.jsonb_typeof(v_requests) <> 'array'
    or pg_catalog.octet_length(v_context::text) > 65536
    or pg_catalog.octet_length(v_coach::text) > 65536
    or pg_catalog.octet_length(v_brief::text) > 65536
    or pg_catalog.jsonb_array_length(v_targets) > 64
    or pg_catalog.jsonb_array_length(v_requests) > 64
  then
    raise exception using errcode = '22023', message = 'claw_context_invalid_payload';
  end if;

  if exists (
      select 1 from pg_catalog.jsonb_object_keys(v_context) supplied(key)
      where supplied.key <> all(array[
        'company','operating_principles','active_constraints',
        'lead_activation_authorized','outreach_authorized',
        'external_crm_writes_authorized','commercial_baselines','source_refs'
      ])
    )
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_coach) supplied(key)
      where supplied.key <> all(array[
        'diagnosis','metric_to_improve_first','target_assessments',
        'owner_actions','review_rule','source_refs'
      ])
    )
    or exists (
      select 1 from pg_catalog.jsonb_object_keys(v_brief) supplied(key)
      where supplied.key <> all(array[
        'summary','confirmation_requests','information_requests','source_refs'
      ])
    )
  then
    raise exception using errcode = '22023', message = 'claw_context_unknown_json_key';
  end if;

  if coalesce(v_context ->> 'lead_activation_authorized', 'false') <> 'false'
    or coalesce(v_context ->> 'outreach_authorized', 'false') <> 'false'
    or coalesce(v_context ->> 'external_crm_writes_authorized', 'false') <> 'false'
  then
    raise exception using errcode = '42501', message = 'claw_context_external_action_not_authorized';
  end if;

  v_fingerprint := extensions.digest(
    pg_catalog.convert_to(
      pg_catalog.jsonb_build_object(
        'contract', 'claw_ingest_operating_context_v1',
        'snapshot_id', p_snapshot_id,
        'observed_at', p_observed_at,
        'source_bundle_sha256', p_source_bundle_sha256,
        'operating_memory_sha256', p_operating_memory_sha256,
        'project_context_sha256', p_project_context_sha256,
        'payload', v_payload,
        'environment', p_environment,
        'is_synthetic', p_is_synthetic
      )::text,
      'UTF8'
    ),
    'sha256'
  );

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_snapshot_id::text, 0));
  select snapshot.* into v_existing
  from private.claw_operating_context_snapshots as snapshot
  where snapshot.id = p_snapshot_id;

  if found then
    if v_existing.ingest_fingerprint = v_fingerprint then
      return query select v_existing.id, false,
        (select count(*)::integer from private.claw_active_target_revisions t where t.snapshot_id = v_existing.id),
        (select count(*)::integer from private.claw_ceo_review_requests r where r.snapshot_id = v_existing.id),
        v_existing.recorded_at;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'claw_context_idempotency_mismatch';
  end if;

  insert into private.claw_operating_context_snapshots (
    id, observed_at, recorded_at, source_bundle_sha256, operating_memory_sha256,
    project_context_sha256, sales_coach_profile, default_profile, schema_version,
    environment, is_synthetic, context_summary, sales_coach_analysis,
    default_ceo_brief, ingest_fingerprint
  ) values (
    p_snapshot_id, p_observed_at, v_recorded_at, p_source_bundle_sha256,
    p_operating_memory_sha256, p_project_context_sha256, 'sales-coach', 'default',
    v_payload ->> 'schema_version', p_environment, p_is_synthetic, v_context,
    v_coach, v_brief, v_fingerprint
  );

  for v_target in select value from pg_catalog.jsonb_array_elements(v_targets)
  loop
    if pg_catalog.jsonb_typeof(v_target) <> 'object'
      or not (v_target ?& array['id','target_key','title','target_kind','authority_status','execution_status','owner_role','owner_acceptance_status','baseline_status','next_gate','source_ref'])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_target) supplied(key)
        where supplied.key <> all(array[
          'id','target_key','title','target_kind','authority_status',
          'execution_status','owner_role','owner_acceptance_status',
          'baseline_status','baseline_label','target_label','next_gate','source_ref'
        ])
      )
    then
      raise exception using errcode = '22023', message = 'claw_context_invalid_target';
    end if;
    insert into private.claw_active_target_revisions (
      id, snapshot_id, target_key, title, target_kind, authority_status,
      execution_status, owner_role, owner_acceptance_status, baseline_status,
      baseline_label, target_label, next_gate, source_ref, observed_at
    ) values (
      (v_target ->> 'id')::uuid, p_snapshot_id, v_target ->> 'target_key',
      v_target ->> 'title', v_target ->> 'target_kind',
      v_target ->> 'authority_status', v_target ->> 'execution_status',
      v_target ->> 'owner_role', v_target ->> 'owner_acceptance_status',
      v_target ->> 'baseline_status', v_target ->> 'baseline_label',
      v_target ->> 'target_label', v_target ->> 'next_gate',
      v_target ->> 'source_ref', p_observed_at
    );
  end loop;

  for v_request in select value from pg_catalog.jsonb_array_elements(v_requests)
  loop
    if pg_catalog.jsonb_typeof(v_request) <> 'object'
      or not (v_request ?& array['id','created_event_id','request_type','question','risk_class','source_ref'])
      or exists (
        select 1 from pg_catalog.jsonb_object_keys(v_request) supplied(key)
        where supplied.key <> all(array[
          'id','created_event_id','target_key','request_type','question',
          'recommended_default','risk_class','source_ref'
        ])
      )
    then
      raise exception using errcode = '22023', message = 'claw_context_invalid_ceo_request';
    end if;
    insert into private.claw_ceo_review_requests (
      id, snapshot_id, target_key, request_type, question, recommended_default,
      risk_class, requested_by_profile, coached_by_profile, source_ref, created_at
    ) values (
      (v_request ->> 'id')::uuid, p_snapshot_id, v_request ->> 'target_key',
      v_request ->> 'request_type', v_request ->> 'question',
      v_request ->> 'recommended_default', v_request ->> 'risk_class',
      'default', 'sales-coach', v_request ->> 'source_ref', v_recorded_at
    );
    insert into private.claw_ceo_review_events (
      id, review_request_id, event_type, actor_type, created_at
    ) values (
      (v_request ->> 'created_event_id')::uuid, (v_request ->> 'id')::uuid,
      'created', 'system', v_recorded_at
    );
  end loop;

  v_target_count := pg_catalog.jsonb_array_length(v_targets);
  v_request_count := pg_catalog.jsonb_array_length(v_requests);
  return query select p_snapshot_id, true, v_target_count, v_request_count, v_recorded_at;
exception
  when invalid_text_representation or not_null_violation or check_violation or unique_violation then
    raise exception using errcode = '22023', message = 'claw_context_invalid_payload';
end
$function$;

create function public.claw_append_ceo_review_event_v1(
  p_event_id uuid,
  p_review_request_id uuid,
  p_event_type text,
  p_decision_value text,
  p_evidence_ref text
)
returns table (
  event_id uuid,
  ledger_sequence bigint,
  recorded_at timestamptz,
  event_type text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
set DateStyle = 'ISO, YMD'
as $function$
declare
  v_existing private.claw_ceo_review_events%rowtype;
  v_latest private.claw_ceo_review_events%rowtype;
  v_inserted private.claw_ceo_review_events%rowtype;
  v_event_type text := pg_catalog.btrim(p_event_type);
  v_decision_value text := nullif(pg_catalog.btrim(p_decision_value), '');
  v_evidence_ref text := nullif(pg_catalog.btrim(p_evidence_ref), '');
begin
  if p_event_id is null or p_review_request_id is null
    or v_event_type not in ('confirmed','changed','rejected','deferred','cancelled')
    or (v_event_type = 'changed' and (v_decision_value is null or char_length(v_decision_value) > 500))
    or (v_event_type <> 'changed' and v_decision_value is not null)
    or (v_evidence_ref is not null and char_length(v_evidence_ref) > 240)
  then
    raise exception using errcode = '22023', message = 'claw_ceo_review_invalid_input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_review_request_id::text, 0));
  select event.* into v_existing from private.claw_ceo_review_events event where event.id = p_event_id;
  if found then
    if v_existing.review_request_id = p_review_request_id
      and v_existing.event_type = v_event_type
      and v_existing.decision_value is not distinct from v_decision_value
      and v_existing.evidence_ref is not distinct from v_evidence_ref
    then
      return query select v_existing.id, v_existing.ledger_sequence, v_existing.created_at, v_existing.event_type;
      return;
    end if;
    raise exception using errcode = 'P0001', message = 'claw_ceo_review_idempotency_mismatch';
  end if;

  select event.* into v_latest
  from private.claw_ceo_review_events event
  where event.review_request_id = p_review_request_id
  order by event.ledger_sequence desc limit 1;
  if not found then
    raise exception using errcode = 'P0002', message = 'claw_ceo_review_request_unavailable';
  end if;
  if v_latest.event_type not in ('created','deferred') then
    raise exception using errcode = '55000', message = 'claw_ceo_review_terminal';
  end if;

  insert into private.claw_ceo_review_events (
    id, review_request_id, event_type, actor_type, decision_value, evidence_ref
  ) values (
    p_event_id, p_review_request_id, v_event_type, 'ceo', v_decision_value, v_evidence_ref
  ) returning * into v_inserted;

  return query select v_inserted.id, v_inserted.ledger_sequence, v_inserted.created_at, v_inserted.event_type;
end
$function$;

create function public.claw_get_ceo_review_queue_v1(p_limit integer default 50)
returns table (
  request_id uuid,
  snapshot_id uuid,
  target_key text,
  request_type text,
  question text,
  recommended_default text,
  risk_class text,
  current_status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
as $function$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'claw_ceo_review_invalid_limit';
  end if;
  return query
  select request.id, request.snapshot_id, request.target_key, request.request_type,
    request.question, request.recommended_default, request.risk_class,
    latest.event_type, request.created_at
  from private.claw_ceo_review_requests request
  cross join lateral (
    select event.event_type
    from private.claw_ceo_review_events event
    where event.review_request_id = request.id
    order by event.ledger_sequence desc
    limit 1
  ) latest
  where latest.event_type in ('created', 'deferred')
  order by request.ledger_sequence
  limit p_limit;
end
$function$;

create function public.claw_get_active_targets_v1()
returns table (
  target_key text,
  title text,
  target_kind text,
  authority_status text,
  execution_status text,
  owner_role text,
  owner_acceptance_status text,
  baseline_status text,
  baseline_label text,
  target_label text,
  next_gate text,
  source_ref text,
  observed_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
as $function$
  select distinct on (target.target_key)
    target.target_key, target.title, target.target_kind, target.authority_status,
    target.execution_status, target.owner_role, target.owner_acceptance_status,
    target.baseline_status, target.baseline_label, target.target_label,
    target.next_gate, target.source_ref, target.observed_at
  from private.claw_active_target_revisions target
  order by target.target_key, target.ledger_sequence desc
$function$;

create function public.claw_get_latest_context_source_v1()
returns table (
  source_bundle_sha256 text,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog
set TimeZone = 'UTC'
as $function$
  select snapshot.source_bundle_sha256, snapshot.recorded_at
  from private.claw_operating_context_snapshots snapshot
  order by snapshot.ledger_sequence desc
  limit 1
$function$;

revoke all on function public.claw_ingest_operating_context_v1(uuid,timestamptz,text,text,text,jsonb,text,boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.claw_append_ceo_review_event_v1(uuid,uuid,text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.claw_get_ceo_review_queue_v1(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.claw_get_active_targets_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.claw_get_latest_context_source_v1()
  from public, anon, authenticated, service_role;
grant execute on function public.claw_ingest_operating_context_v1(uuid,timestamptz,text,text,text,jsonb,text,boolean)
  to service_role;
grant execute on function public.claw_append_ceo_review_event_v1(uuid,uuid,text,text,text)
  to service_role;
grant execute on function public.claw_get_ceo_review_queue_v1(integer)
  to service_role;
grant execute on function public.claw_get_active_targets_v1()
  to service_role;
grant execute on function public.claw_get_latest_context_source_v1()
  to service_role;

revoke all on table private.claw_operating_context_snapshots,
  private.claw_active_target_revisions, private.claw_ceo_review_requests,
  private.claw_ceo_review_events
  from public, anon, authenticated, service_role;
revoke all on sequence private.claw_operating_context_snapshots_ledger_sequence_seq,
  private.claw_active_target_revisions_ledger_sequence_seq,
  private.claw_ceo_review_requests_ledger_sequence_seq,
  private.claw_ceo_review_events_ledger_sequence_seq
  from public, anon, authenticated, service_role;

commit;
