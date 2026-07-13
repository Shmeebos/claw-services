import { z } from "zod";
import { serviceOptions } from "../landing-content";

export const assistantFieldSchema = z.enum([
  "name",
  "email",
  "businessUrl",
  "service",
  "request",
  "budget",
  "timeline",
]);

export const requestDraftSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().max(180).optional(),
    businessUrl: z.string().trim().max(240).optional(),
    service: z.enum(serviceOptions).optional(),
    request: z.string().trim().max(2200).optional(),
    budget: z.string().trim().max(80).optional(),
    timeline: z.string().trim().max(80).optional(),
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
    honeypot: z.string().trim().max(200).optional().default(""),
  })
  .strict();

export const providerOutputSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
  draft: requestDraftSchema.default({}),
  nextField: assistantFieldSchema.nullable().optional(),
});

export type AssistantField = z.infer<typeof assistantFieldSchema>;
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type RequestDraft = z.infer<typeof requestDraftSchema>;
export type RequestAssistantInput = z.infer<typeof requestAssistantInputSchema>;
export type ProviderOutput = z.infer<typeof providerOutputSchema>;
