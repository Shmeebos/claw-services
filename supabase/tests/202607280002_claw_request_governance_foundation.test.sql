\set ON_ERROR_STOP on

-- Local disposable-PostgreSQL verification for Task B1A. All fixture rows roll back.
begin;

-- Catalog shape, RLS/policy state, and direct ACL assertions.
do $catalog_assertions$
declare
  relation_name text;
  role_name text;
  privilege_name text;
  actual_privileges text[];
  expected_privileges text[];
  relation_oid oid;
  role_oid oid;
  api_role_oids oid[];
begin
  if to_regnamespace('private') is null then
    raise exception 'private schema is missing';
  end if;

  foreach relation_name in array array[
    'public.claw_request_sessions',
    'public.claw_request_consents',
    'public.claw_request_product_events',
    'private.claw_deletion_tombstones'
  ] loop
    relation_oid := to_regclass(relation_name);
    if relation_oid is null then
      raise exception 'required relation % is missing', relation_name;
    end if;

    if not exists (
      select 1
      from pg_catalog.pg_class
      where oid = relation_oid
        and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on %', relation_name;
    end if;

    if exists (
      select 1
      from pg_catalog.pg_policy
      where polrelid = relation_oid
    ) then
      raise exception 'unexpected RLS policy exists on %', relation_name;
    end if;
  end loop;

  if (
    select count(*)
    from pg_catalog.pg_attribute
    where attrelid = 'public.claw_requests'::pg_catalog.regclass
      and attnum > 0
      and not attisdropped
      and attname = any (array[
        'correlation_id',
        'environment',
        'data_class',
        'is_synthetic',
        'is_canary',
        'is_employee_test',
        'retention_expires_at',
        'deletion_requested_at',
        'deleted_at'
      ])
  ) <> 9 then
    raise exception 'one or more claw_requests governance columns are missing';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.claw_requests'::pg_catalog.regclass
      and attname = any (array[
        'correlation_id',
        'environment',
        'data_class',
        'is_synthetic',
        'is_canary',
        'is_employee_test',
        'retention_expires_at'
      ])
      and not attnotnull
  ) then
    raise exception 'a required request governance column is nullable';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint
    where conrelid = 'public.claw_requests'::pg_catalog.regclass
      and conname = any (array[
        'claw_requests_environment_check',
        'claw_requests_data_class_check',
        'claw_requests_retention_check',
        'claw_requests_deletion_timestamps_check'
      ])
  ) <> 4 then
    raise exception 'one or more named request governance constraints are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'claw_requests'
      and indexname = 'claw_requests_correlation_id_idx'
      and indexdef like '%(correlation_id)%'
  ) then
    raise exception 'correlation_id index is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = 'public.claw_request_consents'::pg_catalog.regclass
      and attname = 'ledger_sequence'
      and attidentity = 'a'
  ) then
    raise exception 'consent ledger sequence is not database-controlled identity';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and tablename = 'claw_request_consents'
      and indexname = 'claw_request_consents_session_type_sequence_idx'
      and indexdef like '%(session_id, consent_type, ledger_sequence DESC)%'
  ) then
    raise exception 'consent current-state ordering index is missing or malformed';
  end if;

  if exists (
    with expected_indexes (schemaname, tablename, indexname, indexdef) as (
      values
        (
          'public', 'claw_requests', 'claw_requests_correlation_id_idx',
          'CREATE INDEX claw_requests_correlation_id_idx ON public.claw_requests USING btree (correlation_id)'
        ),
        (
          'public', 'claw_request_sessions', 'claw_request_sessions_environment_created_at_idx',
          'CREATE INDEX claw_request_sessions_environment_created_at_idx ON public.claw_request_sessions USING btree (environment, created_at DESC)'
        ),
        (
          'public', 'claw_request_sessions', 'claw_request_sessions_active_updated_at_idx',
          'CREATE INDEX claw_request_sessions_active_updated_at_idx ON public.claw_request_sessions USING btree (updated_at DESC) WHERE (ended_at IS NULL)'
        ),
        (
          'public', 'claw_request_consents', 'claw_request_consents_session_type_sequence_idx',
          'CREATE INDEX claw_request_consents_session_type_sequence_idx ON public.claw_request_consents USING btree (session_id, consent_type, ledger_sequence DESC)'
        ),
        (
          'public', 'claw_request_consents', 'claw_request_consents_request_created_at_idx',
          'CREATE INDEX claw_request_consents_request_created_at_idx ON public.claw_request_consents USING btree (request_id, created_at DESC) WHERE (request_id IS NOT NULL)'
        ),
        (
          'public', 'claw_request_product_events', 'claw_request_product_events_session_occurred_at_idx',
          'CREATE INDEX claw_request_product_events_session_occurred_at_idx ON public.claw_request_product_events USING btree (session_id, occurred_at, sequence)'
        ),
        (
          'public', 'claw_request_product_events', 'claw_request_product_events_request_occurred_at_idx',
          'CREATE INDEX claw_request_product_events_request_occurred_at_idx ON public.claw_request_product_events USING btree (request_id, occurred_at DESC) WHERE (request_id IS NOT NULL)'
        ),
        (
          'private', 'claw_deletion_tombstones', 'claw_deletion_tombstones_source_record_idx',
          'CREATE UNIQUE INDEX claw_deletion_tombstones_source_record_idx ON private.claw_deletion_tombstones USING btree (source_table, source_record_id)'
        )
    )
    select 1
    from expected_indexes expected
    left join pg_catalog.pg_indexes actual
      on actual.schemaname = expected.schemaname
      and actual.tablename = expected.tablename
      and actual.indexname = expected.indexname
    where actual.indexdef is distinct from expected.indexdef
  ) then
    raise exception 'one or more governance indexes are missing or malformed';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint
    where contype = 'f'
      and conrelid in (
        'public.claw_request_consents'::pg_catalog.regclass,
        'public.claw_request_product_events'::pg_catalog.regclass
      )
      and pg_catalog.pg_get_constraintdef(oid) like 'FOREIGN KEY (request_id)%'
  ) then
    raise exception 'append-only request reference unexpectedly mutates through a foreign key';
  end if;

  -- Content-free tables must expose no content-bearing or arbitrary JSON columns.
  if exists (
    select 1
    from pg_catalog.pg_attribute attribute
    join pg_catalog.pg_class relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname || '.' || relation.relname = any (array[
      'public.claw_request_sessions',
      'public.claw_request_consents',
      'private.claw_deletion_tombstones'
    ])
      and attribute.attnum > 0
      and not attribute.attisdropped
      and (
        attribute.attname ~* '(transcript|answer|prompt|output|message|content|payload|headers|ip_address|user_agent|identity|metadata)'
        or attribute.atttypid in ('pg_catalog.json'::pg_catalog.regtype, 'pg_catalog.jsonb'::pg_catalog.regtype)
      )
  ) then
    raise exception 'a content-free governance table exposes a content-bearing column';
  end if;

  select array_agg(oid order by oid)
  into api_role_oids
  from pg_catalog.pg_roles
  where rolname in ('anon', 'authenticated');

  if pg_catalog.array_length(api_role_oids, 1) <> 2 then
    raise exception 'expected anon and authenticated test roles';
  end if;
  api_role_oids := api_role_oids || array[0::oid];

  foreach relation_name in array array[
    'public.claw_request_sessions',
    'public.claw_request_consents',
    'public.claw_request_product_events',
    'private.claw_deletion_tombstones'
  ] loop
    relation_oid := to_regclass(relation_name);

    if exists (
      select 1
      from pg_catalog.pg_class relation
      cross join lateral pg_catalog.aclexplode(
        coalesce(relation.relacl, '{}'::pg_catalog.aclitem[])
      ) acl
      where relation.oid = relation_oid
        and acl.grantee = any (api_role_oids)
    ) then
      raise exception 'API-facing role or PUBLIC retains a direct privilege on %', relation_name;
    end if;

    select oid into role_oid
    from pg_catalog.pg_roles
    where rolname = 'service_role';

    select array_agg(acl.privilege_type order by acl.privilege_type)
    into actual_privileges
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, '{}'::pg_catalog.aclitem[])
    ) acl
    where relation.oid = relation_oid
      and acl.grantee = role_oid;

    expected_privileges := array['INSERT', 'SELECT'];

    if actual_privileges is distinct from expected_privileges then
      raise exception 'unexpected service_role ACL on %: expected %, got %',
        relation_name, expected_privileges, actual_privileges;
    end if;
  end loop;

  if not pg_catalog.has_column_privilege(
    'service_role', 'public.claw_request_sessions', 'ended_at', 'UPDATE'
  ) then
    raise exception 'service_role cannot end a request session';
  end if;

  foreach privilege_name in array array[
    'id', 'source', 'environment', 'schema_version', 'app_version',
    'is_synthetic', 'is_canary', 'is_employee_test',
    'created_at', 'updated_at'
  ] loop
    if pg_catalog.has_column_privilege(
      'service_role', 'public.claw_request_sessions', privilege_name, 'UPDATE'
    ) then
      raise exception 'service_role can unexpectedly update session column %', privilege_name;
    end if;
  end loop;

  -- Effective grants must also contain no mutation path for append-only relations.
  foreach relation_name in array array[
    'public.claw_request_consents',
    'public.claw_request_product_events',
    'private.claw_deletion_tombstones'
  ] loop
    foreach privilege_name in array array['UPDATE', 'DELETE', 'TRUNCATE'] loop
      if pg_catalog.has_table_privilege('service_role', relation_name, privilege_name) then
        raise exception 'service_role unexpectedly has % on append-only %',
          privilege_name, relation_name;
      end if;
    end loop;
  end loop;

  foreach role_name in array array['anon', 'authenticated'] loop
    if pg_catalog.has_schema_privilege(role_name, 'private', 'USAGE')
      or pg_catalog.has_schema_privilege(role_name, 'private', 'CREATE') then
      raise exception '% unexpectedly has private schema access', role_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_namespace namespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(namespace.nspacl, '{}'::pg_catalog.aclitem[])
    ) acl
    where namespace.nspname = 'private'
      and acl.grantee = 0
  ) then
    raise exception 'PUBLIC unexpectedly has a direct private schema privilege';
  end if;

  if not pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE')
    or pg_catalog.has_schema_privilege('service_role', 'private', 'CREATE') then
    raise exception 'service_role private schema privileges are not USAGE-only';
  end if;

  foreach role_name in array array['anon', 'authenticated'] loop
    if pg_catalog.has_sequence_privilege(
      role_name,
      'public.claw_request_consents_ledger_sequence_seq',
      'USAGE'
    ) or pg_catalog.has_sequence_privilege(
      role_name,
      'public.claw_request_consents_ledger_sequence_seq',
      'SELECT'
    ) or pg_catalog.has_sequence_privilege(
      role_name,
      'public.claw_request_consents_ledger_sequence_seq',
      'UPDATE'
    ) then
      raise exception '% unexpectedly has a consent sequence privilege', role_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_catalog.pg_class relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, '{}'::pg_catalog.aclitem[])
    ) acl
    where relation.oid = 'public.claw_request_consents_ledger_sequence_seq'::pg_catalog.regclass
      and acl.grantee = 0
  ) then
    raise exception 'PUBLIC unexpectedly has a direct consent sequence privilege';
  end if;

  if not pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'USAGE'
  ) or not pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'SELECT'
  ) or pg_catalog.has_sequence_privilege(
    'service_role',
    'public.claw_request_consents_ledger_sequence_seq',
    'UPDATE'
  ) then
    raise exception 'service_role consent sequence ACL is not USAGE/SELECT-only';
  end if;
