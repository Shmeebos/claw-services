-- Claw request governance foundation (Task B1A).
--
-- These relations retain governance facts and bounded product telemetry only: no raw transcript, answer, prompt, model output, headers, IP address, user agent, or arbitrary content.
-- Consent history is append-only. A later grant, decline, or withdrawal is always a separate consent event; consent purposes are never bundled in one record.
-- The 24-month retention policy is a technical proposal pending Ibrahim and legal approval; this migration is not approval to apply it remotely or publicly.
-- Product analytics properties use closed keys and closed primitive values. Deletion tombstones contain identifiers and policy codes only, never source PII or deleted content.

begin;

-- Add the request-level governance fields before any acceptance RPC or public deployment.
-- Nullable staging plus deterministic backfill keeps this safe for a fresh project that may
-- already contain local fixture rows, while the final shape is fully NOT NULL where required.
alter table public.claw_requests
  add column if not exists correlation_id uuid,
  add column if not exists environment text not null default 'unknown',
  add column if not exists data_class text not null default 'service_delivery_only',
  add column if not exists is_synthetic boolean not null default false,
  add column if not exists is_canary boolean not null default false,
  add column if not exists is_employee_test boolean not null default false,
  add column if not exists retention_expires_at timestamptz,
  add column if not exists deletion_requested_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.claw_requests
set correlation_id = id
where correlation_id is null;

update public.claw_requests
set retention_expires_at = accepted_at + interval '24 months'
where retention_expires_at is null;

alter table public.claw_requests
  alter column correlation_id set default gen_random_uuid(),
  alter column correlation_id set not null,
  alter column environment set default 'unknown',
  alter column environment set not null,
  alter column data_class set default 'service_delivery_only',
  alter column data_class set not null,
  alter column is_synthetic set default false,
  alter column is_synthetic set not null,
  alter column is_canary set default false,
  alter column is_canary set not null,
  alter column is_employee_test set default false,
  alter column is_employee_test set not null,
  alter column retention_expires_at set default (now() + interval '24 months'),
  alter column retention_expires_at set not null;

-- PostgreSQL has no ALTER TABLE ... ADD CONSTRAINT IF NOT EXISTS. Guard every named
-- request constraint against pg_constraint so rerunning a completed migration is harmless.
alter table public.claw_requests
  drop constraint if exists claw_requests_environment_check;

do $governance_constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.claw_requests'::pg_catalog.regclass
      and conname = 'claw_requests_environment_check'
  ) then
    alter table public.claw_requests
      add constraint claw_requests_environment_check
      check (environment in ('unknown', 'production', 'preview', 'development', 'test'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.claw_requests'::pg_catalog.regclass
      and conname = 'claw_requests_data_class_check'
  ) then
    alter table public.claw_requests
      add constraint claw_requests_data_class_check
      check (data_class in ('service_delivery_only'));
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.claw_requests'::pg_catalog.regclass
      and conname = 'claw_requests_retention_check'
  ) then
    alter table public.claw_requests
      add constraint claw_requests_retention_check
      check (retention_expires_at > accepted_at);
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.claw_requests'::pg_catalog.regclass
      and conname = 'claw_requests_deletion_timestamps_check'
  ) then
    alter table public.claw_requests
      add constraint claw_requests_deletion_timestamps_check
      check (
        (
          deletion_requested_at is null
          or deletion_requested_at >= accepted_at
        )
        and (
          deleted_at is null
          or (
            deletion_requested_at is not null
            and deleted_at >= deletion_requested_at
          )
        )
      );
  end if;
end
$governance_constraints$;

comment on column public.claw_requests.correlation_id is
  'Non-unique end-to-end operational correlation UUID. It must never encode customer identity or request content.';
comment on column public.claw_requests.environment is
  'Closed deployment environment taxonomy. Omission fails closed to unknown; only explicit production is production-eligible.';
comment on column public.claw_requests.data_class is
  'Closed data-purpose boundary. B1A permits service_delivery_only records and no secondary-use classification.';
comment on column public.claw_requests.is_synthetic is
  'True only for synthetic test traffic; false does not imply consent for analytics or model training.';
comment on column public.claw_requests.is_canary is
  'True only for controlled canary traffic; never infer customer identity from this flag.';
