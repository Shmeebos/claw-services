import { z } from "zod";
import { serviceOptions } from "../landing-content";
import { requestFieldLimits } from "../request-schema";

export const assistantFieldSchema = z.enum([
  "name",
  "email",
  "businessUrl",
  "service",
  "request",
  "budget",
  "timeline",
]);

export const taskFieldSchema = z.enum(["service", "request", "budget", "timeline"]);

export const requestDraftSchema = z
  .object({
    name: z.string().trim().max(requestFieldLimits.name).optional(),
    email: z.string().trim().max(requestFieldLimits.email).optional(),
    businessUrl: z.string().trim().max(requestFieldLimits.businessUrl).optional(),
    service: z.enum(serviceOptions).optional(),
    request: z.string().trim().max(requestFieldLimits.request).optional(),
    budget: z.string().trim().max(requestFieldLimits.budget).optional(),
    timeline: z.string().trim().max(requestFieldLimits.timeline).optional(),
  })
  .strict();

export const providerTaskDraftSchema = z
  .object({
    service: z.enum(serviceOptions).optional(),
    request: z.string().trim().min(15).max(requestFieldLimits.request).optional(),
    budget: z.string().trim().max(requestFieldLimits.budget).optional(),
    timeline: z.string().trim().max(requestFieldLimits.timeline).optional(),
  })
  .strict();

export const assistantMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(2000),
  })
  .strict();

export const requestAssistantInputSchema = z
  .object({
    messages: z.array(assistantMessageSchema).min(1).max(12),
    draft: requestDraftSchema.optional().default({}),
    answering: assistantFieldSchema.optional(),
    useAi: z.boolean().optional().default(false),
    honeypot: z.string().trim().max(requestFieldLimits.honeypot).optional().default(""),
  })
  .strict();

export const providerOutputSchema = z
  .object({
    draft: providerTaskDraftSchema,
  })
  .strict();

export type AssistantField = z.infer<typeof assistantFieldSchema>;
export type TaskField = z.infer<typeof taskFieldSchema>;
export type RequestDraft = z.infer<typeof requestDraftSchema>;
export type ProviderTaskDraft = z.infer<typeof providerTaskDraftSchema>;
export type RequestAssistantInput = z.infer<typeof requestAssistantInputSchema>;
export type ProviderOutput = z.infer<typeof providerOutputSchema>;
