import {
  SkeletonBlock,
  SkeletonButton,
  SkeletonLine,
  SkeletonRow,
  SkeletonText,
} from "@/components/Skeleton";
import styles from "./page.module.css";

const navItems = Array.from({ length: 4 }, (_, index) => index);
const capabilityCards = Array.from({ length: 4 }, (_, index) => index);
const queueRows = Array.from({ length: 3 }, (_, index) => index);

export default function PortalLoading() {
  return (
    <main className={styles.portalPage} aria-busy="true" aria-labelledby="portal-loading-title">
      <h1 id="portal-loading-title" className="sr-only">Loading Claw portal page</h1>
      <div className={styles.shell}>
        <div className={styles.backgroundGrid} aria-hidden="true" />

        <header className={styles.topbar} aria-hidden="true">
          <div className={styles.brand}>
            <SkeletonBlock className="skeleton-logo" />
            <SkeletonBlock className="skeleton-brand-name" />
          </div>
          <div className={`${styles.nav} skeleton-nav`}>
            {navItems.map((item) => <SkeletonBlock className="skeleton-nav-item" key={item} />)}
          </div>
        </header>

        <section className={`${styles.hero} skeleton-loading-hero`} aria-hidden="true">
          <div className="skeleton-stack skeleton-hero-copy">
            <SkeletonLine variant="eyebrow" />
            <SkeletonBlock className="skeleton-hero-title portal" strong />
            <SkeletonBlock className="skeleton-subhead" />
            <SkeletonBlock className="skeleton-subhead short" />
            <div className={styles.heroActions}>
              <SkeletonButton />
              <SkeletonButton secondary />
            </div>
          </div>

          <aside className={`${styles.conciergeCard} skeleton-card`}>
            <div className={styles.cardChrome}>
              <SkeletonBlock className="skeleton-dot" />
              <SkeletonBlock className="skeleton-dot" />
              <SkeletonBlock className="skeleton-dot" />
              <SkeletonBlock className="skeleton-nav-item" />
            </div>
            <div className={styles.roughAsk}>
              <SkeletonText lines={3} widths={["48%", "86%", "62%"]} titleFirstLine />
            </div>
            <div className={styles.scopedPlan}>
              <SkeletonText lines={5} widths={["42%", "74%", "100%", "92%", "58%"]} titleFirstLine />
            </div>
            <div className={styles.cardFooter}>
              <SkeletonBlock className="skeleton-pill" />
              <SkeletonBlock className="skeleton-pill" />
            </div>
          </aside>
        </section>

        <section className={styles.capabilities} aria-hidden="true">
          <div className={styles.sectionHead}>
            <SkeletonLine variant="eyebrow" />
            <SkeletonLine variant="heading" />
          </div>
          <div className={styles.capabilityGrid}>
            {capabilityCards.map((item) => (
              <article className={`${styles.capabilityCard} skeleton-card`} key={item}>
                <SkeletonText lines={4} widths={["44%", "86%", "100%", "72%"]} titleFirstLine />
              </article>
            ))}
          </div>
        </section>

        <section className={styles.deliveryRoom} aria-hidden="true">
          <div className={styles.roomGrid}>
            <aside className={`${styles.queuePanel} skeleton-card`}>
              <SkeletonLine variant="title" />
              {queueRows.map((item) => <SkeletonRow className={styles.queueItem} key={item} lines={2} />)}
            </aside>
            <article className={`${styles.artifactPanel} skeleton-card skeleton-dark`}>
              <SkeletonLine variant="eyebrow" />
              <SkeletonLine variant="heading" />
              <SkeletonText lines={2} widths={["100%", "62%"]} />
            </article>
            <aside className={`${styles.approvalPanel} skeleton-card`}>
              <SkeletonLine variant="title" />
              <SkeletonBlock className="skeleton-meter" />
              <SkeletonText lines={2} widths={["100%", "68%"]} />
              <SkeletonButton />
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}