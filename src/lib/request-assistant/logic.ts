import { serviceOptions } from "../landing-content";
import { requestFieldLimits, requestSchema } from "../request-schema";
import {
  providerTaskDraftSchema,
  taskFieldSchema,
  type AssistantField,
  type ProviderTaskDraft,
  type RequestDraft,
  type TaskField,
} from "./types";

const requiredFieldOrder: AssistantField[] = ["service", "request", "name", "email"];
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

const fieldQuestions: Record<AssistantField, string> = {
  service:
    "What kind of work do you need: a website or landing page, lead intake automation, content and design, research and admin, or a monthly operator desk?",
  request: "What outcome do you want, and what is getting in the way today?",
  name: "What name should we attach to this request?",
  email: "What email should receive the request confirmation?",
  businessUrl: "Do you have a website or profile link to include?",
  budget: "Do you have a budget range in mind?",
  timeline: "Is there a deadline or preferred timeline?",
};

function bounded(value: string | undefined, maximum: number) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.length > maximum) return undefined;
  return trimmed;
}

export function normalizeDraft(input: RequestDraft): RequestDraft {
  const draft: RequestDraft = {};
  const name = bounded(input.name, requestFieldLimits.name);
  const email = bounded(input.email, requestFieldLimits.email);
  const businessUrl = bounded(input.businessUrl, requestFieldLimits.businessUrl);
  const request = bounded(input.request, requestFieldLimits.request);
  const budget = bounded(input.budget, requestFieldLimits.budget);
  const timeline = bounded(input.timeline, requestFieldLimits.timeline);

  if (name) draft.name = name;
  if (email) draft.email = email;
  if (businessUrl) draft.businessUrl = businessUrl;
  if (input.service && serviceOptions.includes(input.service)) draft.service = input.service;
  if (request) draft.request = request;
  if (budget) draft.budget = budget;
  if (timeline) draft.timeline = timeline;
  return draft;
}

function normalizeService(value: string) {
  const exact = serviceOptions.find((option) => option.toLowerCase() === value.trim().toLowerCase());
  if (exact) return exact;

  const lower = value.toLowerCase();
  if (/website|landing page|web design|site\b/.test(lower)) return serviceOptions[0];
  if (/lead|intake|crm|automation|automate|workflow/.test(lower)) return serviceOptions[1];
  if (/content|design|brand|creative|copy/.test(lower)) return serviceOptions[2];
  if (/research|admin|analysis|document|ops support/.test(lower)) return serviceOptions[3];
  if (/monthly|operator|ongoing|retainer|desk/.test(lower)) return serviceOptions[4];
  return undefined;
}

function assignExplicitField(draft: RequestDraft, field: AssistantField, raw: string) {
  if (field === "service") {
    const service = normalizeService(raw);
    if (service) draft.service = service;
    return;
  }
  if (field === "email") {
    const email = raw.match(emailPattern)?.[0];
    const value = bounded(email, requestFieldLimits.email);
    if (value) draft.email = value;
    return;
  }
  if (field === "name") {
    const value = bounded(
      raw.replace(/^\s*(?:my name is|this is|we are)\s+/i, ""),
      requestFieldLimits.name,
    );
    if (value) draft.name = value;
    return;
  }

  const value = bounded(raw, requestFieldLimits[field]);
  if (value) draft[field] = value;
}