comment on column public.claw_requests.is_employee_test is
  'True only for approved employee test traffic; never use this as a general identity marker.';
comment on column public.claw_requests.retention_expires_at is
  'Technical 24-month service-delivery retention proposal. Remote/public enforcement remains blocked pending Ibrahim and legal approval.';
comment on column public.claw_requests.deletion_requested_at is
  'Timestamp of a validated deletion request; no requester identity, message, or free-form reason is stored here.';
comment on column public.claw_requests.deleted_at is
  'Timestamp when source content was deleted. Non-PII proof belongs only in the private tombstone table.';

create index if not exists claw_requests_correlation_id_idx
  on public.claw_requests (correlation_id);

create table if not exists public.claw_request_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz,
  source text not null default 'web',
  environment text not null default 'unknown',
  schema_version text not null,
  app_version text not null,
  is_synthetic boolean not null default false,
  is_canary boolean not null default false,
  is_employee_test boolean not null default false,

  constraint claw_request_sessions_source_check
    check (source in ('web', 'apple_app')),
  constraint claw_request_sessions_environment_check
    check (environment in ('unknown', 'production', 'preview', 'development', 'test')),
  constraint claw_request_sessions_schema_version_check
    check (char_length(btrim(schema_version)) between 1 and 32),
  constraint claw_request_sessions_app_version_check
    check (char_length(btrim(app_version)) between 1 and 64),
  constraint claw_request_sessions_timestamps_check
    check (
      updated_at >= created_at
      and (
        ended_at is null
        or ended_at >= created_at
      )
    )
);

alter table public.claw_request_sessions
  alter column environment set default 'unknown',
  drop constraint if exists claw_request_sessions_environment_check,
  drop constraint if exists claw_request_sessions_version_tokens_check;

alter table public.claw_request_sessions
  add constraint claw_request_sessions_environment_check
    check (environment in ('unknown', 'production', 'preview', 'development', 'test')),
  add constraint claw_request_sessions_version_tokens_check
    check (
      schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,31}$'
      and app_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'
    );

comment on table public.claw_request_sessions is
  'Content-free assistant session envelope. Never store transcripts, answers, prompts, identities, arbitrary text, or JSON here.';
comment on column public.claw_request_sessions.source is
  'Known product surface only. apple_app is reserved; web is the active B1A consent source.';
comment on column public.claw_request_sessions.environment is
  'Closed environment boundary shared with operational requests.';

create index if not exists claw_request_sessions_environment_created_at_idx
  on public.claw_request_sessions (environment, created_at desc);
create index if not exists claw_request_sessions_active_updated_at_idx
  on public.claw_request_sessions (updated_at desc)
  where ended_at is null;

-- The existing non-Security-Definer helper from Task A owns timestamp maintenance.
drop trigger if exists claw_request_sessions_set_updated_at
  on public.claw_request_sessions;
create trigger claw_request_sessions_set_updated_at
before update on public.claw_request_sessions
for each row execute function public.claw_set_updated_at();

create table if not exists public.claw_request_consents (
  id uuid primary key,
  ledger_sequence bigint generated always as identity,
  request_id uuid,
  session_id uuid not null references public.claw_request_sessions (id) on delete restrict,
  consent_type text not null,
  granted boolean not null,
  notice_version text not null,
  provider_policy_version text,
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  source text not null default 'web',
  event_type text not null,

  constraint claw_request_consents_ledger_sequence_key
    unique (ledger_sequence),
  constraint claw_request_consents_consent_type_check
    check (consent_type in ('ai_processing', 'product_analytics', 'model_training')),
  constraint claw_request_consents_event_type_check
    check (event_type in ('grant', 'decline', 'withdraw')),
  constraint claw_request_consents_source_check
    check (source in ('web'))
);

alter table public.claw_request_consents
  add column if not exists ledger_sequence bigint generated always as identity,
  drop constraint if exists claw_request_consents_request_id_fkey,
  drop constraint if exists claw_request_consents_notice_version_check,
  drop constraint if exists claw_request_consents_provider_policy_version_check,
  drop constraint if exists claw_request_consents_event_consistency_check,
  drop constraint if exists claw_request_consents_event_shape_check,
  drop constraint if exists claw_request_consents_version_tokens_check,
  drop constraint if exists claw_request_consents_ai_policy_version_check;

