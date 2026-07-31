"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ACCOUNTS,
  DELIVERY_ENGAGEMENTS,
  EMPTY_STATE_MESSAGES,
  GOVERNANCE_ALERTS,
  KPI_METRICS,
  OPPORTUNITIES,
  PIPELINE_STAGES,
  filterOpportunities,
  formatRate,
  getCopilotResponse,
  type Account,
  type ChatResponse,
  type DataMode,
  type KpiMetric,
  type Opportunity,
  type ViewId,
} from "./crm-model";

const NAV_ITEMS: Array<{
  id: ViewId;
  label: string;
  short: string;
}> = [
  { id: "overview", label: "Overview", short: "OV" },
  { id: "pipeline", label: "Pipeline", short: "PL" },
  { id: "accounts", label: "Accounts", short: "AC" },
  { id: "delivery", label: "Delivery", short: "DL" },
  { id: "governance", label: "Governance", short: "GV" },
];

const COPILOT_PROMPTS = [
  "Summarize this period",
  "What needs attention?",
  "Show overdue actions",
  "Explain this KPI",
];

const INITIAL_RESPONSE: ChatResponse = {
  title: "Your KPI copilot is ready",
  body:
    "I can summarize this synthetic snapshot, explain the measurement logic, and recommend one next action. I cannot update records or contact anyone.",
  citations: ["Synthetic demo dataset", "CRM measurement contract"],
  nextAction: "Ask what needs attention.",
};

type ChatEntry =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; response: ChatResponse };

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function qualityLabel(metric: KpiMetric) {
  if (metric.numerator !== undefined || metric.denominator !== undefined) {
    const rate = formatRate(metric.numerator, metric.denominator);
    return `${rate.detail} · ${rate.quality}`;
  }
  return `${metric.sampleSize ?? "—"} records · ${metric.quality}`;
}

