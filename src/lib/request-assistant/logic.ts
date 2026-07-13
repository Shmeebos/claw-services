import { serviceOptions } from "../landing-content";
import { requestSchema } from "../request-schema";
import type { AssistantField, RequestDraft } from "./types";

const requiredFieldOrder: AssistantField[] = ["service", "request", "name", "email"];

const fieldQuestions: Record<AssistantField, string> = {
  service:
    "What kind of work do you need: a website or landing page, lead intake automation, content or design, research or admin help, or a monthly operator desk?",
  request:
    "What outcome do you want, and what is getting in the way today? A few concrete details will help me shape the brief.",
  name: "What name or business name should we attach to this request?",
  email: "What email should Claw Services use for this request?",
  businessUrl: "Do you have a business website or social link to include? You can skip this.",
  budget: "Do you have a budget range in mind? You can skip this.",
  timeline: "Is there a target date or urgency we should know about? You can skip this.",
};

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function clean(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function normalizeService(value: string | undefined) {
  const candidate = clean(value);
  if (!candidate) return undefined;

  const exact = serviceOptions.find((service) => service.toLowerCase() === candidate.toLowerCase());
  if (exact) return exact;

  const lower = candidate.toLowerCase();
  if (/website|landing|web page|homepage/.test(lower)) return "Premium website / landing page" as const;
  if (/lead|intake|form|follow[- ]?up|automation/.test(lower)) return "Lead intake automation" as const;
  if (/content|design|graphic|brand|social|copy/.test(lower)) return "Content or design pack" as const;
  if (/research|admin|spreadsheet|data|document/.test(lower)) return "Research or admin pack" as const;
  if (/monthly|ongoing|operator|recurring|desk/.test(lower)) return "Monthly operator desk" as const;

  return undefined;
}

export function normalizeDraft(draft: RequestDraft): RequestDraft {
  const normalized: RequestDraft = {};
  const name = clean(draft.name);
  const email = clean(draft.email);
  const businessUrl = clean(draft.businessUrl);
  const service = normalizeService(draft.service);
  const request = clean(draft.request);
  const budget = clean(draft.budget);
  const timeline = clean(draft.timeline);

  if (name) normalized.name = name;
  if (email) normalized.email = email;
  if (businessUrl) normalized.businessUrl = businessUrl;
  if (service) normalized.service = service;
  if (request) normalized.request = request;
  if (budget) normalized.budget = budget;
  if (timeline) normalized.timeline = timeline;

  return normalized;
}

export function mergeDraft(base: RequestDraft, update: RequestDraft) {
  return normalizeDraft({
    ...base,
    ...Object.fromEntries(
      Object.entries(update).filter(([, value]) => typeof value === "string" && value.trim().length > 0),
    ),
  });
}

function assignAnswer(draft: RequestDraft, field: AssistantField, message: string) {
  const value = message.trim();
  if (!value) return draft;

  if (field === "service") {
    const service = normalizeService(value);
    return service ? { ...draft, service } : draft;
  }

  if (field === "email") {
    const email = value.match(emailPattern)?.[0];
    return email ? { ...draft, email } : draft;
  }

  if (field === "name") {
    return { ...draft, name: value.replace(/^\s*(?:my name is|this is|we are)\s+/i, "").trim() };
  }

  return { ...draft, [field]: value };
}

export function applyDeterministicAnswer(
  currentDraft: RequestDraft,
  answering: AssistantField | undefined,
  latestUserMessage: string,
) {
  let draft = normalizeDraft(currentDraft);
  const message = latestUserMessage.trim();

  if (answering) draft = assignAnswer(draft, answering, message);

  if (!draft.email) {
    const email = message.match(emailPattern)?.[0];
    if (email) draft.email = email;
  }

  if (!draft.name) {
    const name = message.match(/\b(?:my name is|this is|we are)\s+([^,.!?]{2,120})/i)?.[1]?.trim();
    if (name) draft.name = name;
  }

  if (!draft.service) {
    const service = normalizeService(message);
    if (service) draft.service = service;
  }

  if (
    !draft.request &&
    (!answering || answering === "request") &&
    message.length >= 15 &&
    !emailPattern.test(message) &&
    !/^\s*(?:my name is|this is|we are)\b/i.test(message)
  ) {
    draft.request = message;
  }

  return normalizeDraft(draft);
}

export function evaluateDraft(draft: RequestDraft) {
  const candidate = {
    name: draft.name ?? "",
    email: draft.email ?? "",
    businessUrl: draft.businessUrl ?? "",
    service: draft.service ?? "",
    request: draft.request ?? "",
    budget: draft.budget ?? "",
    timeline: draft.timeline ?? "",
    honeypot: "",
  };
  const parsed = requestSchema.safeParse(candidate);

  if (parsed.success) {
    const submissionPayload = {
      name: parsed.data.name,
      email: parsed.data.email,
      businessUrl: parsed.data.businessUrl,
      service: parsed.data.service,
      request: parsed.data.request,
      budget: parsed.data.budget,
      timeline: parsed.data.timeline,
    };
    return {
      readyToSubmit: true as const,
      missing: [] as AssistantField[],
      issues: {},
      submissionPayload,
    };
  }

  const issues = parsed.error.flatten().fieldErrors;
  const missing = requiredFieldOrder.filter((field) => Boolean(issues[field]?.length));

  return {
    readyToSubmit: false as const,
    missing,
    issues,
    submissionPayload: null,
  };
}

export function getNextRequiredField(draft: RequestDraft) {
  return evaluateDraft(draft).missing[0] ?? null;
}

export function buildGuidedReply(draft: RequestDraft) {
  const evaluation = evaluateDraft(draft);
  const nextField = evaluation.missing[0] ?? null;

  if (!nextField) {
    return "Your request draft is ready. Review the details, add an optional budget or timeline if useful, then choose Submit request when you are comfortable. I have not submitted anything yet.";
  }

  return fieldQuestions[nextField];
}

export function isMisleadingSubmissionClaim(reply: string) {
  return /(?:i(?:'ve| have)?|we(?:'ve| have)?|your request (?:has been|is))\s+(?:already\s+)?(?:submitted|saved|created|sent)/i.test(
    reply,
  );
}

export function isUnsafeAssistantReply(reply: string) {
  if (isMisleadingSubmissionClaim(reply)) return true;
  if (/\b(?:password|passcode|api[_ -]?key|access[_ -]?token|private key|credit card|card number|cvv|social security number)\b/i.test(reply)) {
    return true;
  }
  if (/https?:\/\/|\bwww\./i.test(reply)) return true;
  return false;
}
