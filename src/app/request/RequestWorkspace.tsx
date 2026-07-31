"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUp, Check, LockKeyhole, Pencil, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ClawBrandLogo } from "@/components/ClawBrandLogo";
import { serviceOptions } from "@/lib/landing-content";
import { applySuggestionToDraft } from "@/lib/request-assistant/logic";
import { LatestRequestCoordinator } from "@/lib/request-assistant/request-sequence";
import type {
  AssistantField,
  ProviderTaskDraft,
  RequestDraft,
  TaskField,
} from "@/lib/request-assistant/types";
import styles from "./page.module.css";

type ChatMessage = { role: "user" | "assistant"; content: string };
type PendingSuggestion = { draft: ProviderTaskDraft; field: TaskField };

type AssistantResponse = {
  ok: boolean;
  reply?: string;
  message?: string;
  error?: string;
  draft?: RequestDraft;
  suggestedDraft?: ProviderTaskDraft | null;
  suggestedField?: TaskField | null;
  nextField?: AssistantField | null;
  readyToSubmit?: boolean;
  aiProviderAttempted?: boolean;
  provider?: {
    mode?: "openai" | "guided-fallback";
    name?: "OpenAI";
    model?: string;
    previewOnly?: boolean;
    fallbackReason?: string | null;
    zeroDataRetentionVerified?: boolean;
  };
};

type AssistantHealth = {
  provider?: {
    name?: "OpenAI";
    configured?: boolean;
    model?: string;
    previewOnly?: boolean;
    configurationReadyForLocalAi?: boolean;
    zeroDataRetentionVerified?: boolean;
  };
};

type SubmissionStorageMode = "local-json" | "supabase";

type SubmissionResponse = {
  ok: boolean;
  requestId?: string;
  acceptedAt?: string;
  message?: string;
  error?: string;
  storage?: { mode?: string };
  notifications?: { customer?: string; team?: string };
};

type SuccessfulSubmission = {
  ok: true;
  requestId: string;
  acceptedAt: string;
  storage: { mode: SubmissionStorageMode };
  notifications: { customer: string; team: string };
};

const labels: Record<AssistantField, string> = {
  service: "Service",
  request: "Desired outcome",
  name: "Contact name",
  email: "Email",
  businessUrl: "Business URL",
  budget: "Budget",
  timeline: "Timeline",
};

const prompts: Record<AssistantField, string> = {
  service: "Which kind of work should Claw scope for you?",
  request: "What outcome do you want, and what is getting in the way today?",
  name: "What name should we attach to this request?",
  email: "What email should receive the confirmation?",
  businessUrl: "Share the website or profile link to include.",
  budget: "What budget range should the operator work within?",
  timeline: "When would you like this completed?",
};

const samples: Record<AssistantField, string> = {
  service: serviceOptions[0],
  request: "We need a premium website for a home-services company that explains the offer clearly and turns more visitors into qualified leads.",
  name: "Northstar Home Services",
  email: "hello@northstar-demo.com",
  businessUrl: "https://northstar.example",
  budget: "$3,000–$5,000",
  timeline: "Ready to launch within four weeks",
};

const required: AssistantField[] = ["service", "request", "name", "email"];
const briefFields: AssistantField[] = ["service", "request", "businessUrl", "budget", "timeline", "name", "email"];
const intro: ChatMessage = {
  role: "assistant",
  content: "Tell me what you need. I’ll turn the rough ask into a clear operator brief and wait for your approval before anything is submitted.",
};

function failureMessage(data: AssistantResponse | null, status: number) {
  if (data?.message) return data.message;
  if (data?.error === "rate_limited") return "The intake is moving too quickly. Wait a moment, then continue.";
  if (data?.error === "sensitive_content") return "Remove credentials or payment details before continuing.";
  return `The intake could not continue (${status}). Your draft is still here.`;
}

