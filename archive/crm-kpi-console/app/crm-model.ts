export type DataMode = "demo" | "empty";
export type ViewId =
  | "overview"
  | "pipeline"
  | "accounts"
  | "delivery"
  | "governance";

export type MetricTone = "positive" | "attention" | "neutral";

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  context: string;
  change: string;
  tone: MetricTone;
  target: string;
  owner: string;
  source: string;
  freshness: string;
  definition: string;
  decision: string;
  numerator?: number;
  denominator?: number;
  sampleSize?: number;
  quality: string;
}

export interface Opportunity {
  id: string;
  company: string;
  stage: string;
  stageLabel: string;
  owner: string;
  source: string;
  setupValue: number;
  monthlyValue: number;
  ageDays: number;
  nextAction: string;
  nextActionDue: string;
  evidence: "Complete" | "Needs review" | "Missing";
  health: "On track" | "Attention" | "At risk";
  contactPolicy: "Allowed" | "Unknown" | "Do not contact";
  lastActivity: string;
}

export interface Account {
  id: string;
  name: string;
  segment: string;
  relationship: string;
  route: string;
  routeStatus: string;
  contact: string;
  owner: string;
  openValue: number;
  evidence: string;
  lastActivity: string;
}

export interface DeliveryEngagement {
  id: string;
  account: string;
  stage: string;
  progress: number;
  owner: string;
  blocker: string;
  nextMilestone: string;
  firstValue: string;
  health: "On track" | "Attention";
}

export interface GovernanceAlert {
  id: string;
  severity: "Critical" | "Attention" | "Review";
  title: string;
  detail: string;
  count: number;
  action: string;
}

export interface ChatResponse {
  title: string;
  body: string;
  citations: string[];
  nextAction: string;
}

export interface CopilotContext {
  mode: DataMode;
  view: ViewId;
  owner: string;
  source: string;
  selectedMetric?: KpiMetric;
  visibleOpportunities: Opportunity[];
}

export interface RateDisplay {
  display: string;
  quality: "unknown" | "directional-small-sample" | "measured";
  detail: string;
}

export const EMPTY_STATE_MESSAGES = [
  "No active CRM records",
  "Commercial baselines: UNKNOWN",
  "Lead activation: NOT AUTHORIZED",
  "No rate is calculable",
] as const;

