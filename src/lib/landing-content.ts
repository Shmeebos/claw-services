export const LANDING_CACHE_VERSION = "claw-landing-v1";
export const LANDING_REVALIDATE_SECONDS = 60 * 60;
export const LANDING_STALE_WHILE_REVALIDATE_SECONDS = 60 * 60 * 24;

// Public, non-user-specific landing catalog. It is safe to cache in the
// browser and at the edge because it contains only marketing copy and asset
// paths. Bump LANDING_CACHE_VERSION whenever the shape or meaning changes so
// clients reject stale localStorage payloads before rendering them.
export const serviceOptions = [
  "Premium website / landing page",
  "Lead intake automation",
  "Content or design pack",
  "Research or admin pack",
  "Monthly operator desk",
] as const;

export type ServiceKey = "website" | "automation" | "content" | "research" | "desk";

export const serviceCards: Record<
  ServiceKey,
  {
    label: string;
    service: (typeof serviceOptions)[number];
    summary: string;
    tooltip: string;
    deliverables: string[];
    timeline: string;
    effort: string;
    next: string;
  }
> = {
  website: {
    label: "Website / landing page",
    service: "Premium website / landing page",
    summary:
      "Make the business look credible, explain the offer fast, and create a clear path to contact or book.",
    tooltip: "Show the website sprint preview.",
    deliverables: ["Homepage structure", "Mobile polish", "Lead form", "Launch checklist"],
    timeline: "3–7 days",
    effort: "One intake + review",
    next: "Approve scope",
  },
  automation: {
    label: "Automation / intake flow",
    service: "Lead intake automation",
    summary:
      "Capture requests, route them to the right place, and prevent missed follow-ups with a simple operating flow.",
    tooltip: "Show the intake automation preview.",
    deliverables: ["Intake form", "Email routing", "Tracking sheet", "Operator checklist"],
    timeline: "2–5 days",
    effort: "Map the current flow",
    next: "Connect tools",
  },
  content: {
    label: "Content / design pack",
    service: "Content or design pack",
    summary:
      "Turn rough ideas into launch-ready copy, visuals, one-pagers, or brand materials that can be used immediately.",
    tooltip: "Show the content/design preview.",
    deliverables: ["Landing copy", "Social assets", "One-page PDF", "Brand polish"],
    timeline: "2–6 days",
    effort: "Send rough material",
    next: "Review drafts",
  },
  research: {
    label: "Research / admin work",
    service: "Research or admin pack",
    summary:
      "Messy research becomes a clean sheet, source notes, scoring, and next-action recommendations.",
    tooltip: "Show the research/admin preview.",
    deliverables: ["Lead list", "Source notes", "Scoring", "Outreach angles"],
    timeline: "1–4 days",
    effort: "Define target criteria",
    next: "Approve criteria",
  },
  desk: {
    label: "Monthly operator desk",
    service: "Monthly operator desk",
    summary:
      "A standing digital services desk for recurring requests, status tracking, and fast human-operated execution.",
    tooltip: "Show the monthly desk preview.",
    deliverables: ["Priority queue", "Weekly status", "Reusable briefs", "Delivery archive"],
    timeline: "Monthly",
    effort: "Submit requests as needed",
    next: "Set desk rules",
  },
};

export const servicesShowcase = [
  {
    title: "Premium websites",
    service: "Websites + landing pages",
    image: "/stock/premium-workspace.jpg",
    caption: "Branded website polish",
    copy: "Homepage, service pages, mobile polish, lead forms, copy cleanup, launch support.",
    stat: "3–7 day sprint",
  },
  {
    title: "Lead systems",
    service: "Forms + routing",
    image: "/stock/client-laptop.jpg",
    caption: "Intake + lead routing",
    copy: "Forms, email notifications, tracking sheets, qualification logic, and follow-up flows.",
    stat: "No missed requests",
  },
  {
    title: "Content + design assets",
    service: "Launch-ready materials",
    image: "/stock/strategy-desk.jpg",
    caption: "Ready-to-use assets",
    copy: "Landing copy, social assets, one-pagers, decks, service menus, and polished business materials.",
    stat: "Copy + visuals",
  },
  {
    title: "Research + admin packs",
    service: "Operator research desk",
    image: "/stock/team-ops.jpg",
    caption: "Source-backed research",
    copy: "Prospect lists, competitor scans, source notes, scoring, outreach angles, and cleanup work.",
    stat: "Clean sheets",
  },
  {
    title: "Monthly operator desk",
    service: "Recurring service queue",
    image: "/stock/operator-desk.jpg",
    caption: "Ongoing fulfillment",
    copy: "A standing queue for recurring digital requests, status tracking, approvals, and delivery history.",
    stat: "Priority queue",
  },
] as const;

export const landingContent = {
  version: LANDING_CACHE_VERSION,
  revalidateSeconds: LANDING_REVALIDATE_SECONDS,
  serviceOptions,
  serviceCards,
  servicesShowcase,
} as const;

export type LandingContent = typeof landingContent;
