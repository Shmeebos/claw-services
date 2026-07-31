# Claw Services

Next.js + React landing page and request system for Claw Services.

This repo currently contains the public Claw Services landing page, the first request-desk flow, and the company-level `DESIGN.md` brief for Google Stitch and future design iteration.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Request assistant backend

`/api/request-assistant` is a stateless public intake assistant. It turns a short conversation into a reviewable payload for `POST /api/v1/requests`, but it never submits automatically and cannot retrieve portal data. The legacy `/api/requests` path delegates to the same handler and returns deprecation metadata.

The response keeps two kinds of state separate:

- `draft` is canonical user-provided state and determines `readyToSubmit`.
- `suggestedDraft` is optional AI output. It never overwrites `draft`; a client must show and explicitly apply it before it can become canonical.

The deterministic guided-intake path works without third-party processing. The direct OpenAI Responses API preview is attempted only when all of these are true:

1. The request explicitly includes `useAi: true`.
2. `NODE_ENV` is not `production` and `REQUEST_ASSISTANT_ALLOW_OPENAI_PREVIEW=true`.
3. `OPENAI_API_KEY` is configured; the adapter is fixed to `gpt-5.6-luna`.
4. Either Upstash supplies the distributed quota/circuit breaker or the non-production-only `REQUEST_ASSISTANT_ALLOW_LOCAL_AI=true` override is explicit.
5. The client identifies the current answer as a task field (`service`, `request`, `budget`, or `timeline`), never an identity/contact field.

For a private local/preview test only, `REQUEST_ASSISTANT_ALLOW_LOCAL_AI=true` permits provider calls behind the existing bounded instance limiter without Upstash. The code ignores the OpenAI preview gate and local quota override when `NODE_ENV=production`; this adapter cannot enable production AI.

Provider requests contain only the explicit task answer plus existing task fields. Known canonical names, emails, URLs, and phone numbers are redacted before the request leaves the application. Every Responses request sets `store: false`, but that alone does not prove Zero Data Retention; unless organization-level ZDR is separately verified, redacted task text may remain in OpenAI abuse-monitoring logs for up to 30 days. `OPENAI_ZERO_DATA_RETENTION_VERIFIED` changes truthful status display only—it never enables a call. If any prerequisite or provider call fails, the deterministic path remains available.

Copy `.env.example` to `.env.local` for local setup. The assistant and final submission have independent production gates: `REQUEST_ASSISTANT_PUBLIC_ENABLED=true` and `REQUEST_SUBMISSION_ENABLED=true`. Keep submission disabled until the Supabase target, migrations, retention wording, and launch review are approved. Health routes report readiness without exposing secrets.

Both public POST routes require `application/json`, reject unapproved browser origins, stream-cap request bodies, and apply a bounded local limit before parsing. The assistant additionally scans likely credentials and payment cards.

Verify the backend with:

```bash
pnpm test
pnpm lint
pnpm build
```

## What works now

- Premium Claw Services landing page
- Interactive work builder
- Guided `/request` workspace with explicit, non-production OpenAI Luna preview opt-in
- Client request form
- Versioned `/api/v1/requests` API with UUID idempotency and an `/api/requests` compatibility wrapper
- Atomic `claw_accept_request_v1` Supabase acceptance contract with canonical receipt and notification-outbox state
- Local JSON fallback at `.data/claw-requests.json` during development only
- Local replay protection for development submissions

## Design direction

Use `DESIGN.md` as the source brief for the main company homepage. It positions Claw Services as a broad human-operated, AI-assisted digital services company; the request desk/portal is the operating layer, not the only service being sold.

## Supabase setup

Remote Supabase setup is intentionally blocked until the dedicated Claw Services project, price, retention wording, migration sequence, and deployment authorization are approved. Do not run the local governance migrations against an unrelated or production project.

After that gate is cleared:

1. Create/select the dedicated approved Supabase project.
2. Apply the approved ordered migrations rather than treating `supabase/claw_requests.sql` as the complete governed backend.
3. Add these server-side env vars without exposing their values:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

The server calls `claw_accept_request_v1`; it does not insert the request and notification jobs separately. Reusing one `Idempotency-Key` with the unchanged reviewed request returns the original receipt. Reusing it with changed content fails with `409 idempotency_conflict`.

## Resend and notification worker setup

1. Verify the sending domain in Resend.
2. Add:

```bash
RESEND_API_KEY=re_YOUR_RESEND_API_KEY
CLAW_REQUEST_TO_EMAIL=ops@yourdomain.com
CLAW_REQUEST_FROM_EMAIL="Claw Services <requests@yourdomain.com>"
```

These variables are reserved for the separately gated notification worker. The public acceptance route does not call Resend directly: durable Supabase acceptance creates customer and team outbox jobs with `pending` state, while delivery and retries happen outside the acceptance transaction.

In non-production development, local JSON storage requires the explicit `CLAW_ALLOW_LOCAL_REQUEST_STORAGE=true` flag. Local JSON submissions neither queue notifications nor call Resend. Production ignores that flag and fails closed unless Supabase is configured and the atomic acceptance RPC succeeds.