export const KPI_METRICS: KpiMetric[] = [
  {
    id: "qualified",
    label: "Qualified opportunities",
    value: "7",
    context: "created this period",
    change: "+3 vs prior 30 days",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Ibrahim",
    source: "Qualified stage evidence",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Distinct opportunities entering qualified with problem, impact, decision path, timing, resource context, fit, and a next step.",
    decision: "Whether the pipeline has enough evidence-backed demand.",
    sampleSize: 7,
    quality: "directional-small-sample",
  },
  {
    id: "discoveries",
    label: "Completed discoveries",
    value: "5",
    context: "attended + documented",
    change: "5 of 6 booked",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Ibrahim",
    source: "Calendar + discovery evidence",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Distinct attended discovery sessions with a complete discovery note. Bookings and cancellations do not count.",
    decision: "Whether qualification activity is converting into real conversations.",
    numerator: 5,
    denominator: 6,
    sampleSize: 6,
    quality: "directional-small-sample",
  },
  {
    id: "proposals",
    label: "Proposals issued",
    value: "3",
    context: "versioned + delivered",
    change: "+1 vs prior period",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Ibrahim",
    source: "Proposal delivery evidence",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Distinct qualified opportunities with a versioned proposal and verified delivery evidence. Drafts do not count.",
    decision: "Whether qualified conversations are advancing to a commercial decision.",
    sampleSize: 3,
    quality: "directional-small-sample",
  },
  {
    id: "wins",
    label: "Verified wins",
    value: "1",
    context: "paid design partner",
    change: "1 of 4 decisions",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Ibrahim",
    source: "Signed scope + payment evidence",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Opportunities with signed scope, setup cash, active recurring billing, a starting baseline, a 90-day plan, and delivery capacity.",
    decision: "Whether commercial decisions are turning into verified revenue.",
    numerator: 1,
    denominator: 4,
    sampleSize: 4,
    quality: "directional-small-sample",
  },
  {
    id: "cash",
    label: "Setup cash collected",
    value: "$7,500",
    context: "cash received",
    change: "+$7,500 this period",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Javed",
    source: "Payment ledger",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Cash received for setup work in the reporting window. Invoiced or verbal commitments do not count.",
    decision: "Whether new work is converting into collected cash.",
    sampleSize: 1,
    quality: "directional-small-sample",
  },
  {
    id: "mrr",
    label: "Monthly recurring revenue",
    value: "$2,800",
    context: "active recurring value",
    change: "+$2,800 net new",
    tone: "positive",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Javed",
    source: "Active contracts + billing",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Active recurring monthly contract value at the reporting cutoff. Setup fees and inactive agreements are excluded.",
    decision: "Whether the recurring revenue base is growing.",
    sampleSize: 1,
    quality: "directional-small-sample",
  },
  {
    id: "completeness",
    label: "Evidence completeness",
    value: "92%",
    context: "23 of 25 required items",
    change: "2 items need review",
    tone: "attention",
    target: "100% control standard",
    owner: "CRM steward",
    source: "Stage validator",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Required stage evidence present and valid across active records. Required fields are versioned by stage.",
    decision: "Whether pipeline decisions can be trusted.",
    numerator: 23,
    denominator: 25,
    sampleSize: 25,
    quality: "measured",
  },
  {
    id: "aging",
    label: "Stage age + overdue",
    value: "6d",
    context: "median · 3 overdue",
    change: "oldest active: 18 days",
    tone: "attention",
    target: "UNKNOWN / FOUNDER-SET",
    owner: "Shane",
    source: "Stage ledger + next actions",
    freshness: "Synthetic demo · refreshed now",
    definition:
      "Median time since the latest valid stage entry, paired with open next actions past their due date.",
    decision: "Which opportunities require attention now.",
    sampleSize: 8,
    quality: "directional-small-sample",
  },
];

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "opp-101",
    company: "Juniper Wellness",
    stage: "decision_pending",
    stageLabel: "Decision pending",
    owner: "Ibrahim",
    source: "Referral",
    setupValue: 7500,
    monthlyValue: 2800,
    ageDays: 18,
    nextAction: "Confirm buyer decision step",
    nextActionDue: "2 days overdue",
    evidence: "Complete",
    health: "At risk",
    contactPolicy: "Allowed",
    lastActivity: "Proposal reviewed 4 days ago",
  },
  {
    id: "opp-102",
    company: "Atlas Auto Group",
    stage: "proposal_sent",
    stageLabel: "Proposal sent",
    owner: "Ibrahim",
    source: "Website",
    setupValue: 8500,
    monthlyValue: 3000,
    ageDays: 8,
    nextAction: "Review implementation questions",
    nextActionDue: "Today",
    evidence: "Complete",
    health: "Attention",
    contactPolicy: "Allowed",
    lastActivity: "Buyer opened proposal yesterday",
  },
  {
    id: "opp-103",
    company: "Northstar Dental",
    stage: "qualified",
    stageLabel: "Qualified",
    owner: "Shane",
    source: "Discord",
    setupValue: 6000,
    monthlyValue: 2000,
    ageDays: 6,
    nextAction: "Schedule workflow audit",
    nextActionDue: "Tomorrow",
    evidence: "Needs review",
    health: "Attention",
    contactPolicy: "Unknown",
    lastActivity: "Inbound requirements logged today",
  },
  {
    id: "opp-104",
    company: "BrightPath Legal",
    stage: "audit_demo",
    stageLabel: "Audit / demo",
    owner: "Javed",
    source: "Referral",
    setupValue: 5500,
    monthlyValue: 1800,
    ageDays: 4,
    nextAction: "Deliver audit findings",
    nextActionDue: "Friday",
    evidence: "Complete",
    health: "On track",
    contactPolicy: "Allowed",
    lastActivity: "Audit evidence added yesterday",
  },
  {
    id: "opp-105",
    company: "Harbor & Pine Realty",
    stage: "discovery_completed",
    stageLabel: "Discovery complete",
    owner: "Shane",
    source: "Website",
    setupValue: 4000,
    monthlyValue: 1200,
    ageDays: 7,
    nextAction: "Complete qualification evidence",
    nextActionDue: "1 day overdue",
    evidence: "Missing",
    health: "At risk",
    contactPolicy: "Allowed",
    lastActivity: "Discovery completed 7 days ago",
  },
  {
    id: "opp-106",
    company: "Driftwood Fitness",
    stage: "responded",
    stageLabel: "Responded",
    owner: "Javed",
    source: "Discord",
    setupValue: 3500,
    monthlyValue: 900,
    ageDays: 3,
    nextAction: "Classify inbound need",
    nextActionDue: "Today",
    evidence: "Needs review",
    health: "Attention",
    contactPolicy: "Unknown",
    lastActivity: "Inbound question logged today",
  },
  {
    id: "opp-107",
    company: "Ember Home Care",
    stage: "reverified",
    stageLabel: "Reverified",
    owner: "Shane",
    source: "Public research",
    setupValue: 5000,
    monthlyValue: 1600,
    ageDays: 2,
    nextAction: "Await founder contact approval",
    nextActionDue: "Not authorized",
    evidence: "Complete",
    health: "On track",
    contactPolicy: "Unknown",
    lastActivity: "Business route reverified today",
  },
  {
    id: "opp-108",
    company: "Keystone HVAC",
    stage: "won",
    stageLabel: "Verified won",
    owner: "Ibrahim",
    source: "Referral",
    setupValue: 7500,
    monthlyValue: 2800,
    ageDays: 1,
    nextAction: "Begin delivery intake",
    nextActionDue: "Tomorrow",
    evidence: "Complete",
    health: "On track",
    contactPolicy: "Allowed",
    lastActivity: "Payment verified yesterday",
  },
];