end
$catalog_assertions$;

-- Prove API-facing roles cannot read or write governance relations at runtime.
set local role anon;
do $anon_denial_behavior$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.claw_request_sessions',
    'public.claw_request_consents',
    'public.claw_request_product_events',
    'private.claw_deletion_tombstones'
  ] loop
    begin
      execute format('select 1 from %s limit 1', relation_name);
      raise exception 'anon unexpectedly read %', relation_name;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.claw_request_sessions (
      id, schema_version, app_version
    ) values (
      '00000000-0000-4000-8000-0000000000b1'::uuid, '1', 'anon-denial-test'
    );
    raise exception 'anon unexpectedly inserted a request session';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform nextval('public.claw_request_consents_ledger_sequence_seq'::regclass);
    raise exception 'anon unexpectedly used the consent sequence';
  exception
    when insufficient_privilege then null;
  end;
end
$anon_denial_behavior$;
reset role;

set local role authenticated;
do $authenticated_denial_behavior$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'public.claw_request_sessions',
    'public.claw_request_consents',
    'public.claw_request_product_events',
    'private.claw_deletion_tombstones'
  ] loop
    begin
      execute format('select 1 from %s limit 1', relation_name);
      raise exception 'authenticated unexpectedly read %', relation_name;
    exception
      when insufficient_privilege then null;
    end;
  end loop;

  begin
    insert into public.claw_request_sessions (
      id, schema_version, app_version
    ) values (
      '00000000-0000-4000-8000-0000000000b2'::uuid, '1', 'authenticated-denial-test'
    );
    raise exception 'authenticated unexpectedly inserted a request session';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform nextval('public.claw_request_consents_ledger_sequence_seq'::regclass);
    raise exception 'authenticated unexpectedly used the consent sequence';
  exception
    when insufficient_privilege then null;
  end;
