# Request assistant backend

This module prepares a request draft. It does not submit requests, read portal data, or store chat transcripts.

## Trust model

- `draft` is canonical state supplied by the user. Only this state can make `readyToSubmit` true.
- `suggestedDraft` is untrusted model output. It is filtered to task fields and never merged automatically.
- The frontend must show an AI suggestion and require an explicit apply action before sending it back as canonical `draft` state.
- Final persistence happens only through `POST /api/v1/requests`, which validates the canonical request again, requires a UUID idempotency key, and crosses one atomic Supabase RPC boundary. `/api/requests` is a deprecated compatibility wrapper around the same handler.

## Request flow

1. `request-policy.ts` rejects non-JSON and unapproved browser origins, then stream-caps the body.
2. `rate-limit.ts` applies a bounded per-instance limit before body parsing.
3. `types.ts` validates the conversation and canonical draft.
4. `guardrails.ts` blocks likely credentials, configuration secrets, and payment cards.
5. `logic.ts` applies deterministic user answers and evaluates the canonical request schema.
6. When `useAi: true`, `durable-rate-limit.ts` must approve both the distributed client quota and daily provider-call budget unless the explicit non-production local override is active.
7. For an explicit task-field answer, `provider.ts` can call the direct OpenAI Responses API preview with `gpt-5.6-luna`, sending only that answer and existing task fields after redacting known canonical names plus common contact forms. The preview is impossible in production, uses `store: false`, and truthfully discloses that this alone does not prove ZDR; clients should still keep unrelated personal data out of task text.
8. Model output is returned separately as `suggestedDraft`; the route never persists or auto-submits it.

## Files

- `types.ts` — API and provider schemas.
- `logic.ts` — deterministic draft handling and readiness evaluation.
- `guardrails.ts` — sensitive-content detection and provider redaction.
- `request-policy.ts` — browser-origin, media-type, and body-size checks.
- `rate-limit.ts` — bounded local abuse protection.
- `durable-rate-limit.ts` — Upstash-backed AI quota and daily circuit breaker.
- `provider.ts` — non-production OpenAI Luna preview adapter; no user-facing prose is trusted from the model.
- `route.ts` — orchestration at `src/app/api/request-assistant/route.ts`.

## Persistence and SQL

The assistant endpoint is currently stateless. The ordered Supabase migrations define final requests plus content-free governance envelopes, not raw conversations, prompts, model outputs, or AI suggestions. Do not add transcript storage unless there is a separately approved retention, consent, access-control, and deletion design.

## Verification

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm lint
pnpm build
pnpm audit --prod
```