function EmptyState({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`empty-state ${compact ? "is-compact" : ""}`}>
      <div className="empty-state-mark" aria-hidden="true">
        —
      </div>
      <div>
        <p className="eyebrow">Authoritative current state</p>
        <h2>No active CRM records</h2>
        <p>
          This view reflects the real ledger boundary. No synthetic value is
          being treated as company performance.
        </p>
        <div className="empty-state-grid">
          {EMPTY_STATE_MESSAGES.map((message) => (
            <span key={message}>{message}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function MetricCard({
  metric,
  mode,
  onSelect,
}: {
  metric: KpiMetric;
  mode: DataMode;
  onSelect: (metric: KpiMetric) => void;
}) {
  const isEmpty = mode === "empty";
  return (
    <button
      type="button"
      className={`metric-card tone-${isEmpty ? "neutral" : metric.tone}`}
      onClick={() => onSelect(metric)}
    >
      <span className="metric-card-top">
        <span>{metric.label}</span>
        <span aria-hidden="true">↗</span>
      </span>
      <strong>{isEmpty ? "UNKNOWN" : metric.value}</strong>
      <span className="metric-context">
        {isEmpty ? "No active CRM records" : metric.context}
      </span>
      <span className="metric-divider" />
      <span className="metric-change">
        {isEmpty ? "No rate is calculable" : metric.change}
      </span>
      <span className="metric-target">
        {metric.id === "completeness"
          ? "Target · 100% control standard"
          : "Target · UNKNOWN / FOUNDER-SET"}
      </span>
    </button>
  );
}

function OverviewView({
  mode,
  onSelectMetric,
  onSelectOpportunity,
}: {
  mode: DataMode;
  onSelectMetric: (metric: KpiMetric) => void;
  onSelectOpportunity: (opportunity: Opportunity) => void;
}) {
  return (
    <div className="view-stack">
      {mode === "empty" && <EmptyState compact />}

      <section aria-labelledby="scorecard-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Executive scorecard</p>
            <h2 id="scorecard-title">Eight signals. No vanity math.</h2>
          </div>
          <span className="dataset-chip">
            {mode === "demo" ? "Synthetic demo" : "Empty ledger"}
          </span>
        </div>
        <div className="metric-grid">
          {KPI_METRICS.map((metric) => (
            <MetricCard
              key={metric.id}
              metric={metric}
              mode={mode}
              onSelect={onSelectMetric}
            />
          ))}
        </div>
      </section>

      {mode === "demo" && (
        <>
          <section className="overview-split">
            <div className="panel pipeline-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Current pipeline</p>
                  <h3>Evidence-gated movement</h3>
                </div>
                <span className="panel-meta">8 active records</span>
              </div>
              <div className="pipeline-track" aria-label="Pipeline stages">
                {PIPELINE_STAGES.map((stage, index) => (
                  <div
                    className="pipeline-segment"
                    style={
                      {
                        "--stage-alpha": 0.03 + index * 0.012,
                        "--stage-dark-alpha": 0.035 + index * 0.008,
                      } as CSSProperties
                    }
                    key={stage.id}
                  >
                    <span>{stage.label}</span>
                    <strong>{stage.count}</strong>
                  </div>
                ))}
              </div>
              <div className="pipeline-notes">
                <span>
                  <i className="status-dot coral" /> 3 overdue next actions
                </span>
                <span>
                  <i className="status-dot sage" /> 0 suppression violations
                </span>
                <span>
                  <i className="status-dot sand" /> 2 evidence items to review
                </span>
              </div>
            </div>

            <div className="panel quality-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Trust layer</p>
                  <h3>Can we trust the scorecard?</h3>
                </div>
                <strong className="quality-score">92%</strong>
              </div>
              <div className="progress-track" aria-label="92% complete">
                <span style={{ width: "92%" }} />
              </div>
              <dl className="quality-list">
                <div>
                  <dt>Owner completeness</dt>
                  <dd>100%</dd>
                </div>
                <div>
                  <dt>Next-step completeness</dt>
                  <dd>100%</dd>
                </div>
                <div>
                  <dt>Stage evidence</dt>
                  <dd>92%</dd>
                </div>
              </dl>
            </div>
          </section>

          <section className="panel focus-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Today’s focus</p>
                <h3>Three records that deserve attention</h3>
              </div>
              <span className="panel-meta">Ranked by evidence + age</span>
            </div>
            <div className="focus-list">
              {OPPORTUNITIES.filter(
                (opportunity) => opportunity.health !== "On track",
              )
                .slice(0, 3)
                .map((opportunity, index) => (
                  <button
                    type="button"
                    key={opportunity.id}
                    className="focus-row"
                    onClick={() => onSelectOpportunity(opportunity)}
                  >
                    <span className="focus-rank">0{index + 1}</span>
                    <span className="focus-company">
                      <strong>{opportunity.company}</strong>
                      <small>{opportunity.stageLabel}</small>
                    </span>
                    <span>
                      <small>Stage age</small>
                      <strong>{opportunity.ageDays} days</strong>
                    </span>
                    <span>
                      <small>Next action</small>
                      <strong>{opportunity.nextActionDue}</strong>
                    </span>
                    <span
                      className={`health-label ${opportunity.health
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {opportunity.health}
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PipelineView({
  mode,
  owner,
  source,
  stage,
  onOwnerChange,
  onSourceChange,
  onStageChange,
  opportunities,
  onSelectOpportunity,
}: {
  mode: DataMode;
  owner: string;
  source: string;
  stage: string;
  onOwnerChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onStageChange: (value: string) => void;
  opportunities: Opportunity[];
  onSelectOpportunity: (opportunity: Opportunity) => void;
}) {
  if (mode === "empty") return <EmptyState />;

  return (
    <div className="view-stack">
      <section className="panel filter-panel">
        <div>
          <p className="eyebrow">Pipeline controls</p>
          <h2>Every stage needs evidence</h2>
        </div>
        <label>
          <span>Owner</span>
          <select
            value={owner}
            onChange={(event) => onOwnerChange(event.target.value)}
          >
            <option>All owners</option>
            <option>Ibrahim</option>
            <option>Shane</option>
            <option>Javed</option>
          </select>
        </label>
        <label>
          <span>Source</span>
          <select
            value={source}
            onChange={(event) => onSourceChange(event.target.value)}
          >
            <option>All sources</option>
            <option>Referral</option>
            <option>Website</option>
            <option>Discord</option>
            <option>Public research</option>
          </select>
        </label>
      </section>

      <div className="stage-filter" aria-label="Filter by pipeline stage">
        <button
          type="button"
          className={stage === "all" ? "is-active" : ""}
          onClick={() => onStageChange("all")}
          aria-pressed={stage === "all"}
        >
          All <strong>8</strong>
        </button>
        {PIPELINE_STAGES.map((item) => (
          <button
            type="button"
            key={item.id}
            className={stage === item.id ? "is-active" : ""}
            onClick={() => onStageChange(item.id)}
            aria-pressed={stage === item.id}
          >
            {item.label} <strong>{item.count}</strong>
          </button>
        ))}
      </div>

      <section className="panel records-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Opportunity ledger</p>
            <h3>{opportunities.length} visible records</h3>
          </div>
          <span className="panel-meta">Demo changes reset on refresh</span>
        </div>

        <div className="desktop-table">
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th>Stage</th>
                <th>Owner</th>
                <th>Value</th>
                <th>Age</th>
                <th>Next action</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((opportunity) => (
                <tr key={opportunity.id}>
                  <td>
                    <button
                      type="button"
                      className="record-link"
                      onClick={() => onSelectOpportunity(opportunity)}
                    >
                      {opportunity.company}
                    </button>
                    <small>{opportunity.source}</small>
                  </td>
                  <td>
                    <span className="stage-pill">
                      {opportunity.stageLabel}
                    </span>
                  </td>
                  <td>{opportunity.owner}</td>
                  <td>
                    <strong>{money(opportunity.setupValue)}</strong>
                    <small>{money(opportunity.monthlyValue)} MRR</small>
                  </td>
                  <td>{opportunity.ageDays}d</td>
                  <td>
                    {opportunity.nextAction}
                    <small
                      className={
                        opportunity.nextActionDue.includes("overdue")
                          ? "text-danger"
                          : ""
                      }
                    >
                      {opportunity.nextActionDue}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`evidence-status ${opportunity.evidence
                        .toLowerCase()
                        .replace(" ", "-")}`}
                    >
                      {opportunity.evidence}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-records">
          {opportunities.map((opportunity) => (
            <button
              type="button"
              className="mobile-record"
              key={opportunity.id}
              onClick={() => onSelectOpportunity(opportunity)}
            >
              <span>
                <strong>{opportunity.company}</strong>
                <small>{opportunity.stageLabel}</small>
              </span>
              <span>
                <strong>{money(opportunity.setupValue)}</strong>
                <small>{opportunity.ageDays} days in stage</small>
              </span>
              <span className="mobile-record-action">
                {opportunity.nextAction}
              </span>
            </button>
          ))}
        </div>

        {opportunities.length === 0 && (
          <div className="no-results">
            <strong>No records match these filters.</strong>
            <span>Clear a filter to return to the synthetic ledger.</span>
          </div>
        )}
      </section>
    </div>
  );
}

function AccountsView({
  mode,
  onSelectAccount,
}: {
  mode: DataMode;
  onSelectAccount: (account: Account) => void;
}) {
  if (mode === "empty") return <EmptyState />;

  return (
    <div className="view-stack">
      <section className="section-heading">
        <div>
          <p className="eyebrow">Relationship ledger</p>
          <h2>Accounts with provenance attached</h2>
        </div>
        <span className="dataset-chip">6 synthetic accounts</span>
      </section>

      <section className="account-grid">
        {ACCOUNTS.map((account) => (
          <button
            type="button"
            className="account-card"
            key={account.id}
            onClick={() => onSelectAccount(account)}
          >
            <span className="account-card-top">
              <span className="account-monogram" aria-hidden="true">
                {account.name
                  .split(" ")
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")}
              </span>
              <span className="route-status">{account.routeStatus}</span>
            </span>
            <span>
              <strong>{account.name}</strong>
              <small>{account.segment}</small>
            </span>
            <dl>
              <div>
                <dt>Relationship</dt>
                <dd>{account.relationship}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{account.owner}</dd>
              </div>
              <div>
                <dt>Commercial context</dt>
                <dd>{money(account.openValue)}</dd>
              </div>
            </dl>
            <span className="account-card-footer">
              {account.lastActivity}
              <span aria-hidden="true">↗</span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}

function DeliveryView({ mode }: { mode: DataMode }) {
  if (mode === "empty") return <EmptyState />;

  const deliveryMetrics = [
    { label: "Onboarding completion", value: "2 / 3", note: "67% · directional" },
    { label: "Median first value", value: "9.5d", note: "2 evidenced outcomes" },
    { label: "Blocked engagements", value: "1", note: "CRM export dependency" },
    { label: "Verified outcomes", value: "2", note: "customer-approved evidence" },
  ];

  return (
    <div className="view-stack">
      <section className="separation-banner">
        <div>
          <p className="eyebrow">Separate operating system</p>
          <h2>Delivery never rewrites the sales story.</h2>
        </div>
        <p>
          A verified win creates a delivery engagement. Delivery blockers,
          quality, and outcomes stay here—not in sales-stage counts.
        </p>
      </section>

      <section className="delivery-metrics">
        {deliveryMetrics.map((metric) => (
          <div className="delivery-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </div>
        ))}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Active delivery</p>
            <h3>Engagement health</h3>
          </div>
          <span className="panel-meta">Synthetic delivery fixture</span>
        </div>
        <div className="delivery-list">
          {DELIVERY_ENGAGEMENTS.map((engagement) => (
            <article className="delivery-row" key={engagement.id}>
              <div className="delivery-main">
                <span
                  className={`health-label ${engagement.health
                    .toLowerCase()
                    .replace(" ", "-")}`}
                >
                  {engagement.health}
                </span>
                <h4>{engagement.account}</h4>
                <p>
                  {engagement.stage} · owned by {engagement.owner}
                </p>
              </div>
              <div className="delivery-progress">
                <span>
                  <strong>{engagement.progress}%</strong>
                  <small>{engagement.nextMilestone}</small>
                </span>
                <div className="progress-track">
                  <span style={{ width: `${engagement.progress}%` }} />
                </div>
              </div>
              <dl>
                <div>
                  <dt>Blocker</dt>
                  <dd>{engagement.blocker}</dd>
                </div>
                <div>
                  <dt>First value</dt>
                  <dd>{engagement.firstValue}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function GovernanceView({ mode }: { mode: DataMode }) {
  if (mode === "empty") return <EmptyState />;

  return (
    <div className="view-stack">
      <section className="governance-hero">
        <div>
          <p className="eyebrow">Governance score</p>
          <strong>92</strong>
          <span>/100</span>
        </div>
        <div>
          <h2>Useful data needs boundaries.</h2>
          <p>
            This score reflects synthetic evidence quality—not commercial
            performance. Suppression takes precedence, public data is not
            consent, and every stage movement needs proof.
          </p>
        </div>
      </section>

      <section className="governance-grid">
        {GOVERNANCE_ALERTS.map((alert) => (
          <article className="governance-card" key={alert.id}>
            <span className={`severity severity-${alert.severity.toLowerCase()}`}>
              {alert.severity}
            </span>
            <div className="governance-count">{alert.count}</div>
            <h3>{alert.title}</h3>
            <p>{alert.detail}</p>
            <span className="governance-action">{alert.action}</span>
          </article>
        ))}
      </section>

      <section className="panel policy-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Non-negotiable controls</p>
            <h3>What the prototype refuses to imply</h3>
          </div>
        </div>
        <div className="policy-grid">
          <div>
            <span>01</span>
            <strong>Public does not mean permitted</strong>
            <p>Observable contact details never become implied consent.</p>
          </div>
          <div>
            <span>02</span>
            <strong>A draft is not delivered work</strong>
            <p>Prepared messages and proposals do not count as outcomes.</p>
          </div>
          <div>
            <span>03</span>
            <strong>Unknown is not zero</strong>
            <p>Missing denominators render UNKNOWN, never a false 0%.</p>
          </div>
          <div>
            <span>04</span>
            <strong>Sales and delivery stay separate</strong>
            <p>Delivery progress cannot inflate the commercial pipeline.</p>
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailDrawer({
  metric,
  opportunity,
  account,
  onClose,
  onAskCopilot,
}: {
  metric: KpiMetric | null;
  opportunity: Opportunity | null;
  account: Account | null;
  onClose: () => void;
  onAskCopilot: (prompt: string) => void;
}) {
  const isOpen = Boolean(metric || opportunity || account);
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".crm-app > .sidebar, .crm-app > .main-shell, .crm-app > .copilot-shell",
      ),
    );
    const previouslyInert = backgroundElements.map((element) =>
      element.hasAttribute("inert"),
    );
    backgroundElements.forEach((element) => element.setAttribute("inert", ""));

    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      backgroundElements.forEach((element, index) => {
        if (!previouslyInert[index]) element.removeAttribute("inert");
      });
      previousFocusRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="drawer-scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={drawerRef}
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
      >
        <div className="drawer-top">
          <span className="dataset-chip">Synthetic demo</span>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>

        {metric && (
          <>
            <p className="eyebrow">KPI definition</p>
            <h2 id="detail-drawer-title">{metric.label}</h2>
            <div className="drawer-value">
              <strong>{metric.value}</strong>
              <span>{metric.context}</span>
            </div>
            <dl className="drawer-facts">
              <div>
                <dt>Definition</dt>
                <dd>{metric.definition}</dd>
              </div>
              <div>
                <dt>Decision supported</dt>
                <dd>{metric.decision}</dd>
              </div>
              <div>
                <dt>Target</dt>
                <dd>{metric.target}</dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{metric.owner}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{metric.source}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{qualityLabel(metric)}</dd>
              </div>
            </dl>
            <button
              type="button"
              className="drawer-action"
              onClick={() => onAskCopilot(`Explain this KPI: ${metric.label}`)}
            >
              Ask Demo Copilot to explain
            </button>
          </>
        )}

        {opportunity && (
          <>
            <p className="eyebrow">Opportunity record</p>
            <h2 id="detail-drawer-title">{opportunity.company}</h2>
            <div className="drawer-value">
              <strong>{money(opportunity.setupValue)}</strong>
              <span>{money(opportunity.monthlyValue)} recurring</span>
            </div>
            <dl className="drawer-facts">
              <div>
                <dt>Stage</dt>
                <dd>{opportunity.stageLabel}</dd>
              </div>
              <div>
                <dt>Owner / source</dt>
                <dd>
                  {opportunity.owner} · {opportunity.source}
                </dd>
              </div>
              <div>
                <dt>Current state</dt>
                <dd>
                  {opportunity.ageDays} days in stage · {opportunity.health}
                </dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>
                  {opportunity.nextAction} · {opportunity.nextActionDue}
                </dd>
              </div>
              <div>
                <dt>Evidence</dt>
                <dd>{opportunity.evidence}</dd>
              </div>
              <div>
                <dt>Contact policy</dt>
                <dd>{opportunity.contactPolicy}</dd>
              </div>
              <div>
                <dt>Last verified activity</dt>
                <dd>{opportunity.lastActivity}</dd>
              </div>
            </dl>
            <div className="write-disabled">
              <strong>Writes disabled</strong>
              <span>
                This prototype cannot change stages, records, or external
                messages.
              </span>
            </div>
            <button
              type="button"
              className="drawer-action"
              onClick={() =>
                onAskCopilot(`What needs attention for ${opportunity.company}?`)
              }
            >
              Ask Demo Copilot for one action
            </button>
          </>
        )}

        {account && (
          <>
            <p className="eyebrow">Account record</p>
            <h2 id="detail-drawer-title">{account.name}</h2>
            <div className="drawer-value">
              <strong>{money(account.openValue)}</strong>
              <span>commercial context · synthetic</span>
            </div>
            <dl className="drawer-facts">
              <div>
                <dt>Segment</dt>
                <dd>{account.segment}</dd>
              </div>
              <div>
                <dt>Relationship origin</dt>
                <dd>{account.relationship}</dd>
              </div>
              <div>
                <dt>Contact / public route</dt>
                <dd>{account.contact}</dd>
              </div>
              <div>
                <dt>Route evidence</dt>
                <dd>
                  {account.route} · {account.routeStatus}
                </dd>
              </div>
              <div>
                <dt>Owner</dt>
                <dd>{account.owner}</dd>
              </div>
              <div>
                <dt>Evidence summary</dt>
                <dd>{account.evidence}</dd>
              </div>
              <div>
                <dt>Last activity</dt>
                <dd>{account.lastActivity}</dd>
              </div>
            </dl>
          </>
        )}
      </aside>
    </>
  );
}

function Copilot({
  mode,
  view,
  owner,
  source,
  selectedMetric,
  visibleOpportunities,
  open,
  onOpenChange,
  externalPrompt,
  onExternalPromptHandled,
}: {
  mode: DataMode;
  view: ViewId;
  owner: string;
  source: string;
  selectedMetric: KpiMetric | null;
  visibleOpportunities: Opportunity[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  externalPrompt: string;
  onExternalPromptHandled: () => void;
}) {
  const [input, setInput] = useState("");
  const [isMobileOverlay, setIsMobileOverlay] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([
    { id: 1, role: "assistant", response: INITIAL_RESPONSE },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobileOverlay(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!open || !isMobileOverlay) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const backgroundElements = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".crm-app > .sidebar, .crm-app > .main-shell",
      ),
    );
    const previouslyInert = backgroundElements.map((element) =>
      element.hasAttribute("inert"),
    );
    backgroundElements.forEach((element) => element.setAttribute("inert", ""));
    inputRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }

      if (event.key !== "Tab" || !shellRef.current) return;
      const focusable = Array.from(
        shellRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      backgroundElements.forEach((element, index) => {
        if (!previouslyInert[index]) element.removeAttribute("inert");
      });
      previousFocusRef.current?.focus();
    };
  }, [isMobileOverlay, onOpenChange, open]);

  const submitPrompt = (prompt: string) => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    const response = getCopilotResponse(trimmed, {
      mode,
      view,
      owner,
      source,
      selectedMetric: selectedMetric ?? undefined,
      visibleOpportunities,
    });
    const stamp = Date.now();
    setEntries((current) => [
      ...current.slice(-4),
      { id: stamp, role: "user", text: trimmed },
      { id: stamp + 1, role: "assistant", response },
    ]);
    setInput("");
    onOpenChange(true);
  };

  useEffect(() => {
    if (!externalPrompt) return;
    submitPrompt(externalPrompt);
    onExternalPromptHandled();
    // submitPrompt intentionally uses the latest active CRM context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalPrompt]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [entries]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submitPrompt(input);
  };

  return (
    <>
      <div
        className={`copilot-backdrop ${open ? "is-visible" : ""}`}
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      <aside
        ref={shellRef}
        id="demo-copilot"
        className={`copilot-shell ${open ? "is-open" : ""}`}
        role={isMobileOverlay && open ? "dialog" : "complementary"}
        aria-modal={isMobileOverlay && open ? "true" : undefined}
        aria-label="Demo Copilot"
      >
        <div className="copilot-header">
          <div className="copilot-title">
            <span className="copilot-mark" aria-hidden="true">
              AI
            </span>
            <span>
              <strong>Demo Copilot</strong>
              <small>Contextual · no live model</small>
            </span>
          </div>
          <button
            type="button"
            className="copilot-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close Demo Copilot"
          >
            ×
          </button>
        </div>

        <div className="copilot-boundary">
          <span className={mode === "demo" ? "pulse-dot" : "pulse-dot muted"} />
          {mode === "demo"
            ? `Reading ${view} · synthetic only`
            : "Reading empty ledger · no calculations"}
        </div>

        <div className="chat-log" aria-live="polite">
          {entries.map((entry) =>
            entry.role === "user" ? (
              <div className="chat-user" key={entry.id}>
                {entry.text}
              </div>
            ) : (
              <article className="chat-response" key={entry.id}>
                <span className="chat-label">Analysis</span>
                <h3>{entry.response.title}</h3>
                <p>{entry.response.body}</p>
                <div className="chat-citations">
                  {entry.response.citations.map((citation) => (
                    <span key={citation}>↳ {citation}</span>
                  ))}
                </div>
                <div className="next-action">
                  <small>One next action</small>
                  <strong>{entry.response.nextAction}</strong>
                </div>
              </article>
            ),
          )}
          <div ref={endRef} />
        </div>

        <div className="prompt-chips">
          {COPILOT_PROMPTS.map((prompt) => (
            <button
              type="button"
              key={prompt}
              onClick={() => submitPrompt(prompt)}
            >
              {prompt}
            </button>
          ))}
        </div>

        <form className="chat-form" onSubmit={onSubmit}>
          <label htmlFor="copilot-input">Ask about the visible CRM data</label>
          <div>
            <input
              ref={inputRef}
              id="copilot-input"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask for one useful next action…"
            />
            <button type="submit" aria-label="Send prompt">
              ↑
            </button>
          </div>
          <small>No writes, messages, or external actions.</small>
        </form>
      </aside>
    </>
  );
}

export default function Home() {
  const [view, setView] = useState<ViewId>("overview");
  const [mode, setMode] = useState<DataMode>("demo");
  const [owner, setOwner] = useState("All owners");
  const [source, setSource] = useState("All sources");
  const [stage, setStage] = useState("all");
  const [selectedMetric, setSelectedMetric] = useState<KpiMetric | null>(null);
  const [selectedOpportunity, setSelectedOpportunity] =
    useState<Opportunity | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [externalPrompt, setExternalPrompt] = useState("");

  const visibleOpportunities = useMemo(
    () => filterOpportunities(OPPORTUNITIES, owner, source, stage),
    [owner, source, stage],
  );

  const activeViewLabel =
    NAV_ITEMS.find((item) => item.id === view)?.label ?? "Overview";

  const closeDrawer = useCallback(() => {
    setSelectedMetric(null);
    setSelectedOpportunity(null);
    setSelectedAccount(null);
  }, []);

  const selectMetric = (metric: KpiMetric) => {
    setSelectedMetric(metric);
    setSelectedOpportunity(null);
    setSelectedAccount(null);
  };

  const selectOpportunity = (opportunity: Opportunity) => {
    setSelectedOpportunity(opportunity);
    setSelectedMetric(null);
    setSelectedAccount(null);
  };

  const selectAccount = (account: Account) => {
    setSelectedAccount(account);
    setSelectedMetric(null);
    setSelectedOpportunity(null);
  };

  const askCopilot = (prompt: string) => {
    setExternalPrompt(prompt);
    setCopilotOpen(true);
    closeDrawer();
  };

  const switchMode = (nextMode: DataMode) => {
    setMode(nextMode);
    closeDrawer();
  };

  return (
    <div className="crm-app">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span>
            <strong>CLAW</strong>
            <small>Services</small>
          </span>
        </div>

        <nav aria-label="CRM views">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={view === item.id ? "is-active" : ""}
              onClick={() => setView(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <span aria-hidden="true">{item.short}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className="status-dot sage" />
          <span>
            <strong>Prototype safe</strong>
            <small>No external writes</small>
          </span>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeViewLabel}</p>
            <h1>CRM Control Room</h1>
          </div>

          <div className="topbar-actions">
            <span className="window-chip">Last 30 days</span>
            <div className="mode-toggle" aria-label="Select data mode">
              <button
                type="button"
                className={mode === "demo" ? "is-active" : ""}
                onClick={() => switchMode("demo")}
                aria-pressed={mode === "demo"}
              >
                Demo
              </button>
              <button
                type="button"
                className={mode === "empty" ? "is-active" : ""}
                onClick={() => switchMode("empty")}
                aria-pressed={mode === "empty"}
              >
                Empty
              </button>
            </div>
            <span className="demo-badge">
              {mode === "demo" ? "Synthetic data" : "Live truth"}
            </span>
          </div>
        </header>

        <div className="content-shell">
          <div className="view-intro">
            <div>
              <p>
                {view === "overview" &&
                  "Revenue, pipeline, and evidence quality in one decision surface."}
                {view === "pipeline" &&
                  "Inspect commercial movement without confusing activity for progress."}
                {view === "accounts" &&
                  "Keep identity, relationship origin, and evidence attached to every account."}
                {view === "delivery" &&
                  "Track customer value separately from the sales ledger."}
                {view === "governance" &&
                  "See the controls that keep incomplete data from becoming business truth."}
              </p>
            </div>
            <button
              type="button"
              className="mobile-copilot-button"
              onClick={() => setCopilotOpen(true)}
              aria-controls="demo-copilot"
              aria-expanded={copilotOpen}
            >
              <span aria-hidden="true">AI</span>
              Ask Demo Copilot
            </button>
          </div>

          {view === "overview" && (
            <OverviewView
              mode={mode}
              onSelectMetric={selectMetric}
              onSelectOpportunity={selectOpportunity}
            />
          )}
          {view === "pipeline" && (
            <PipelineView
              mode={mode}
              owner={owner}
              source={source}
              stage={stage}
              onOwnerChange={setOwner}
              onSourceChange={setSource}
              onStageChange={setStage}
              opportunities={visibleOpportunities}
              onSelectOpportunity={selectOpportunity}
            />
          )}
          {view === "accounts" && (
            <AccountsView mode={mode} onSelectAccount={selectAccount} />
          )}
          {view === "delivery" && <DeliveryView mode={mode} />}
          {view === "governance" && <GovernanceView mode={mode} />}
        </div>
      </main>

      <Copilot
        mode={mode}
        view={view}
        owner={owner}
        source={source}
        selectedMetric={selectedMetric}
        visibleOpportunities={visibleOpportunities}
        open={copilotOpen}
        onOpenChange={setCopilotOpen}
        externalPrompt={externalPrompt}
        onExternalPromptHandled={() => setExternalPrompt("")}
      />

      <DetailDrawer
        metric={selectedMetric}
        opportunity={selectedOpportunity}
        account={selectedAccount}
        onClose={closeDrawer}
        onAskCopilot={askCopilot}
      />
    </div>
  );
}