do $consent_ledger_sequence$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.claw_request_consents'::pg_catalog.regclass
      and conname = 'claw_request_consents_ledger_sequence_key'
  ) then
    alter table public.claw_request_consents
      add constraint claw_request_consents_ledger_sequence_key
      unique (ledger_sequence);
  end if;
end
$consent_ledger_sequence$;

alter table public.claw_request_consents
  add constraint claw_request_consents_notice_version_check
    check (char_length(btrim(notice_version)) between 1 and 64),
  add constraint claw_request_consents_provider_policy_version_check
    check (
      provider_policy_version is null
      or char_length(btrim(provider_policy_version)) between 1 and 64
    ),
  add constraint claw_request_consents_version_tokens_check
    check (
      notice_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'
      and (
        provider_policy_version is null
        or provider_policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'
      )
    ),
  add constraint claw_request_consents_ai_policy_version_check
    check (
      consent_type <> 'ai_processing'
      or event_type <> 'grant'
      or provider_policy_version is not null
    ),
  add constraint claw_request_consents_event_shape_check
    check (
      (
        event_type = 'grant'
        and granted = true
        and withdrawn_at is null
      )
      or (
        event_type = 'decline'
        and granted = false
        and withdrawn_at is null
      )
      or (
        event_type = 'withdraw'
        and granted = false
        and withdrawn_at is not null
        and withdrawn_at >= created_at
      )
    );

comment on table public.claw_request_consents is
  'Immutable append-only consent ledger. Every purpose and every later grant, decline, or withdrawal is a separate consent event with a caller-supplied UUID.';
comment on column public.claw_request_consents.ledger_sequence is
  'Database-assigned authoritative consent ordering. Caller timestamps and UUID ordering never determine current consent.';
comment on column public.claw_request_consents.request_id is
  'Immutable internal request reference without a deleting foreign key. The versioned acceptance/deletion RPC validates lifecycle transitions.';
comment on column public.claw_request_consents.provider_policy_version is
  'Bounded provider policy identifier only; never a provider response, prompt, output, or policy document.';
comment on column public.claw_request_consents.withdrawn_at is
  'Present only on a withdraw event. Prior rows are retained as immutable historical facts.';

drop index if exists public.claw_request_consents_session_created_at_idx;
create index if not exists claw_request_consents_session_type_sequence_idx
  on public.claw_request_consents (session_id, consent_type, ledger_sequence desc);
create index if not exists claw_request_consents_request_created_at_idx
  on public.claw_request_consents (request_id, created_at desc)
  where request_id is not null;