export function applyDeterministicAnswer(
  currentDraft: RequestDraft,
  answering: AssistantField | undefined,
  latestUserMessage: string,
) {
  const draft = normalizeDraft(currentDraft);
  const message = latestUserMessage.trim();

  if (answering && message) assignExplicitField(draft, answering, message);

  if (!draft.email) {
    const email = bounded(message.match(emailPattern)?.[0], requestFieldLimits.email);
    if (email) draft.email = email;
  }
  if (!draft.service) {
    const service = normalizeService(message);
    if (service) draft.service = service;
  }
  if (!draft.name) {
    const nameMatch = message.match(/^\s*(?:my name is|this is|we are)\s+(.{2,120})$/i);
    const name = bounded(nameMatch?.[1], requestFieldLimits.name);
    if (name) draft.name = name;
  }
  if (
    !draft.request &&
    (!answering || answering === "request") &&
    message.length >= 15 &&
    message.length <= requestFieldLimits.request &&
    !emailPattern.test(message) &&
    !/^\s*(?:my name is|this is|we are)\b/i.test(message)
  ) {
    draft.request = message;
  }

  return draft;
}

export function filterProviderSuggestion(
  existingDraft: RequestDraft,
  candidate: ProviderTaskDraft,
  answering?: AssistantField,
) {
  const parsed = providerTaskDraftSchema.safeParse(candidate);
  if (!parsed.success) return {};

  const parsedAnswering = answering ? taskFieldSchema.safeParse(answering) : null;
  const allowedFields: TaskField[] = parsedAnswering?.success
    ? [parsedAnswering.data]
    : answering
      ? []
      : ["service", "request", "budget", "timeline"];
  const suggestion: ProviderTaskDraft = {};

  for (const field of allowedFields) {
    if (existingDraft[field] || !parsed.data[field]) continue;
    if (field === "service") suggestion.service = parsed.data.service;
    if (field === "request") suggestion.request = parsed.data.request;
    if (field === "budget") suggestion.budget = parsed.data.budget;
    if (field === "timeline") suggestion.timeline = parsed.data.timeline;
  }

  return suggestion;
}

export function prepareProviderSuggestion(
  existingDraft: RequestDraft,
  candidate: ProviderTaskDraft,
  answering?: AssistantField,
) {
  const parsedAnswering = answering ? taskFieldSchema.safeParse(answering) : null;
  if (!parsedAnswering?.success) return null;

  const comparisonDraft: RequestDraft = {
    ...existingDraft,
    [parsedAnswering.data]: undefined,
  };
  const draft = filterProviderSuggestion(
    comparisonDraft,
    candidate,
    parsedAnswering.data,
  );
  if (!draft[parsedAnswering.data]) return null;

  return {
    draft,
    field: parsedAnswering.data,
  };
}

export function applySuggestionToDraft(
  currentDraft: RequestDraft,
  candidate: ProviderTaskDraft,
  authorizedField?: TaskField | null,
) {
  const parsedField = taskFieldSchema.safeParse(authorizedField);
  const acceptedSuggestion = parsedField.success
    ? filterProviderSuggestion({}, candidate, parsedField.data)
    : {};
  const draft = normalizeDraft({ ...currentDraft, ...acceptedSuggestion });
  const evaluation = evaluateDraft(draft);

  return {
    draft,
    readyToSubmit: evaluation.readyToSubmit,
    nextField: evaluation.missing[0] ?? null,
  };
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
    return {
      readyToSubmit: true,
      missing: [] as AssistantField[],
      issues: {},
      submissionPayload: {
        name: parsed.data.name,
        email: parsed.data.email,
        businessUrl: parsed.data.businessUrl,
        service: parsed.data.service,
        request: parsed.data.request,
        budget: parsed.data.budget,
        timeline: parsed.data.timeline,
      },
    };
  }

  const fieldErrors = parsed.error.flatten().fieldErrors;
  const missing = requiredFieldOrder.filter((field) => fieldErrors[field]?.length);
  return { readyToSubmit: false, missing, issues: fieldErrors, submissionPayload: null };
}

export function getNextRequiredField(draft: RequestDraft) {
  return evaluateDraft(draft).missing[0] ?? null;
}

export function buildGuidedReply(draft: RequestDraft) {
  const nextField = getNextRequiredField(draft);
  if (nextField) return fieldQuestions[nextField];
  return "Your request draft is ready to review. I have not submitted anything yet; submit it only when every detail looks right.";
}
