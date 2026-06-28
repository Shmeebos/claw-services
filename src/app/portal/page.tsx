import type { Metadata } from "next";
import Link from "next/link";
import { ClawBrandLogo } from "@/components/ClawBrandLogo";
import { Tooltip } from "@/components/Tooltip";
import { FlowCube } from "./FlowCube";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Claw Portal | Request, brief, delivery, approval.",
  description:
    "See how the Claw Services portal turns deliverable requests into scoped operator briefs, delivery rooms, approvals, credits, and archived artifacts.",
};

const portalCapabilities = [
  {
    eyebrow: "Request desk",
    title: "Every rough ask becomes a trackable request.",
    copy: "Clients can send the goal, links, files, constraints, budget signals, and timeline without writing a perfect brief first.",
  },
  {
    eyebrow: "Operator brief",
    title: "Claw turns intent into scope before work starts.",
    copy: "The portal captures success criteria, missing details, owner, package recommendation, and the next approval step.",
  },
  {
    eyebrow: "Delivery room",
    title: "Messages, files, drafts, and status live together.",
    copy: "Each deliverable has a visible queue state, revision path, artifact record, and final approval trail.",
  },
  {
    eyebrow: "Credits + history",
    title: "Credits and completed work stay transparent.",
    copy: "Packages can be used across websites, automations, content, research, and ongoing operator-desk work.",
  },
];

const flowSteps = [
  ["Submit", "Send the rough outcome, material, deadline, and any examples."],
  ["Scope", "Claw clarifies the brief, timeline, price or credit estimate, and success criteria."],
  ["Execute", "A human operator works the request and keeps the delivery room updated."],
  ["Approve", "Review the finished asset, request changes, approve, and keep the record."],
] as const;

const queueItems = [
  ["Premium site refresh", "In scope", "Landing page + intake form"],
  ["Lead routing setup", "Build", "Form → Airtable → email"],
  ["Artist rollout pack", "Review", "Copy, assets, release checklist"],
] as const;

export default function PortalPage() {
  return (
    <main className={styles.portalPage}>
      <div className={styles.shell}>
        <div className={styles.backgroundGrid} aria-hidden="true" />

        <header className={styles.topbar}>
          <Link className={styles.brand} href="/" aria-label="Claw Services home">
            <ClawBrandLogo />
          </Link>
          <nav className={styles.nav} aria-label="Portal page navigation">
            <Link href="/#deliverables">Services</Link>
            <a href="#flow">Flow</a>
            <a href="#delivery-room">Delivery room</a>
            <Link href="/#system">Start request</Link>
          </nav>
        </header>

        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Portal service layer</p>
            <h1>The client portal for turning requests into delivered work.</h1>
            <p className={styles.subhead}>
              The portal is how Claw organizes delivery: rough requests become scoped briefs, operator queues,
              files, approvals, credits, and a clean record of what was shipped.
            </p>
            <div className={styles.heroActions}>
              <Tooltip content="Open the request form.">
                <Link className={styles.primaryButton} href="/#system">Start a request</Link>
              </Tooltip>
              <a className={styles.secondaryButton} href="#delivery-room">See the portal view</a>
            </div>
          </div>

          <aside className={styles.conciergeCard} aria-label="Request-to-plan portal preview">
            <div className={styles.cardChrome}>
              <span />
              <span />
              <span />
              <strong>REQ-1048</strong>
            </div>
            <div className={styles.roughAsk}>
              <span>Rough ask</span>
              <p>“We need our leads to go into Airtable automatically and notify the right person.”</p>
            </div>
            <div className={styles.arrowLine} aria-hidden="true">↓</div>
            <div className={styles.scopedPlan}>
              <div>
                <span>Scoped operator plan</span>
                <strong>Lead intake automation</strong>
              </div>
              <ul>
                <li>Web form field audit</li>
                <li>Airtable base architecture</li>
                <li>Make.com routing scenario</li>
                <li>Notification + QA checklist</li>
              </ul>
            </div>
            <div className={styles.cardFooter}>
              <span>Owner assigned</span>
              <b>Ready for approval</b>
            </div>
          </aside>
        </section>

        <section className={styles.capabilities} aria-label="What the portal organizes">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>What it organizes</p>
            <h2>Not another chat inbox. A delivery operating layer.</h2>
          </div>
          <div className={styles.capabilityGrid}>
            {portalCapabilities.map((item) => (
              <article className={styles.capabilityCard} key={item.title}>
                <span>{item.eyebrow}</span>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <FlowCube steps={flowSteps} />

        <section className={styles.deliveryRoom} id="delivery-room">
          <div className={styles.sectionHead}>
            <p className={styles.kicker}>Deliverable requests</p>
            <h2>A clean room for the work, not scattered updates.</h2>
            <p>
              The portal keeps each request connected to its files, status, revision path, credit usage,
              and final approval so clients can always see what is happening next.
            </p>
          </div>

          <div className={styles.roomGrid}>
            <aside className={styles.queuePanel}>
              <div className={styles.panelTitle}>Active queue</div>
              {queueItems.map(([title, status, detail]) => (
                <div className={styles.queueItem} key={title}>
                  <i aria-hidden="true" />
                  <div>
                    <strong>{title}</strong>
                    <span>{detail}</span>
                  </div>
                  <b>{status}</b>
                </div>
              ))}
            </aside>

            <article className={styles.artifactPanel}>
              <div className={styles.panelTitle}>Current deliverable</div>
              <h3>Landing page sprint brief</h3>
              <p>
                Rebuild the services page with clearer offer hierarchy, mobile polish, and a request CTA
                connected to the intake system.
              </p>
              <div className={styles.artifactChecklist}>
                <span>Scope accepted</span>
                <span>Copy draft attached</span>
                <span>Review window open</span>
              </div>
            </article>

            <aside className={styles.approvalPanel}>
              <div className={styles.panelTitle}>Approval path</div>
              <div className={styles.creditMeter}><span /></div>
              <p><b>6 credits reserved</b> for this sprint after scope approval.</p>
              <Tooltip content="Open the request form for the first request.">
                <Link className={styles.primaryButton} href="/#system">Open first request</Link>
              </Tooltip>
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}