create table if not exists public.claw_request_product_events (
  event_id uuid primary key,
  session_id uuid not null references public.claw_request_sessions (id) on delete restrict,
  request_id uuid,
  occurred_at timestamptz not null default now(),
  sequence integer not null,
  event_name text not null,
  field_name text,
  duration_ms integer,
  app_version text not null,
  event_schema_version text not null,
  properties jsonb not null default '{}'::jsonb,

  constraint claw_request_product_events_sequence_check
    check (sequence between 1 and 1000000),
  constraint claw_request_product_events_session_sequence_key
    unique (session_id, sequence),
  constraint claw_request_product_events_event_name_check
    check (
      event_name in (
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
      )
    ),
  constraint claw_request_product_events_field_name_check
    check (
      field_name is null
      or field_name in (
        'name',
        'email',
        'business_url',
        'service',
        'request',
        'budget',
        'timeline'
      )
    ),
  constraint claw_request_product_events_field_applicability_check
    check (
      case
        when event_name in ('field_prompted', 'field_answered', 'field_edited') then
          field_name is not null
        when event_name in (
          'ai_suggestion_shown',
          'ai_suggestion_applied',
          'ai_suggestion_dismissed'
        ) then
          true
        else
          field_name is null
      end
    ),
  constraint claw_request_product_events_duration_ms_check
    check (
      duration_ms is null
      or duration_ms between 0 and 3600000
    ),
  constraint claw_request_product_events_app_version_check
    check (char_length(btrim(app_version)) between 1 and 64),
  constraint claw_request_product_events_schema_version_check
    check (char_length(btrim(event_schema_version)) between 1 and 32),
  constraint claw_request_product_events_version_tokens_check
    check (
      app_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'
      and event_schema_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,31}$'
    ),
  constraint claw_request_product_events_properties_shape_check
    check (
      jsonb_typeof(properties) = 'object'
      and octet_length(properties::text) <= 512
      and properties - array[
        'status',
        'count',
        'enabled',
        'reason_code'
      ] = '{}'::jsonb
      and (
        not (properties ? 'status')
        or (
          jsonb_typeof(properties -> 'status') = 'string'
          and (properties ->> 'status') in (
            'started',
            'succeeded',
            'failed',
            'accepted',
            'dismissed'
          )
        )
      )
      and case
        when not (properties ? 'count') then true
        when jsonb_typeof(properties -> 'count') <> 'number' then false
        when (properties ->> 'count') !~ '^[0-9]{1,6}$' then false
        else (properties ->> 'count')::integer between 0 and 100000
      end
      and (
        not (properties ? 'enabled')
        or jsonb_typeof(properties -> 'enabled') = 'boolean'
      )
      and (
        not (properties ? 'reason_code')
        or (
          jsonb_typeof(properties -> 'reason_code') = 'string'
          and (properties ->> 'reason_code') in (
            'user_action',
            'validation_error',
            'provider_unavailable',
            'rate_limited',
            'network_error',
            'unknown'
          )
        )
      )
    ),
  constraint claw_request_product_events_properties_by_event_check
    check (
      (
        event_name in (
          'assistant_opened',
          'field_prompted',
          'field_answered',
          'ai_suggestion_shown',
          'ai_suggestion_applied',
          'review_started',
          'submission_started'
        )
        and properties = '{}'::jsonb
      )
      or (
        event_name in ('ai_opt_in_changed', 'training_opt_in_changed')
        and properties ? 'enabled'
        and properties - array['enabled'] = '{}'::jsonb
      )
      or (
        event_name = 'field_edited'
        and (
          properties = '{}'::jsonb
          or (
            properties ? 'count'
            and properties - array['count'] = '{}'::jsonb
          )
        )
      )
      or (
        event_name = 'ai_requested'
        and properties ? 'status'
        and properties - array['status', 'reason_code'] = '{}'::jsonb
        and (properties ->> 'status') in ('started', 'succeeded', 'failed')
        and (
          (
            (properties ->> 'status') <> 'failed'
            and not (properties ? 'reason_code')
          )
          or (
            (properties ->> 'status') = 'failed'
            and properties ? 'reason_code'
          )
        )
      )
      or (
        event_name = 'ai_suggestion_dismissed'
        and (
          properties = '{}'::jsonb
          or (
            properties ? 'reason_code'
            and properties - array['reason_code'] = '{}'::jsonb
          )
        )
      )
      or (
        event_name = 'submission_accepted'
        and properties = '{"status":"accepted"}'::jsonb
      )
      or (
        event_name = 'submission_failed'
        and properties ?& array['status', 'reason_code']
        and properties - array['status', 'reason_code'] = '{}'::jsonb
        and properties ->> 'status' = 'failed'
      )
    )
);

alter table public.claw_request_product_events
  drop constraint if exists claw_request_product_events_request_id_fkey;

comment on table public.claw_request_product_events is
  'Content-free append-only product telemetry. Event names, field identifiers, versions, timings, counts, booleans, statuses, and reason codes are closed and bounded.';
comment on column public.claw_request_product_events.event_id is
  'Caller-supplied durable UUID idempotency key; replaying the same event cannot create another row.';
comment on column public.claw_request_product_events.request_id is
  'Immutable internal request reference without a deleting foreign key. Lifecycle RPCs validate the referenced request.';
comment on column public.claw_request_product_events.properties is
  'Canonical small closed object. It rejects text answers, prompts, outputs, messages, arbitrary keys, and arbitrary string values.';

create index if not exists claw_request_product_events_session_occurred_at_idx
  on public.claw_request_product_events (session_id, occurred_at, sequence);
create index if not exists claw_request_product_events_request_occurred_at_idx
  on public.claw_request_product_events (request_id, occurred_at desc)
  where request_id is not null;

create schema if not exists private;

