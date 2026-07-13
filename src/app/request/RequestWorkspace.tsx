"use client";

import Link from "next/link";
import { ArrowLeft, ArrowUp, Check, LockKeyhole, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { type FormEvent, useMemo, useRef, useState } from "react";
import { ClawBrandLogo } from "@/components/ClawBrandLogo";
import { serviceOptions } from "@/lib/landing-content";
import type { AssistantField, RequestDraft } from "@/lib/request-assistant/types";
import styles from "./page.module.css";

type ChatMessage = { role: "user" | "assistant"; content: string };

type AssistantResponse = {
  ok: boolean;
  reply?: string;
  message?: string;
  error?: string;
  draft?: RequestDraft;
  nextField?: AssistantField | null;
  readyToSubmit?: boolean;
};

type SubmissionResponse = {
  ok: boolean;
  requestId?: string;
  message?: string;
  error?: string;
  storage?: { mode?: string };
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
const briefFields: AssistantField[] = ["service", "request", "budget", "timeline", "name", "email"];
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
  const [submission, setSubmission] = useState<SubmissionResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const completed = required.filter((field) => Boolean(draft[field])).length;
  const progress = Math.round((completed / required.length) * 100);
  const currentField = answering ?? "request";
  const summary = useMemo(
    () => draft.request ?? (draft.service ? `Scoping ${draft.service.toLowerCase()}.` : "Your brief will take shape here as you answer."),
    [draft.request, draft.service],
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

    try {
      const response = await fetch("/api/request-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ messages: nextMessages.slice(-12), draft, answering, useAi: false }),
      });
      const data = (await response.json().catch(() => null)) as AssistantResponse | null;
      if (!response.ok || !data?.ok || !data.draft || !data.reply) throw new Error(failureMessage(data, response.status));

      setDraft(data.draft);
      setReady(Boolean(data.readyToSubmit));
      setAnswering(data.nextField ?? null);
      setMessages((current) => [...current, { role: "assistant", content: data.reply as string }]);
      scrollTranscript();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The intake could not continue.");
    } finally {
      setBusy(false);
    }
  }

  function editField(field: AssistantField) {
    setAnswering(field);
    setReady(false);
    setSubmission(null);
    setError(null);
    setMessages((current) => [...current, { role: "assistant", content: prompts[field] }]);
    scrollTranscript();
  }

  async function submitRequest() {
    if (!ready || submitting || !draft.name || !draft.email || !draft.service || !draft.request) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        }),
      });
      const data = (await response.json().catch(() => null)) as SubmissionResponse | null;
      if (!response.ok || !data?.ok || !data.requestId) throw new Error(data?.message ?? data?.error ?? "The request could not be saved.");
      setSubmission(data);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "The request could not be saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setMessages([intro]);
    setDraft({});
    setAnswering("service");
    setInput("");
    setBusy(false);
    setReady(false);
    setError(null);
    setSubmission(null);
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
        <div className={styles.privacy}><ShieldCheck size={20} /><p><strong>Guided private mode</strong><small>No external AI provider in this demo</small></p></div>
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
              <i><Check size={22} /></i><div><span>Local demo handoff created</span><h2>{submission.requestId}</h2><p>Saved only in this development workspace. Nothing was sent to production.</p></div>
              <button type="button" onClick={reset}>Start another request</button>
            </div>
          ) : (
            <div className={styles.composerArea}>
              {answering === "service" ? <div className={styles.serviceChoices}>{serviceOptions.map((service) => <button type="button" key={service} onClick={() => void sendAnswer(service)} disabled={busy}>{service}</button>)}</div> : null}
              {!ready ? (
                <form className={styles.composer} onSubmit={onSubmit}>
                  <label htmlFor="request-answer">{prompts[currentField]}</label>
                  <div><textarea id="request-answer" rows={2} value={input} onChange={(event) => setInput(event.target.value)} placeholder={`Answer ${labels[currentField].toLowerCase()}…`} disabled={busy} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendAnswer(); } }} /><button type="submit" disabled={!input.trim() || busy} aria-label="Send answer"><ArrowUp size={19} /></button></div>
                  <footer><button type="button" onClick={() => void sendAnswer(samples[currentField])} disabled={busy}>Use demo answer</button><span><LockKeyhole size={13} /> Never paste credentials or payment details.</span></footer>
                </form>
              ) : (
                <div className={styles.reviewAction}><p><span>Brief complete</span><strong>Review every detail before creating the handoff.</strong></p><button type="button" onClick={() => void submitRequest()} disabled={submitting}>{submitting ? "Creating…" : "Create demo request"}</button></div>
              )}
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
          )}
        </section>

        <aside className={styles.brief} aria-label="Live request brief">
          <div className={styles.briefHead}><p><span>Operator brief</span><strong>{draft.name || "New request"}</strong></p><i className={ready ? styles.ready : ""}>{ready ? "Review ready" : "Drafting"}</i></div>
          <p className={styles.summary}>{summary}</p>
          <div className={styles.fields}>
            {briefFields.map((field) => {
              const value = draft[field];
              return <div className={styles.field} key={field}><span>{labels[field]}</span><div><p className={value ? "" : styles.empty}>{value || (required.includes(field) ? "Required" : "Optional")}</p><button type="button" onClick={() => editField(field)}><Pencil size={13} /> {value ? "Edit" : "Add"}</button></div></div>;
            })}
          </div>
          <div className={styles.trust}><ShieldCheck size={19} /><p><strong>You control the canonical brief.</strong><span>Claw never auto-submits or silently replaces accepted details.</span></p></div>
        </aside>
      </div>
    </main>
  );
}
