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

`/api/request-assistant` is a stateless public intake assistant. It turns a short conversation into a reviewable payload for the existing `/api/requests` endpoint, but it never submits automatically and cannot retrieve portal data.

The response keeps two kinds of state separate:

- `draft` is canonical user-provided state and determines `readyToSubmit`.
- `suggestedDraft` is optional AI output. It never overwrites `draft`; a client must show and explicitly apply it before it can become canonical.

The deterministic guided-intake path works without third-party processing. OpenRouter is attempted only when all of these are true:

1. The request explicitly includes `useAi: true`.
2. `OPENROUTER_API_KEY` is configured.
3. Upstash Redis is configured for distributed per-client limiting and the daily AI-call circuit breaker.
4. The client identifies the current answer as a task field (`service`, `request`, `budget`, or `timeline`), never an identity/contact field.

Provider requests contain only the explicit task answer plus existing task fields. Known canonical names, emails, URLs, and phone numbers are redacted before the request leaves the application, and OpenRouter is required to use zero-data-retention routing. The user must still avoid placing unrelated personal data in task text. If any prerequisite or provider call fails, the deterministic path remains available.

Copy `.env.example` to `.env.local` for local setup. Production remains disabled until `REQUEST_ASSISTANT_PUBLIC_ENABLED=true` is set explicitly. `GET /api/request-assistant` reports configuration readiness without exposing secrets.

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
- Client request form
- `/api/requests` API route
- Local JSON fallback at `.data/claw-requests.json` during development only
- Resend notification hook when env vars are configured

## Design direction

Use `DESIGN.md` as the source brief for the main company homepage. It positions Claw Services as a broad human-operated, AI-assisted digital services company; the request desk/portal is the operating layer, not the only service being sold.

## Supabase setup

1. Create/select a Supabase project.
2. Run `supabase/claw_requests.sql` in the Supabase SQL editor.
3. Add these env vars:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

## Resend setup

1. Verify the sending domain in Resend.
2. Add:

```bash
RESEND_API_KEY=re_YOUR_RESEND_API_KEY
CLAW_REQUEST_TO_EMAIL=ops@yourdomain.com
CLAW_REQUEST_FROM_EMAIL="Claw Services <requests@yourdomain.com>"
```

In development, the route can save to `.data/claw-requests.json` when Supabase is absent. Production fails closed unless Supabase is configured and the insert succeeds. Resend remains optional; a saved request is still returned when notification delivery is not configured.