export function RequestWorkspace() {
  const [messages, setMessages] = useState<ChatMessage[]>([intro]);
  const [draft, setDraft] = useState<RequestDraft>({});
  const [answering, setAnswering] = useState<AssistantField | null>("service");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submission, setSubmission] = useState<SuccessfulSubmission | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [useAi, setUseAi] = useState(false);
  const [health, setHealth] = useState<AssistantHealth | null>(null);
  const [suggestion, setSuggestion] = useState<PendingSuggestion | null>(null);
  const [providerResult, setProviderResult] = useState<NonNullable<AssistantResponse["provider"]> | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const submissionAttemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const requestCoordinatorRef = useRef<LatestRequestCoordinator | null>(null);
  if (requestCoordinatorRef.current === null) {
    requestCoordinatorRef.current = new LatestRequestCoordinator();
  }

  const completed = required.filter((field) => Boolean(draft[field])).length;
  const progress = Math.round((completed / required.length) * 100);
  const currentField = answering ?? "request";
  const summary = useMemo(
    () => draft.request ?? (draft.service ? `Scoping ${draft.service.toLowerCase()}.` : "Your brief will take shape here as you answer."),
    [draft.request, draft.service],
  );
  const aiReady = Boolean(
    health?.provider?.configured && health.provider.configurationReadyForLocalAi,
  );
  const modelName = health?.provider?.model === "gpt-5.6-luna"
    ? "GPT-5.6 Luna"
    : "OpenAI Luna";
  const providerCaption = providerResult?.mode === "openai"
    ? `${modelName} preview suggestion ready for review.`
    : providerResult?.fallbackReason === "provider-rate-limited"
      ? "OpenAI Luna preview is rate-limited; guided fallback used."
      : providerResult?.fallbackReason === "identity-field-local-only"
        ? "Identity answers stay local."
        : useAi
          ? "OpenAI Luna preview opt-in is active for task answers."
          : "Never paste credentials or payment details.";
  const providerRetentionCopy = health?.provider?.zeroDataRetentionVerified
    ? "OpenAI zero data retention is marked verified; contact details still stay local."
    : "OpenAI preview may retain redacted task text for abuse monitoring for up to 30 days; contact details stay local.";
  const localSubmission = submission?.storage?.mode === "local-json";

  useEffect(() => {
    let active = true;
    void fetch("/api/request-assistant", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<AssistantHealth> : null)
      .then((data) => { if (active && data) setHealth(data); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(
    () => () => requestCoordinatorRef.current?.invalidate(),
    [],
  );

  function scrollTranscript() {
    window.setTimeout(() => transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight, behavior: "smooth" }), 0);
  }

  async function sendAnswer(value?: string) {
    const answer = (value ?? input).trim();
    if (!answer || busy || !answering || submission?.ok) return;

    const nextMessages = [...messages, { role: "user" as const, content: answer }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    scrollTranscript();
    const requestLease = requestCoordinatorRef.current!.begin();

    try {
      const response = await fetch("/api/request-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ messages: nextMessages.slice(-12), draft, answering, useAi }),
        signal: requestLease.signal,
      });
      const data = (await response.json().catch(() => null)) as AssistantResponse | null;
      if (!requestLease.isCurrent()) return;
      if (!response.ok || !data?.ok || !data.draft || !data.reply) throw new Error(failureMessage(data, response.status));

      setDraft(data.draft);
      setReady(Boolean(data.readyToSubmit));
      setAnswering(data.nextField ?? null);
      setSuggestion(
        data.suggestedDraft && data.suggestedField
          ? { draft: data.suggestedDraft, field: data.suggestedField }
          : null,
      );
      setProviderResult(data.provider ?? null);
      setMessages((current) => [...current, { role: "assistant", content: data.reply as string }]);
      scrollTranscript();
    } catch (requestError) {
      if (!requestLease.isCurrent()) return;
      setError(requestError instanceof Error ? requestError.message : "The intake could not continue.");
    } finally {
      if (requestLease.finish()) setBusy(false);
    }
  }

  function editField(field: AssistantField) {
    if (busy) return;
    setAnswering(field);
    setReady(false);
    setSubmission(null);
    setSuggestion(null);
    setProviderResult(null);
    setError(null);
    setMessages((current) => [...current, { role: "assistant", content: prompts[field] }]);
    scrollTranscript();
  }

  async function submitRequest() {
    if (!ready || submitting || !draft.name || !draft.email || !draft.service || !draft.request) return;
    setSubmitting(true);
    setError(null);

    try {
      const submissionFingerprint = JSON.stringify({
        name: draft.name,
        email: draft.email,
        businessUrl: draft.businessUrl ?? "",
        service: draft.service,
        request: draft.request,
        budget: draft.budget ?? "",
        timeline: draft.timeline ?? "",
        aiProcessing: useAi,
      });
      if (submissionAttemptRef.current?.fingerprint !== submissionFingerprint) {
        submissionAttemptRef.current = {
          fingerprint: submissionFingerprint,
          idempotencyKey: crypto.randomUUID(),
        };
      }

      const response = await fetch("/api/v1/requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionAttemptRef.current.idempotencyKey,
        },
        cache: "no-store",
        body: JSON.stringify({
          name: draft.name,
          email: draft.email,
          businessUrl: draft.businessUrl ?? "",
          service: draft.service,
          request: draft.request,
          budget: draft.budget ?? "",
          timeline: draft.timeline ?? "",
          honeypot: "",
          consents: {
            aiProcessing: useAi,
            productAnalytics: false,
            modelTraining: false,
          },
        }),
      });
      const data = (await response.json().catch(() => null)) as SubmissionResponse | null;
      const storageMode = data?.storage?.mode;
      if (
        !response.ok ||
        !data?.ok ||
        !data.requestId ||
        !data.acceptedAt ||
        !data.notifications ||
        (storageMode !== "local-json" && storageMode !== "supabase")
      ) {
        throw new Error(
          data?.error === "sensitive_content_detected"
            ? "Remove credentials or payment details before submitting."
            : data?.error === "idempotency_conflict"
              ? "This reviewed request changed during a retry. Review it again before submitting."
              : data?.message ?? data?.error ?? "The request could not be saved.",
        );
      }
      setSubmission({
        ok: true,
        requestId: data.requestId,
        acceptedAt: data.acceptedAt,
        storage: { mode: storageMode },
        notifications: {
          customer: data.notifications.customer ?? "unknown",
          team: data.notifications.team ?? "unknown",
        },
      });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The request could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    requestCoordinatorRef.current?.invalidate();
    setMessages([intro]);
    setDraft({});
    setAnswering("service");
    setInput("");
    setBusy(false);
    setReady(false);
    setError(null);
    setSubmission(null);
    setUseAi(false);
    setSuggestion(null);
    setProviderResult(null);
    submissionAttemptRef.current = null;
  }

  function applySuggestion() {
    if (!suggestion || busy) return;
    const applied = applySuggestionToDraft(
      draft,
      suggestion.draft,
      suggestion.field,
    );
    setDraft(applied.draft);
    setReady(applied.readyToSubmit);
    setAnswering(applied.nextField);
    setSuggestion(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendAnswer();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="Claw Services home"><ClawBrandLogo /></Link>
        <div className={styles.previewStatus}><i /> Private preview</div>
        <div className={styles.topActions}>
          <button type="button" onClick={reset}><RotateCcw size={15} /> Reset</button>
          <Link href="/"><ArrowLeft size={15} /> Back to site</Link>
        </div>
      </header>

      <section className={styles.intro}>
        <div><span>Claw intake workspace</span><h1>From rough ask to operator-ready brief.</h1></div>
        <button
          type="button"
          className={`${styles.privacy} ${useAi ? styles.aiOn : ""}`}
          role="switch"
          aria-checked={useAi}
          disabled={!aiReady}
          onClick={() => setUseAi((current) => !current)}
        >
          {aiReady ? <Sparkles size={20} /> : <ShieldCheck size={20} />}
          <p>
            <strong>{aiReady ? "OpenAI Luna preview" : "Guided mode"}</strong>
            <small className={!health?.provider?.zeroDataRetentionVerified ? styles.retentionWarning : undefined}>
              {aiReady
                ? health?.provider?.zeroDataRetentionVerified
                  ? (useAi ? "On · task text only · ZDR verified" : "Off · ZDR verified · click to opt in")
                  : (useAi ? "On · redacted task text · abuse monitoring up to 30 days" : "Off · may retain redacted task text up to 30 days")
                : "OpenAI Luna preview unavailable · guided mode stays active"}
            </small>
          </p>
          <span className={styles.aiSwitch} aria-hidden="true"><i /></span>
        </button>
      </section>

      <div className={styles.workspace}>
        <section className={styles.conversation} aria-label="Request intake conversation">
          <div className={styles.conversationHead}>
            <p><span>Live intake</span><strong>{submission?.ok ? "Handoff created" : ready ? "Ready for review" : labels[currentField]}</strong></p>
            <span>{progress}% briefed</span>
          </div>
          <div className={styles.progress} aria-label={`${progress}% of required brief completed`}><i style={{ width: `${progress}%` }} /></div>

          <div className={styles.transcript} ref={transcriptRef} aria-live="polite">
            {messages.map((message, index) => (
              <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={`${message.role}-${index}`}>
                <span>{message.role === "user" ? "You" : "Claw intake"}</span><p>{message.content}</p>
              </article>
            ))}
            {busy ? <article className={styles.assistantMessage}><span>Claw intake</span><div className={styles.thinking}><i /><i /><i /></div></article> : null}
          </div>

          {submission?.ok ? (
            <div className={styles.success}>
              <i><Check size={22} /></i><div><span>{localSubmission ? "Local demo handoff created" : "Request handoff created"}</span><h2>{submission.requestId}</h2><p>{localSubmission ? "Saved only in this development workspace. No remote handoff was created." : "Stored securely for Claw’s team. We’ll follow up using the contact details you provided."}</p></div>
              <button type="button" onClick={reset}>Start another request</button>
            </div>
          ) : (
            <div className={styles.composerArea}>
              {answering === "service" ? <div className={styles.serviceChoices}>{serviceOptions.map((service) => <button type="button" key={service} onClick={() => void sendAnswer(service)} disabled={busy}>{service}</button>)}</div> : null}
              {!ready ? (
                <form className={styles.composer} onSubmit={onSubmit}>
                  <label htmlFor="request-answer">{prompts[currentField]}</label>
                  <div><textarea id="request-answer" rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Answer ${labels[currentField].toLowerCase()}…`} disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendAnswer(); } }} /><button type="submit" disabled={!input.trim() || busy} aria-label="Send answer"><ArrowUp size={19} /></button></div>
                  <footer><button type="button" onClick={() => void sendAnswer(samples[currentField])} disabled={busy}>Use demo answer</button><span>{useAi ? <Sparkles size={13} /> : <LockKeyhole size={13} />}{providerCaption}</span></footer>
                </form>
              ) : (
                <div className={styles.reviewAction}><p><span>Brief complete</span><strong>Review every detail before creating the handoff.</strong></p><button type="button" onClick={() => void submitRequest()} disabled={submitting}>{submitting ? "Creating…" : "Submit request"}</button></div>
              )}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
          )}
        </section>

        <aside className={styles.brief} aria-label="Live request brief">
          <div className={styles.briefHead}><p><span>Operator brief</span><strong>{draft.name || "New request"}</strong></p><i className={ready ? styles.ready : ""}>{ready ? "Review ready" : "Drafting"}</i></div>
          <p className={styles.summary}>{summary}</p>
          {suggestion ? (
            <section className={styles.suggestion} aria-label={`${modelName} preview suggestion`}>
              <header><span><Sparkles size={14} /> {modelName} preview suggestion</span><small>Unapplied</small></header>
              {(Object.entries(suggestion.draft) as Array<[TaskField, string]>).map(([field, value]) => (
                <p key={field}><strong>{labels[field]}</strong><span>{value}</span></p>
              ))}
              <footer><button type="button" onClick={applySuggestion} disabled={busy}>Apply suggestion</button><button type="button" onClick={() => setSuggestion(null)} disabled={busy}>Dismiss</button></footer>
            </section>
          ) : null}
          <div className={styles.fields}>
            {briefFields.map((field) => {
              const value = draft[field];
              return <div className={styles.field} key={field}><span>{labels[field]}</span><div><p className={value ? "" : styles.empty}>{value || (required.includes(field) ? "Required" : "Optional")}</p><button type="button" onClick={() => editField(field)} disabled={busy}><Pencil size={13} /> {value ? "Edit" : "Add"}</button></div></div>;
            })}
          </div>
          <div className={styles.trust}><ShieldCheck size={19} /><p><strong>You control the canonical brief.</strong><span>Claw never auto-submits or silently replaces accepted details.</span><span>{providerRetentionCopy}</span></p></div>
        </aside>
      </div>
    </main>
  );
}