end
$authenticated_denial_behavior$;
reset role;

-- Exercise the column-level session lifecycle ACL as the local service role.
alter role service_role bypassrls;
set local role service_role;

insert into public.claw_request_sessions (
  id, source, environment, schema_version, app_version
) values (
  '00000000-0000-4000-8000-0000000000a1'::uuid,
  'web',
  'test',
  '1',
  'b1a-acl-test'
);

update public.claw_request_sessions
set ended_at = now()
where id = '00000000-0000-4000-8000-0000000000a1'::uuid;

do $session_acl_behavior$
begin
  begin
    update public.claw_request_sessions
    set environment = 'production'
    where id = '00000000-0000-4000-8000-0000000000a1'::uuid;
    raise exception 'service_role reclassified immutable session environment';
  exception
    when insufficient_privilege then null;
  end;
end
$session_acl_behavior$;

reset role;

-- Behavioral constraints, exact approved taxonomies, idempotency, and privacy bounds.
do $behavior_assertions$
declare
  fixture_session_id uuid := gen_random_uuid();
  fixture_request_id uuid;
  fixture_event_id uuid := gen_random_uuid();
  request_accepted_at timestamptz;
  request_retention_expires_at timestamptz;
  request_correlation_id uuid;
  request_environment text;
  request_data_class text;
  request_is_synthetic boolean;
  request_is_canary boolean;
  request_is_employee_test boolean;
  approved_event_name text;
  invalid_event_case record;
  next_sequence integer := 0;
  first_consent_sequence bigint;
  second_consent_sequence bigint;
  expected_consent_rows bigint;
  expected_product_event_rows bigint;
  caught_constraint text;
