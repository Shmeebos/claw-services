# Claw operating-context backend

Status: implemented and verified locally on 2026-07-30. Remote deployment and
external-system use remain unauthorized.

## Outcome

The backend can now turn the approved Claw operating-memory surfaces into a
private Supabase projection:

1. The local worker reads the canonical Obsidian `Operating Memory` and
   `Claw Services Operating Context`.
2. Deterministic parsing establishes the source hashes, six measurement targets,
   eight operating gates, authority state, ownership acceptance, baseline state,
   and the current no-action constraints.
3. Hermes `sales-coach` analyzes only that bounded packet.
4. Hermes `default` converts the packet and coach analysis into bounded CEO
   confirmations or evidence requests.
5. A service-role-only RPC atomically appends the snapshot, target revisions,
   CEO requests, and `created` events.

Supabase never reads local files or invokes Hermes. The local worker is the
explicit trust boundary:

```text
Approved Obsidian notes
        |
        v
deterministic parser + hashes
        |
        +--> sales-coach (context_engine toolset: zero tools)
        |
        +--> default CEO formatter (context_engine toolset: zero tools)
        |
        v
closed JSON validation
        |
        v
local-only service RPC --> private append-only Supabase ledgers
```

## Source provenance

- `Obsidian: System/Operating Memory`
  - supplies working principles only;
  - owner-specific raw note text is not stored in Supabase.
- `Obsidian: Projects/Claw Services Operating Context`
  - adopted measurement sprint: six targets;
  - active gates after founder review: eight targets;
  - exact source-section references accompany every target.
- Hermes profiles:
  - `sales-coach` is recorded as the coaching profile;
  - `default` is recorded as the CEO request profile.

Each snapshot stores SHA-256 hashes for both notes and the combined source
bundle. It does not store raw notes, prompts, transcripts, contact details,
secrets, or hidden model reasoning.

## Authority and safety invariants

- Existing decisions remain `adopted`.
- Unapproved gates or ownership transfers remain `proposed`.
- Missing commercial baselines and numeric targets remain `unknown`; no model
  may set them.
- Public contact information is not consent.
- Outreach, lead activation, stale-lead import, external CRM writes, and
  production release are all false in the deterministic context and are
  rejected if a caller claims otherwise.
- A CEO review request is not a decision or execution authorization.
- CEO outcomes are appended as `confirmed`, `changed`, `rejected`, `deferred`,
  or `cancelled`; terminal decisions cannot be overwritten.
- Direct table and sequence access is denied to API roles, including
  `service_role`. Only the narrow security-definer RPCs are executable.
- The worker refuses every non-loopback Supabase URL.
- Supabase/database/delivery credentials are removed from the Hermes subprocess
  environment.
- An unchanged source hash returns a local no-op before either Hermes profile is
  invoked, preventing duplicate review queues and unnecessary model usage.

## Interfaces

Migration:

- `supabase/migrations/202607300005_claw_operating_context_and_ceo_review.sql`

Write and workflow RPCs:

- `claw_ingest_operating_context_v1` — atomic snapshot ingestion and exact
  idempotent replay.
- `claw_append_ceo_review_event_v1` — CEO disposition with transition and
  idempotency checks.

Bounded read RPCs:

- `claw_get_active_targets_v1` — latest append-only revision per target.
- `claw_get_ceo_review_queue_v1` — only open/deferred CEO questions, maximum
  100 rows.
- `claw_get_latest_context_source_v1` — content-hash preflight used to skip
  unchanged sources.

## Local operation

Prerequisites:

- local Supabase is running;
- the two Obsidian source paths are readable;
- `hermes` and `sales-coach` profiles are configured;
- local `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set only in the
  worker process.

Read-only profile validation:

```sh
pnpm context:dry-run
```

Append to loopback Supabase:

```sh
pnpm context:write-local
```

Optional path overrides:

- `CLAW_OPERATING_MEMORY_PATH`
- `CLAW_PROJECT_CONTEXT_PATH`
- `HERMES_DEFAULT_CLI`
- `HERMES_SALES_COACH_CLI`

There is intentionally no remote override. A remote sync requires a separate
founder decision, threat review, target-project selection, and deployment work.

## Verification record

- Hermes toolset resolution was inspected offline:
  `context_engine` resolves to zero tools.
- Real two-profile dry run:
  14 targets, 13 bounded CEO requests, external actions false.
- Real two-profile local write:
  14 targets, 10 open CEO requests, external actions false.
- Local RPC readback:
  14 active targets and 10 open CEO requests; the first-outreach gate is
  `adopted` as a gate, `blocked` for execution, and has an `unknown` baseline.
- Immediate repeat:
  `local-noop` on the unchanged source hash before either profile was invoked.
- TypeScript unit/invariant tests, TypeScript compilation, and lint pass.
- The dedicated SQL migration test passes when executed directly with `psql`
  against the local Supabase database.

The repository-wide legacy SQL suite is not a clean signal for this feature:
pre-existing B1A/B1B/B2A tests conflict over temporary grants, and the older
acceptance RPC references the historical `public.gen_random_uuid()` location.
Those failures predate and are outside this migration; this feature's isolated
SQL test passes.

## Current CEO queue policy

Show only target-bound questions or missing-evidence requests. Keep the source
reference, recommended safe default, and risk class visible. Do not let a UI
button trigger outreach, activate/import a lead, send a collaborator message,
deploy production, or update another CRM. Any later execution workflow needs a
separate explicit authorization and evidence boundary.
