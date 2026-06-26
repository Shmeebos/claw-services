import { ClawHandMark } from "@/components/ClawBrandLogo";
import {
  SkeletonBlock,
  SkeletonButton,
  SkeletonLine,
  SkeletonMedia,
  SkeletonText,
} from "@/components/Skeleton";

const navItems = Array.from({ length: 5 }, (_, index) => index);
const heroPills = Array.from({ length: 5 }, (_, index) => index);
const briefRows = Array.from({ length: 4 }, (_, index) => index);
const pipelineRows = Array.from({ length: 4 }, (_, index) => index);
const serviceRows = Array.from({ length: 3 }, (_, index) => index);

export default function Loading() {
  return (
    <main className="page-shell skeleton-page" aria-busy="true" aria-labelledby="loading-title">
      <h1 id="loading-title" className="sr-only">Loading Claw Services landing page</h1>
      <div className="brand-loader" aria-label="Loading Claw Services" role="status">
        <div className="loader-stage">
          <div className="loader-logo-wrap" aria-hidden="true">
            <ClawHandMark animated className="loader-logo-mark" />
            <span className="loader-ring loader-ring-one" />
            <span className="loader-ring loader-ring-two" />
          </div>
          <div className="loader-copy">
            <b>Ringing in Claw Services</b>
            <p>Preparing the operator desk, service cards, and request flow.</p>
          </div>
          <div className="loader-skeleton" aria-hidden="true"><span /><span /><span /></div>
        </div>
      </div>
      <div className="motion-bg" aria-hidden="true">
        <div className="motion-grid" />
        <div className="motion-orb motion-orb-one" />
        <div className="motion-orb motion-orb-two" />
        <div className="motion-ribbon"><span /></div>
        <div className="motion-signal"><i /><i /><i /><i /></div>
      </div>

      <header className="topbar skeleton-topbar" aria-hidden="true">
        <div className="brand">
          <SkeletonBlock className="skeleton-logo" />
          <SkeletonBlock className="skeleton-brand-name" />
        </div>
        <div className="nav skeleton-nav">
          {navItems.map((item) => <SkeletonBlock className="skeleton-nav-item" key={item} />)}
        </div>
        <SkeletonButton />
      </header>

      <section className="hero skeleton-loading-hero" aria-hidden="true">
        <div className="hero-grid">
          <div className="skeleton-stack skeleton-hero-copy">
            <div className="eyebrow-row">
              <SkeletonLine variant="eyebrow" />
            </div>
            <div className="hero-kicker skeleton-pill-row">
              {heroPills.map((item) => <SkeletonBlock className="skeleton-pill" key={item} />)}
            </div>
            <SkeletonBlock className="skeleton-hero-title" strong />
            <SkeletonBlock className="skeleton-subhead" />
            <SkeletonBlock className="skeleton-subhead short" />
            <div className="hero-actions">
              <SkeletonButton />
              <SkeletonButton secondary />
            </div>
          </div>
          <aside className="brief-card skeleton-card">
            {briefRows.map((item) => (
              <div className="skeleton-brief-row" key={item}>
                <SkeletonText lines={2} widths={["72%", "100%"]} titleFirstLine />
                <SkeletonBlock className="skeleton-value" />
              </div>
            ))}
          </aside>
        </div>
        <div className="brand-band skeleton-brand-band skeleton-dark">
          <div>
            <SkeletonLine variant="heading" />
            <SkeletonText lines={2} widths={["100%", "52%"]} />
          </div>
          <div className="brand-marks">
            <SkeletonBlock className="skeleton-pill" />
            <SkeletonBlock className="skeleton-pill" />
            <SkeletonBlock className="skeleton-pill" />
          </div>
        </div>
      </section>

      <section className="pipeline-band skeleton-loading-band" aria-hidden="true">
        <div className="pipeline-inner">
          {pipelineRows.map((item) => (
            <article className="pipeline-step skeleton-step" key={item}>
              <SkeletonBlock className="skeleton-step-icon" />
              <SkeletonText centered lines={3} widths={["72%", "100%", "62%"]} titleFirstLine />
            </article>
          ))}
        </div>
      </section>

      <section className="section skeleton-services-preview" aria-hidden="true">
        <div className="section-head services-head">
          <SkeletonLine className="centered" variant="heading" />
          <SkeletonLine className="centered" width="min(700px, 86%)" />
        </div>
        <div className="services-viewport">
          <div className="services-track skeleton-static-track">
            {serviceRows.map((item) => (
              <article className="service-slide skeleton-service-slide" key={item}>
                <SkeletonMedia className="skeleton-photo" variant="service" />
                <div className="service-copy">
                  <SkeletonLine variant="short" />
                  <SkeletonLine variant="title" />
                  <SkeletonLine />
                  <SkeletonBlock className="skeleton-pill" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}