begin
  insert into public.claw_request_sessions (
    id,
    source,
    environment,
    schema_version,
    app_version
  ) values (
    fixture_session_id,
    'web',
    'test',
    '1',
    'b1a-test'
  );

  insert into public.claw_request_sessions (
    source,
    schema_version,
    app_version
  ) values (
    'web',
    '1',
    'b1a-test'
  ) returning environment into request_environment;

  if request_environment <> 'unknown' then
    raise exception 'session omission did not fail closed to unknown environment';
  end if;

  begin
    insert into public.claw_request_sessions (
      source,
      environment,
      schema_version,
      app_version
    ) values (
      'web',
      'arbitrary',
      '1',
      'b1a-test'
    );
    raise exception 'arbitrary session environment was accepted';
  exception
    when check_violation then null;
  end;

  insert into public.claw_requests (
    idempotency_key,
    name,
    email,
    service,
    request,
    brief,
    privacy_notice_version,
    schema_version
  ) values (
    gen_random_uuid(),
    'Local governance fixture',
    'fixture@example.invalid',
    'governance-verification',
    'Verify bounded governance storage.',
    jsonb_build_object(
      'summary', 'Local fixture only',
      'objectives', '[]'::jsonb,
      'deliverables', '[]'::jsonb,
      'constraints', '[]'::jsonb,
      'success_criteria', '[]'::jsonb
    ),
    'test-notice-v1',
    '1'
  )
  returning
    id,
    accepted_at,
    retention_expires_at,
    correlation_id,
    environment,
    data_class,
    is_synthetic,
    is_canary,
    is_employee_test
  into
    fixture_request_id,
    request_accepted_at,
    request_retention_expires_at,
    request_correlation_id,
    request_environment,
    request_data_class,
    request_is_synthetic,
    request_is_canary,
    request_is_employee_test;

  if request_correlation_id is null
    or request_environment <> 'unknown'
    or request_data_class <> 'service_delivery_only'
    or request_is_synthetic
    or request_is_canary
    or request_is_employee_test
    or request_retention_expires_at <> request_accepted_at + interval '24 months' then
    raise exception 'request governance defaults are inconsistent';
  end if;

  begin
    update public.claw_requests
    set deleted_at = now()
    where id = fixture_request_id;
    raise exception 'deleted_at without deletion_requested_at was accepted';
  exception
    when check_violation then null;
  end;

  update public.claw_requests
  set deletion_requested_at = now(),
      deleted_at = now()
  where id = fixture_request_id;

  begin
    insert into public.claw_request_consents (
      id,
      request_id,
      session_id,
      consent_type,
      granted,
      notice_version,
      provider_policy_version,
      source,
      event_type
    ) values
      (
        gen_random_uuid(), fixture_request_id, fixture_session_id,
        'ai_processing', true, 'notice-v1', 'openai-policy-v1', 'web', 'grant'
      ),
      (
        gen_random_uuid(), fixture_request_id, fixture_session_id,
        'product_analytics', false, 'notice-v1', null, 'web', 'decline'
      ),
      (
        gen_random_uuid(), fixture_request_id, fixture_session_id,
        'model_training', false, 'notice-v1', null, 'web', 'withdraw'
      );
    raise exception 'incomplete withdrawal event was accepted';
  exception
    when check_violation then
      get stacked diagnostics caught_constraint = constraint_name;
      if caught_constraint <> 'claw_request_consents_event_shape_check' then
        raise exception 'unexpected consent constraint failed: %', caught_constraint;
      end if;
  end;

  if exists (
    select 1
    from public.claw_request_consents
    where session_id = fixture_session_id
  ) then
    raise exception 'failed multi-row consent insert left partial ledger rows';
  end if;

  begin
    insert into public.claw_request_consents (
      id, request_id, session_id, consent_type, granted,
      notice_version, source, event_type
    ) values (
      gen_random_uuid(), fixture_request_id, fixture_session_id,
      'ai_processing', true, 'notice-v1', 'web', 'grant'
    );
    raise exception 'AI grant without provider policy version was accepted';
  exception
    when check_violation then
      get stacked diagnostics caught_constraint = constraint_name;
      if caught_constraint <> 'claw_request_consents_ai_policy_version_check' then
        raise exception 'unexpected AI policy constraint failed: %', caught_constraint;
      end if;
  end;

  insert into public.claw_request_consents (
    id, request_id, session_id, consent_type, granted,
    notice_version, provider_policy_version, source, event_type
  ) values (
    gen_random_uuid(), fixture_request_id, fixture_session_id,
    'ai_processing', true, 'notice-v1', 'openai-policy-v1', 'web', 'grant'
  );

  insert into public.claw_request_consents (
    id, request_id, session_id, consent_type, granted,
    notice_version, source, event_type
  ) values (
    gen_random_uuid(), fixture_request_id, fixture_session_id,
    'product_analytics', false, 'notice-v1', 'web', 'decline'
  );

  insert into public.claw_request_consents (
    id, request_id, session_id, consent_type, granted,
    notice_version, source, event_type
  ) values (
    gen_random_uuid(), fixture_request_id, fixture_session_id,
    'model_training', true, 'notice-v1', 'web', 'grant'
  ) returning ledger_sequence into first_consent_sequence;

  insert into public.claw_request_consents (
    id, request_id, session_id, consent_type, granted,
    notice_version, withdrawn_at, source, event_type
  ) values (
    gen_random_uuid(), fixture_request_id, fixture_session_id,
    'model_training', false, 'notice-v1', now(), 'web', 'withdraw'
  ) returning ledger_sequence into second_consent_sequence;

  if second_consent_sequence <= first_consent_sequence then
    raise exception 'consent ledger sequence does not provide authoritative order';
  end if;

    begin
      insert into public.claw_request_consents (
        id, session_id, consent_type, granted, notice_version, source, event_type
      ) values (
        gen_random_uuid(), fixture_session_id, 'bundled', true, 'notice-v1', 'web', 'grant'
      );
      raise exception 'arbitrary consent taxonomy was accepted';
    exception
      when check_violation then null;
    end;

    foreach approved_event_name in array array[
      'assistant_opened',
      'ai_opt_in_changed',
      'field_prompted',
      'field_answered',
      'field_edited',
      'ai_requested',
      'ai_suggestion_shown',
      'ai_suggestion_applied',
      'ai_suggestion_dismissed',
      'review_started',
      'training_opt_in_changed',
      'submission_started',
      'submission_accepted',
      'submission_failed'
    ] loop
      next_sequence := next_sequence + 1;
      insert into public.claw_request_product_events (
        event_id,
        session_id,
        request_id,
        sequence,
        event_name,
        field_name,
        app_version,
        event_schema_version,
        properties
      ) values (
        case when next_sequence = 1 then fixture_event_id else gen_random_uuid() end,
        fixture_session_id,
        fixture_request_id,
        next_sequence,
        approved_event_name,
        case
          when approved_event_name in ('field_prompted', 'field_answered', 'field_edited')
            then 'service'
          else null
        end,
        'b1a-test',
        '1',
        case
          when approved_event_name in ('ai_opt_in_changed', 'training_opt_in_changed') then
            '{"enabled":true}'::jsonb
          when approved_event_name = 'field_edited' then
            '{"count":1}'::jsonb
          when approved_event_name = 'ai_requested' then
            '{"status":"started"}'::jsonb
          when approved_event_name = 'ai_suggestion_dismissed' then
            '{"reason_code":"user_action"}'::jsonb
          when approved_event_name = 'submission_accepted' then
            '{"status":"accepted"}'::jsonb
          when approved_event_name = 'submission_failed' then
            '{"status":"failed","reason_code":"validation_error"}'::jsonb
          else '{}'::jsonb
        end
      );
    end loop;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version, event_schema_version
      ) values (
        gen_random_uuid(), fixture_session_id, 100, 'arbitrary_event', 'b1a-test', '1'
      );
      raise exception 'arbitrary product event taxonomy was accepted';
    exception
      when check_violation then null;
    end;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version,
        event_schema_version, properties
      ) values (
        gen_random_uuid(), fixture_session_id, 101, 'assistant_opened', 'b1a-test',
        '1', '{"answer":"raw content"}'::jsonb
      );
      raise exception 'arbitrary product-event properties were accepted';
    exception
      when check_violation then null;
    end;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version,
        event_schema_version, properties
      ) values (
        gen_random_uuid(), fixture_session_id, 102, 'assistant_opened', 'b1a-test',
        '1', '{"status":"arbitrary free text"}'::jsonb
      );
      raise exception 'arbitrary product-event property value was accepted';
    exception
      when check_violation then null;
    end;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version,
        event_schema_version, properties
      ) values (
        gen_random_uuid(), fixture_session_id, 103, 'assistant_opened', 'b1a-test',
        '1', '{"enabled":true}'::jsonb
      );
      raise exception 'event-inapplicable product property was accepted';
    exception
      when check_violation then
        get stacked diagnostics caught_constraint = constraint_name;
        if caught_constraint <> 'claw_request_product_events_properties_by_event_check' then
          raise exception 'unexpected event-property constraint failed: %', caught_constraint;
        end if;
    end;

    for invalid_event_case in
      select *
      from (values
        ('ai_opt_in_changed', '{}'::jsonb),
        ('training_opt_in_changed', '{"enabled":true,"count":1}'::jsonb),
        ('ai_requested', '{"status":"failed"}'::jsonb),
        ('ai_requested', '{"status":"succeeded","reason_code":"network_error"}'::jsonb),
        ('ai_suggestion_dismissed', '{"status":"dismissed"}'::jsonb),
        ('submission_accepted', '{"status":"failed"}'::jsonb),
        ('submission_failed', '{"status":"failed"}'::jsonb)
      ) as cases(event_name, properties)
    loop
      next_sequence := next_sequence + 1;
      begin
        insert into public.claw_request_product_events (
          event_id, session_id, sequence, event_name, app_version,
          event_schema_version, properties
        ) values (
          gen_random_uuid(), fixture_session_id, 1000 + next_sequence,
          invalid_event_case.event_name, 'b1a-test', '1', invalid_event_case.properties
        );
        raise exception 'invalid property matrix was accepted for %: %',
          invalid_event_case.event_name, invalid_event_case.properties;
      exception
        when check_violation then
          get stacked diagnostics caught_constraint = constraint_name;
          if caught_constraint <> 'claw_request_product_events_properties_by_event_check' then
            raise exception 'unexpected matrix constraint failed for %: %',
              invalid_event_case.event_name, caught_constraint;
          end if;
      end;
    end loop;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version,
        event_schema_version
      ) values (
        gen_random_uuid(), fixture_session_id, 104, 'assistant_opened',
        'arbitrary version with spaces', '1'
      );
      raise exception 'non-token product-event version was accepted';
    exception
      when check_violation then null;
    end;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version, event_schema_version
      ) values (
        fixture_event_id, fixture_session_id, 105, 'assistant_opened', 'b1a-test', '1'
      );
      raise exception 'duplicate product event idempotency UUID was accepted';
    exception
      when unique_violation then null;
    end;

    begin
      insert into public.claw_request_product_events (
        event_id, session_id, sequence, event_name, app_version, event_schema_version
      ) values (
        gen_random_uuid(), fixture_session_id, 1, 'assistant_opened', 'b1a-test', '1'
      );
      raise exception 'duplicate product event session sequence was accepted';
    exception
      when unique_violation then
        get stacked diagnostics caught_constraint = constraint_name;
        if caught_constraint <> 'claw_request_product_events_session_sequence_key' then
          raise exception 'unexpected duplicate session-sequence constraint failed: %',
            caught_constraint;
        end if;
    end;

    insert into private.claw_deletion_tombstones (
      source_table,
      source_record_id,
      request_pseudonym,
      reason_code,
      policy_version
    ) values (
      'claw_requests',
      fixture_request_id,
      repeat('A', 43),
      'test_data_cleanup',
      'test-policy-v1'
    );

    begin
      insert into private.claw_deletion_tombstones (
        source_table, source_record_id, reason_code, policy_version
      ) values (
        'claw_requests', gen_random_uuid(), 'free_form_reason', 'test-policy-v1'
      );
      raise exception 'arbitrary tombstone reason was accepted';
    exception
      when check_violation then null;
    end;

    begin
      insert into private.claw_deletion_tombstones (
        source_table, source_record_id, request_pseudonym, reason_code, policy_version
      ) values (
        'claw_requests', gen_random_uuid(), repeat('A', 44),
        'test_data_cleanup', 'test-policy-v1'
      );
      raise exception 'non-canonical deletion pseudonym was accepted';
    exception
      when check_violation then null;
    end;

    select count(*)
    into expected_consent_rows
    from public.claw_request_consents
    where session_id = fixture_session_id
      and request_id = fixture_request_id;

    select count(*)
    into expected_product_event_rows
    from public.claw_request_product_events
    where session_id = fixture_session_id
      and request_id = fixture_request_id;

    if expected_consent_rows <> 4 or expected_product_event_rows <> 14 then
      raise exception 'deletion-survival fixture is incomplete: consents %, product events %',
        expected_consent_rows, expected_product_event_rows;
    end if;

    delete from public.claw_requests where id = fixture_request_id;

    if (
      select count(*)
      from public.claw_request_consents
      where session_id = fixture_session_id
        and request_id = fixture_request_id
    ) <> expected_consent_rows then
      raise exception 'request deletion removed or relinked consent ledger rows';
    end if;

    if (
      select count(*)
      from public.claw_request_product_events
      where session_id = fixture_session_id
        and request_id = fixture_request_id
    ) <> expected_product_event_rows then
      raise exception 'request deletion removed or relinked product-event rows';
    end if;

    if exists (
      select 1
      from public.claw_request_consents
      where session_id = fixture_session_id
        and request_id is distinct from fixture_request_id
    ) or exists (
      select 1
      from public.claw_request_product_events
      where session_id = fixture_session_id
        and request_id is distinct from fixture_request_id
    ) then
      raise exception 'request deletion mutated an append-only ledger reference';
    end if;
end
$behavior_assertions$;

select 'Task B1A governance SQL assertions passed' as result;

rollback;
