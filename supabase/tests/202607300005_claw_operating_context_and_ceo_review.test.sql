\set ON_ERROR_STOP on

begin;

do $create_context_probe$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'claw_context_probe') then
    execute 'create role claw_context_probe nologin noinherit';
  end if;
end
$create_context_probe$;

do $catalog_guards$
declare
  v_table text;
begin
  foreach v_table in array array[
    'claw_operating_context_snapshots',
    'claw_active_target_revisions',
    'claw_ceo_review_requests',
    'claw_ceo_review_events'
  ]
  loop
    if not exists (
      select 1
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'private'
        and relation.relname = v_table
        and relation.relrowsecurity
    ) then
      raise exception 'missing private RLS table %', v_table;
    end if;
    if pg_catalog.has_table_privilege('service_role', 'private.' || v_table, 'SELECT')
      or pg_catalog.has_table_privilege('service_role', 'private.' || v_table, 'INSERT')
      or pg_catalog.has_table_privilege('service_role', 'private.' || v_table, 'UPDATE')
      or pg_catalog.has_table_privilege('service_role', 'private.' || v_table, 'DELETE')
    then
      raise exception 'direct service_role table access remained on %', v_table;
    end if;
  end loop;

  if pg_catalog.has_function_privilege(
    'claw_context_probe',
    'public.claw_ingest_operating_context_v1(uuid,timestamptz,text,text,text,jsonb,text,boolean)',
    'EXECUTE'
  ) then
    raise exception 'PUBLIC retained context-ingest execution';
  end if;
end
$catalog_guards$;

set local role service_role;

select *
from public.claw_ingest_operating_context_v1(
  '10000000-0000-5000-8000-000000000001',
  '2026-07-30T12:00:00Z',
  repeat('a', 64),
  repeat('b', 64),
  repeat('c', 64),
  '{
    "schema_version":"operating-context.v1",
    "context_summary":{
      "company":"Claw Services",
      "operating_principles":["Verify first"],
      "active_constraints":["No outreach"],
      "lead_activation_authorized":false,
      "outreach_authorized":false,
      "external_crm_writes_authorized":false,
      "commercial_baselines":"unknown",
      "source_refs":["Obsidian: System/Operating Memory"]
    },
    "sales_coach_analysis":{
      "diagnosis":"Resolve gates first",
      "metric_to_improve_first":"Same-day verified target accounts",
      "target_assessments":[],
      "owner_actions":[],
      "review_rule":"Use counts and denominators",
      "source_refs":["Obsidian: Projects/Claw Services Operating Context"]
    },
    "default_ceo_brief":{
      "summary":"One evidence question",
      "confirmation_requests":[],
      "information_requests":[],
      "source_refs":["Obsidian: Projects/Claw Services Operating Context"]
    },
    "targets":[{
      "id":"20000000-0000-5000-8000-000000000001",
      "target_key":"gate:private-entity-payment-verification",
      "title":"Private entity/payment verification",
      "target_kind":"operating_gate",
      "authority_status":"adopted",
      "execution_status":"blocked",
      "owner_role":"Ibrahim",
      "owner_acceptance_status":"founder_owned",
      "baseline_status":"unknown",
      "baseline_label":null,
      "target_label":null,
      "next_gate":"Privately verify required evidence",
      "source_ref":"Obsidian: Projects/Claw Services Operating Context"
    }],
    "ceo_requests":[{
      "id":"30000000-0000-5000-8000-000000000001",
      "created_event_id":"40000000-0000-5000-8000-000000000001",
      "target_key":"gate:private-entity-payment-verification",
      "request_type":"request_missing_evidence",
      "question":"Is private verification complete?",
      "recommended_default":"Keep blocked until evidence exists.",
      "risk_class":"high",
      "source_ref":"Obsidian: Projects/Claw Services Operating Context"
    }]
  }'::jsonb,
  'test',
  true
);

do $functional_guards$
declare
  v_created boolean;
  v_targets integer;
  v_requests integer;
  v_queue_count integer;
  v_target_count integer;
  v_latest_hash text;
begin
  select result.was_created, result.target_count, result.ceo_request_count
  into v_created, v_targets, v_requests
  from public.claw_ingest_operating_context_v1(
    '10000000-0000-5000-8000-000000000001',
    '2026-07-30T12:00:00Z',
    repeat('a', 64), repeat('b', 64), repeat('c', 64),
    '{
      "schema_version":"operating-context.v1",
      "context_summary":{"company":"Claw Services","operating_principles":["Verify first"],"active_constraints":["No outreach"],"lead_activation_authorized":false,"outreach_authorized":false,"external_crm_writes_authorized":false,"commercial_baselines":"unknown","source_refs":["Obsidian: System/Operating Memory"]},
      "sales_coach_analysis":{"diagnosis":"Resolve gates first","metric_to_improve_first":"Same-day verified target accounts","target_assessments":[],"owner_actions":[],"review_rule":"Use counts and denominators","source_refs":["Obsidian: Projects/Claw Services Operating Context"]},
      "default_ceo_brief":{"summary":"One evidence question","confirmation_requests":[],"information_requests":[],"source_refs":["Obsidian: Projects/Claw Services Operating Context"]},
      "targets":[{"id":"20000000-0000-5000-8000-000000000001","target_key":"gate:private-entity-payment-verification","title":"Private entity/payment verification","target_kind":"operating_gate","authority_status":"adopted","execution_status":"blocked","owner_role":"Ibrahim","owner_acceptance_status":"founder_owned","baseline_status":"unknown","baseline_label":null,"target_label":null,"next_gate":"Privately verify required evidence","source_ref":"Obsidian: Projects/Claw Services Operating Context"}],
      "ceo_requests":[{"id":"30000000-0000-5000-8000-000000000001","created_event_id":"40000000-0000-5000-8000-000000000001","target_key":"gate:private-entity-payment-verification","request_type":"request_missing_evidence","question":"Is private verification complete?","recommended_default":"Keep blocked until evidence exists.","risk_class":"high","source_ref":"Obsidian: Projects/Claw Services Operating Context"}]
    }'::jsonb,
    'test',
    true
  ) result;
  if v_created or v_targets <> 1 or v_requests <> 1 then
    raise exception 'exact replay did not return its durable receipt';
  end if;

  select count(*) into v_queue_count from public.claw_get_ceo_review_queue_v1(50);
  select count(*) into v_target_count from public.claw_get_active_targets_v1();
  select source.source_bundle_sha256
  into v_latest_hash
  from public.claw_get_latest_context_source_v1() source;
  if v_queue_count <> 1 or v_target_count <> 1 or v_latest_hash <> repeat('a', 64) then
    raise exception 'bounded read RPCs returned unexpected counts';
  end if;
end
$functional_guards$;

select *
from public.claw_append_ceo_review_event_v1(
  '50000000-0000-5000-8000-000000000001',
  '30000000-0000-5000-8000-000000000001',
  'deferred',
  null,
  'CEO review pending'
);

select *
from public.claw_append_ceo_review_event_v1(
  '60000000-0000-5000-8000-000000000001',
  '30000000-0000-5000-8000-000000000001',
  'confirmed',
  null,
  'CEO confirmation recorded'
);

do $queue_closed$
begin
  if exists (select 1 from public.claw_get_ceo_review_queue_v1(50)) then
    raise exception 'terminal review remained in the open queue';
  end if;
end
$queue_closed$;

reset role;
rollback;