export const ACCOUNTS: Account[] = [
  {
    id: "acct-101",
    name: "Juniper Wellness",
    segment: "Multi-location wellness",
    relationship: "Referral",
    route: "Decision-participant email",
    routeStatus: "Verified",
    contact: "Morgan Lee · Operations Director",
    owner: "Ibrahim",
    openValue: 10300,
    evidence: "Proposal, decision date, and contact approval verified",
    lastActivity: "Proposal review · 4 days ago",
  },
  {
    id: "acct-102",
    name: "Atlas Auto Group",
    segment: "Automotive services",
    relationship: "Website inbound",
    route: "Business web form",
    routeStatus: "Consented inbound",
    contact: "Taylor Brooks · General Manager",
    owner: "Ibrahim",
    openValue: 11500,
    evidence: "Delivered proposal and scope version linked",
    lastActivity: "Proposal opened · yesterday",
  },
  {
    id: "acct-103",
    name: "Northstar Dental",
    segment: "Healthcare practice",
    relationship: "Discord inbound",
    route: "Manually linked Discord thread",
    routeStatus: "Identity under review",
    contact: "Public route · person not yet verified",
    owner: "Shane",
    openValue: 8000,
    evidence: "Minimal inbound summary and thread reference stored",
    lastActivity: "Requirements logged · today",
  },
  {
    id: "acct-104",
    name: "BrightPath Legal",
    segment: "Professional services",
    relationship: "Referral",
    route: "Decision-participant email",
    routeStatus: "Verified",
    contact: "Avery Singh · Managing Partner",
    owner: "Javed",
    openValue: 7300,
    evidence: "Audit inputs, owner, and next action verified",
    lastActivity: "Audit evidence added · yesterday",
  },
  {
    id: "acct-105",
    name: "Harbor & Pine Realty",
    segment: "Property services",
    relationship: "Website inbound",
    route: "Business web form",
    routeStatus: "Consented inbound",
    contact: "Casey Rivers · Brokerage Owner",
    owner: "Shane",
    openValue: 5200,
    evidence: "Qualification fields incomplete",
    lastActivity: "Discovery completed · 7 days ago",
  },
  {
    id: "acct-106",
    name: "Keystone HVAC",
    segment: "Home services",
    relationship: "Referral",
    route: "Signed commercial contact",
    routeStatus: "Verified customer",
    contact: "Jordan Miles · Owner",
    owner: "Ibrahim",
    openValue: 10300,
    evidence: "Signed scope, payment, billing, and delivery handoff verified",
    lastActivity: "Payment verified · yesterday",
  },
];

