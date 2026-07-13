import { z } from "zod";
import { serviceOptions } from "@/lib/landing-content";

export const requestFieldLimits = {
  name: 120,
  email: 180,
  businessUrl: 240,
  request: 2200,
  budget: 80,
  timeline: 80,
  honeypot: 200,
} as const;

export const requestSchema = z
  .object({
    name: z.string().trim().min(2, "Name or business is required").max(requestFieldLimits.name),
    email: z.string().trim().email("A valid email is required").max(requestFieldLimits.email),
    businessUrl: z.string().trim().max(requestFieldLimits.businessUrl).optional().default(""),
    service: z.enum(serviceOptions),
    request: z
      .string()
      .trim()
      .min(15, "Tell us a little more about what you need")
      .max(requestFieldLimits.request),
    budget: z.string().trim().max(requestFieldLimits.budget).optional().default(""),
    timeline: z.string().trim().max(requestFieldLimits.timeline).optional().default(""),
    honeypot: z.string().trim().max(requestFieldLimits.honeypot).optional().default(""),
  })
  .strict();

export type ClawRequestInput = z.infer<typeof requestSchema>;

export function buildOperatorBrief(input: ClawRequestInput) {
  const business = input.businessUrl ? ` Website/source: ${input.businessUrl}.` : "";
  const budget = input.budget ? ` Budget signal: ${input.budget}.` : "";
  const timeline = input.timeline ? ` Timeline: ${input.timeline}.` : "";

  return `${input.name} needs ${input.service}.${business}${budget}${timeline} First operator action: clarify scope, assets, success criteria, timeline, and approval path. Request summary: ${input.request}`;
}