comment on schema private is
  'Non-API governance records. API-facing roles have no schema access and no RLS policies can expose these tables.';

revoke all on schema private from public, anon, authenticated;
revoke all on schema private from service_role;
grant usage on schema private to service_role;

create table if not exists private.claw_deletion_tombstones (
  id uuid primary key default gen_random_uuid(),
  source_table text not null,
  source_record_id uuid not null,
  request_pseudonym text,
  pseudonym_version text not null default 'hmac-sha256-v1',
  deleted_at timestamptz not null default now(),
  reason_code text not null,
  policy_version text not null,

  constraint claw_deletion_tombstones_source_table_check
    check (
      source_table in (
        'claw_requests',
        'claw_request_sessions',
        'claw_request_consents',
        'claw_request_product_events'
      )
    ),
  constraint claw_deletion_tombstones_request_pseudonym_check
    check (
      request_pseudonym is null
      or (
        char_length(request_pseudonym) between 43 and 43
        and request_pseudonym ~ '^[A-Za-z0-9_-]{43}$'
      )
    ),
  constraint claw_deletion_tombstones_pseudonym_version_check
    check (pseudonym_version = 'hmac-sha256-v1'),
  constraint claw_deletion_tombstones_reason_code_check
    check (
      reason_code in (
        'customer_request',
        'retention_expired',
        'operator_correction',
        'test_data_cleanup',
        'legal_requirement'
      )
    ),
  constraint claw_deletion_tombstones_policy_version_check
    check (
      char_length(btrim(policy_version)) between 1 and 64
      and policy_version ~ '^[A-Za-z0-9][A-Za-z0-9._:+-]{0,63}$'
    )
);

comment on table private.claw_deletion_tombstones is
  'Append-only non-PII proof of deletion. Stores a closed source/reason taxonomy and optional one-way request pseudonym, never raw customer data or deleted content.';
comment on column private.claw_deletion_tombstones.request_pseudonym is
  'Optional 43-character unpadded base64url HMAC-SHA256 pseudonym. The deletion RPC owns keyed generation; never accept raw identifiers.';
comment on column private.claw_deletion_tombstones.pseudonym_version is
  'Closed keyed-pseudonym algorithm/version identifier; never a free-form description.';

create unique index if not exists claw_deletion_tombstones_source_record_idx
  on private.claw_deletion_tombstones (source_table, source_record_id);

alter table public.claw_request_sessions enable row level security;
alter table public.claw_request_consents enable row level security;
alter table public.claw_request_product_events enable row level security;
alter table private.claw_deletion_tombstones enable row level security;

-- No CREATE POLICY statements belong in B1A. RLS stays closed to API-facing roles.
-- TEMPORARY LOCAL-ONLY sequencing bridge: the direct SELECT/INSERT grants below
-- are a remote blocker, not the final trusted-backend authorization boundary.
-- Before any remote migration, narrow fixed-search_path SECURITY DEFINER RPCs
-- must replace direct table access and revoke every direct INSERT grant.
-- Remote work also remains blocked on approved target-project selection, exact
-- dashboard plan/cost approval, and Ibrahim/legal approval of retention wording.
revoke all on table public.claw_request_sessions
  from public, anon, authenticated;
revoke all on table public.claw_request_consents
  from public, anon, authenticated;
revoke all on table public.claw_request_product_events
  from public, anon, authenticated;
revoke all on table private.claw_deletion_tombstones
  from public, anon, authenticated;

revoke all on table public.claw_request_sessions from service_role;
revoke all on table public.claw_request_consents from service_role;
revoke all on table public.claw_request_product_events from service_role;
revoke all on table private.claw_deletion_tombstones from service_role;

-- Consent events, product events, and deletion tombstones are immutable append-only ledgers.
grant select, insert on table public.claw_request_consents to service_role;
grant select, insert on table public.claw_request_product_events to service_role;
grant select, insert on table private.claw_deletion_tombstones to service_role;
grant select, insert on table public.claw_request_sessions to service_role;
grant update (ended_at) on table public.claw_request_sessions to service_role;

revoke all on sequence public.claw_request_consents_ledger_sequence_seq
  from public, anon, authenticated, service_role;
grant usage, select on sequence public.claw_request_consents_ledger_sequence_seq
  to service_role;

commit;