export const DELIVERY_ENGAGEMENTS: DeliveryEngagement[] = [
  {
    id: "delivery-201",
    account: "Keystone HVAC",
    stage: "Intake",
    progress: 18,
    owner: "Javed",
    blocker: "None",
    nextMilestone: "Baseline capture",
    firstValue: "Not yet measured",
    health: "On track",
  },
  {
    id: "delivery-202",
    account: "Signal Ridge Roofing",
    stage: "Implementation",
    progress: 56,
    owner: "Javed",
    blocker: "Awaiting CRM export",
    nextMilestone: "Automation QA",
    firstValue: "11 days",
    health: "Attention",
  },
  {
    id: "delivery-203",
    account: "Morrow Family Dental",
    stage: "Optimization",
    progress: 84,
    owner: "Shane",
    blocker: "None",
    nextMilestone: "30-day outcome review",
    firstValue: "8 days",
    health: "On track",
  },
];

export const GOVERNANCE_ALERTS: GovernanceAlert[] = [
  {
    id: "gov-301",
    severity: "Critical",
    title: "Suppression violations",
    detail: "No outbound activity conflicts with a suppression record.",
    count: 0,
    action: "Keep at zero",
  },
  {
    id: "gov-302",
    severity: "Attention",
    title: "Overdue next actions",
    detail: "Three active records have a next action past due.",
    count: 3,
    action: "Review Juniper first",
  },
  {
    id: "gov-303",
    severity: "Attention",
    title: "Evidence gaps",
    detail: "Two required evidence items are missing or need review.",
    count: 2,
    action: "Complete qualification evidence",
  },
  {
    id: "gov-304",
    severity: "Review",
    title: "Unclassified inbound",
    detail: "One relationship event still needs an outcome classification.",
    count: 1,
    action: "Classify Driftwood inbound",
  },
];

export const PIPELINE_STAGES = [
  { id: "reverified", label: "Reverified", count: 1 },
  { id: "responded", label: "Responded", count: 1 },
  { id: "discovery_completed", label: "Discovery", count: 1 },
  { id: "qualified", label: "Qualified", count: 1 },
  { id: "audit_demo", label: "Audit / demo", count: 1 },
  { id: "proposal_sent", label: "Proposal", count: 1 },
  { id: "decision_pending", label: "Decision", count: 1 },
  { id: "won", label: "Won", count: 1 },
] as const;

export function formatRate(
  numerator?: number,
  denominator?: number,
): RateDisplay {
  if (
    numerator === undefined ||
    denominator === undefined ||
    denominator <= 0
  ) {
    return {
      display: "UNKNOWN",
      quality: "unknown",
      detail: "No rate is calculable",
    };
  }

  const display = `${Math.round((numerator / denominator) * 100)}%`;
  const quality =
    denominator < 10 ? "directional-small-sample" : "measured";

  return {
    display,
    quality,
    detail: `${numerator} / ${denominator}`,
  };
}

export function filterOpportunities(
  opportunities: Opportunity[],
  owner = "All owners",
  source = "All sources",
  stage = "all",
): Opportunity[] {
  return opportunities.filter((opportunity) => {
    const ownerMatches =
      owner === "All owners" || opportunity.owner === owner;
    const sourceMatches =
      source === "All sources" || opportunity.source === source;
    const stageMatches = stage === "all" || opportunity.stage === stage;
    return ownerMatches && sourceMatches && stageMatches;
  });
}

