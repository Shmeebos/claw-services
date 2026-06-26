import { z } from "zod";
import { serviceOptions } from "@/lib/landing-content";

export const requestSchema = z.object({
  name: z.string().trim().min(2, "Name or business is required").max(120),
  email: z.string().trim().email("A valid email is required").max(180),
  businessUrl: z.string().trim().max(240).optional().default(""),
  service: z.enum(serviceOptions),
  request: z.string().trim().min(15, "Tell us a little more about what you need").max(2200),
  budget: z.string().trim().max(80).optional().default(""),
  timeline: z.string().trim().max(80).optional().default(""),
  honeypot: z.string().trim().max(200).optional().default(""),
});

export type ClawRequestInput = z.infer<typeof requestSchema>;

export function buildOperatorBrief(input: ClawRequestInput) {
  const business = input.businessUrl ? ` Website/source: ${input.businessUrl}.` : "";
  const budget = input.budget ? ` Budget signal: ${input.budget}.` : "";
  const timeline = input.timeline ? ` Timeline: ${input.timeline}.` : "";

  return `${input.name} needs ${input.service}.${business}${budget}${timeline} First operator action: clarify scope, assets, success criteria, timeline, and approval path. Request summary: ${input.request}`;
}
