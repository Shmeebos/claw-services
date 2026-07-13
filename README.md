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

`/api/request-assistant` is a stateless public intake assistant. It turns a short conversation into a reviewable payload for the existing `/api/requests` endpoint, but it never submits automatically and cannot retrieve portal data. OpenRouter is used only when the request explicitly includes `useAi: true`; otherwise the conversation stays on the deterministic fallback.

Copy `.env.example` to `.env.local` to enable the OpenRouter path. Without an API key, local development uses the deterministic guided-intake fallback. Production remains disabled until `REQUEST_ASSISTANT_PUBLIC_ENABLED=true` is set explicitly.

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
- Local JSON fallback at `.data/claw-requests.json` when Supabase is not configured
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

The route still works without Supabase/Resend by saving requests locally.