export function getCopilotResponse(
  input: string,
  context: CopilotContext,
): ChatResponse {
  if (context.mode === "empty") {
    return {
      title: "There is no active CRM data to analyze",
      body:
        "Commercial baselines are unknown, lead activation is not authorized, and no rate is calculable. I can explain the measurement framework, but I cannot infer performance from an empty ledger.",
      citations: ["CRM empty state", "Metric quality contract"],
      nextAction: "Review the KPI definitions before activating any records.",
    };
  }

  const query = input.trim().toLowerCase();
  const visible = context.visibleOpportunities;
  const atRisk =
    visible.find((opportunity) => opportunity.health === "At risk") ??
    OPPORTUNITIES[0];

  if (
    query.includes("week") ||
    query.includes("summary") ||
    query.includes("changed")
  ) {
    return {
      title: "30-day commercial pulse",
      body:
        "The synthetic snapshot shows 7 qualified opportunities, 5 completed discoveries, 3 issued proposals, and 1 verified win. Evidence completeness is 92%, while three next actions are overdue. The pipeline is moving, but the sample remains directional.",
      citations: [
        "Qualified opportunities · 7",
        "Verified wins · 1 of 4",
        "Evidence completeness · 23 of 25",
      ],
      nextAction: "Review the oldest overdue decision before adding more volume.",
    };
  }

  if (
    query.includes("risk") ||
    query.includes("attention") ||
    query.includes("pipeline")
  ) {
    return {
      title: `${atRisk.company} needs attention first`,
      body: `${atRisk.company} has been in ${atRisk.stageLabel.toLowerCase()} for ${atRisk.ageDays} days and its next action is ${atRisk.nextActionDue.toLowerCase()}. The record has ${atRisk.evidence.toLowerCase()} evidence and ${atRisk.contactPolicy.toLowerCase()} contact policy.`,
      citations: [
        `${atRisk.company} · ${atRisk.stageLabel}`,
        `Stage age · ${atRisk.ageDays} days`,
        `Next action · ${atRisk.nextAction}`,
      ],
      nextAction: atRisk.nextAction,
    };
  }

  if (query.includes("overdue") || query.includes("next action")) {
    return {
      title: "Three next actions are overdue",
      body:
        "Juniper Wellness is the highest-priority item because its buyer decision step is two days overdue and the opportunity has the oldest stage age. Harbor & Pine also needs qualification evidence before it can advance.",
      citations: [
        "Stage age + overdue · 3",
        "Juniper Wellness · 18 days",
        "Harbor & Pine Realty · evidence missing",
      ],
      nextAction: "Confirm Juniper Wellness’s buyer decision step.",
    };
  }

  if (
    query.includes("explain") ||
    query.includes("kpi") ||
    query.includes("metric")
  ) {
    const metric =
      context.selectedMetric ??
      KPI_METRICS.find((item) =>
        query.includes(item.label.toLowerCase().split(" ")[0]),
      ) ??
      KPI_METRICS[6];

    return {
      title: metric.label,
      body: `${metric.definition} Its current synthetic value is ${metric.value} (${metric.context}). This measure supports the decision: ${metric.decision}`,
      citations: [
        `${metric.label} · ${metric.value}`,
        metric.source,
        metric.quality,
      ],
      nextAction:
        metric.id === "completeness"
          ? "Resolve the two outstanding evidence items."
          : "Review this metric with its source evidence.",
    };
  }

  if (query.includes("next") || query.includes("recommend")) {
    return {
      title: "One recommended next action",
      body:
        "Focus on the oldest decision-stage opportunity before increasing top-of-funnel activity. The evidence supports a targeted review, not a bulk outreach action.",
      citations: [
        "Juniper Wellness · Decision pending",
        "Stage age · 18 days",
        "Lead activation · approval-gated",
      ],
      nextAction: "Confirm Juniper Wellness’s buyer decision step.",
    };
  }

  return {
    title: "I can analyze this synthetic CRM snapshot",
    body:
      "Ask for a 30-day summary, pipeline risk, overdue actions, a KPI explanation, or one recommended next action. I will only use visible demo records and will not claim to update or message anyone.",
    citations: [`Active view · ${context.view}`, "Synthetic demo dataset"],
    nextAction: "Choose one of the suggested prompts.",
  };
}
