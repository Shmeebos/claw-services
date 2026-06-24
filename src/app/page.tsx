"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const serviceOptions = [
  "Premium website / landing page",
  "Lead intake automation",
  "Content or design pack",
  "Research or admin pack",
  "Monthly operator desk",
] as const;

type ServiceKey = "website" | "automation" | "content" | "research" | "desk";

const serviceCards: Record<
  ServiceKey,
  {
    label: string;
    service: (typeof serviceOptions)[number];
    summary: string;
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
    deliverables: ["Priority queue", "Weekly status", "Reusable briefs", "Delivery archive"],
    timeline: "Monthly",
    effort: "Submit requests as needed",
    next: "Set desk rules",
  },
};

const servicesShowcase = [
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
];

type ApiResponse = {
  ok: boolean;
  requestId?: string;
  brief?: string;
  storage?: { mode: string; id: string };
  email?: { sent: boolean; reason?: string; id?: string | null };
  error?: string;
  issues?: Record<string, string[]>;
};

const serviceKeyFromService = (service: string): ServiceKey => {
  return (
    (Object.keys(serviceCards) as ServiceKey[]).find((key) => serviceCards[key].service === service) ??
    "website"
  );
};

export default function Home() {
  const [active, setActive] = useState<ServiceKey>("website");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const selected = serviceCards[active];

  useEffect(() => {
    const root = document.documentElement;
    const stages = Array.from(document.querySelectorAll<HTMLElement>("[data-motion-stage]"));
    const servicesSection = document.getElementById("deliverables");
    const servicesTrack = document.querySelector<HTMLElement>(".services-track");
    const servicesViewport = document.querySelector<HTMLElement>(".services-viewport");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let ticking = false;

    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

    const updateMotion = () => {
      ticking = false;
      const y = window.scrollY;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const pageProgress = clamp(y / maxScroll);

      root.style.setProperty("--scroll-progress", pageProgress.toFixed(4));
      root.style.setProperty("--drift-y", `${Math.round(pageProgress * 104)}px`);
      root.style.setProperty("--drift-x", `${Math.round(Math.sin(pageProgress * Math.PI * 2) * 26)}px`);
      root.style.setProperty("--orb-rotate", `${(pageProgress * 21).toFixed(2)}deg`);
      root.style.setProperty("--ribbon-shift", `${Math.round(pageProgress * 220)}px`);
      root.dataset.scrollDirection = y >= lastY ? "down" : "up";

      let activeStage = "hero";
      let closestDistance = Number.POSITIVE_INFINITY;
      for (const section of stages) {
        const rect = section.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
        const distance = Math.abs(rect.top - window.innerHeight * 0.28);
        if (distance < closestDistance) {
          closestDistance = distance;
          activeStage = section.dataset.motionStage ?? "hero";
        }
      }
      root.dataset.stage = activeStage;

      if (servicesSection && servicesTrack && servicesViewport) {
        const stickyOffset = 76;
        const sectionTop = servicesSection.getBoundingClientRect().top + y;
        const start = sectionTop - stickyOffset;
        const end = sectionTop + servicesSection.offsetHeight - window.innerHeight;
        const travel = Math.max(1, end - start);
        const servicesProgress = clamp((y - start) / travel);
        const maxX = Math.max(0, servicesTrack.scrollWidth - servicesViewport.clientWidth);
        root.style.setProperty("--services-progress", servicesProgress.toFixed(4));
        root.style.setProperty("--carousel-x", `${Math.round(maxX * servicesProgress * -1)}px`);
        root.style.setProperty("--carousel-depth", `${Math.round(servicesProgress * 100)}%`);
      }

      lastY = y;
    };

    const requestUpdate = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateMotion);
    };

    if (prefersReducedMotion.matches) {
      root.dataset.stage = "hero";
      root.style.setProperty("--scroll-progress", "0");
      root.style.setProperty("--services-progress", "0");
      root.style.setProperty("--drift-y", "0px");
      root.style.setProperty("--drift-x", "0px");
      root.style.setProperty("--orb-rotate", "0deg");
      root.style.setProperty("--ribbon-shift", "0px");
      root.style.setProperty("--carousel-x", "0px");
      root.style.setProperty("--carousel-depth", "0%");
      return;
    }

    updateMotion();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const statusCopy = useMemo(() => {
    if (status === "submitting") return "Preparing request...";
    if (status === "success") return "Request prepared and saved.";
    if (status === "error") return "Could not submit yet. Check the message below.";
    return "Prepare my brief";
  }, [status]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setResponse(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      businessUrl: String(form.get("businessUrl") ?? ""),
      service: String(form.get("service") ?? selected.service),
      request: String(form.get("request") ?? ""),
      budget: String(form.get("budget") ?? ""),
      timeline: String(form.get("timeline") ?? ""),
      honeypot: String(form.get("website") ?? ""),
    };

    try {
      const apiResponse = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await apiResponse.json()) as ApiResponse;
      setResponse(data);
      setStatus(apiResponse.ok && data.ok ? "success" : "error");
    } catch (error) {
      setResponse({ ok: false, error: error instanceof Error ? error.message : "unknown_error" });
      setStatus("error");
    }
  }

  return (
    <main className="page-shell">
      <div className="motion-bg" aria-hidden="true">
        <div className="motion-grid" />
        <div className="motion-orb motion-orb-one" />
        <div className="motion-orb motion-orb-two" />
        <div className="motion-ribbon"><span /></div>
        <div className="motion-signal">
          <i />
          <i />
          <i />
          <i />
        </div>
      </div>

      <header className="topbar">
        <a className="brand" href="#top" aria-label="Claw Services home">
          <span className="logo" aria-hidden="true" />
          <span>Claw Services</span>
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="#deliverables">Services</a>
          <a href="#builder">Work builder</a>
          <a href="#system">Request system</a>
        </nav>
        <a className="pill-btn" href="#system">Open a request</a>
      </header>

      <section className="hero" id="top" data-motion-stage="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow-row"><span className="logo" aria-hidden="true" /><span>Claw Services</span></div>
            <div className="hero-kicker">
              <span>Websites</span><span>Automations</span><span>Design</span><span>Research</span><span>Operator desk</span>
            </div>
            <h1>Digital work handled from first message to final delivery.</h1>
            <p className="subhead">Tell us what you need. Claw turns it into a clear plan, gives you the deliverables, and has human operators finish the work.</p>
            <div className="clarity-strip">
              {["Send the ask", "Get scope + price", "We build it", "You approve"].map((step, index) => <span key={step}><b>{index + 1}</b>{step}</span>)}
            </div>
            <div className="hero-actions"><a className="pill-btn" href="#system">Open your first request</a><a className="outline-btn" href="#builder">See what we can ship</a></div>
          </div>
          <aside className="brief-card">
            {[["Client need", "“I want my service business to look premium.”", "New"], ["Brief quality", "Budget, references, tone, deliverables", "Good"], ["Recommended package", "Landing page sprint + intake setup", "$"], ["Next step", "Approve plan or request changes", "Review"]].map(([label, copy, value]) => (
              <div className="brief-row" key={label}><div><b>{label}</b><p>{copy}</p></div><strong>{value}</strong></div>
            ))}
          </aside>
        </div>
        <div className="brand-band">
          <div><h2>Not a random freelancer. Not a black-box AI tool.</h2><p>Claw is a service desk for digital work: AI helps collect the context, operators handle execution, and every request becomes a trackable brief with clear deliverables.</p></div>
          <div className="brand-marks"><span>Human accountable</span><span>AI-assisted intake</span><span>Delivery focused</span></div>
        </div>
      </section>

      <section className="section stock-strip" aria-label="Branded service imagery" data-motion-stage="proof">
        <article className="stock-tile large" style={{ backgroundImage: "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58)), url('/stock/premium-workspace.jpg')" }}><b>Premium enough to trust.</b><span>Clean visual systems for local businesses and service teams.</span></article>
        <article className="stock-tile" style={{ backgroundImage: "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58)), url('/stock/client-laptop.jpg')" }}><b>Request to brief.</b><span>Clear intake before work starts.</span></article>
        <article className="stock-tile" style={{ backgroundImage: "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58)), url('/stock/team-ops.jpg')" }}><b>Human operated.</b><span>Real execution, not vague automation.</span></article>
        <article className="stock-tile" style={{ backgroundImage: "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58)), url('/stock/strategy-desk.jpg')" }}><b>Deliverables tracked.</b><span>Scope, updates, review, approval.</span></article>
      </section>

      <section className="section cards" data-motion-stage="packages"><article><small>Starter</small><h3>One request</h3><p>Best for a focused deliverable: page, doc, automation, cleanup.</p></article><article><small>Growth</small><h3>Credit package</h3><p>Buy a block of service credits and use them across requests.</p></article><article><small>Operator</small><h3>Monthly desk</h3><p>Priority support for ongoing digital work and rapid execution.</p></article></section>

      <section className="section services-scroll" id="deliverables" data-motion-stage="services">
        <div className="services-sticky">
          <div className="section-head services-head"><small>Services we offer</small><h2>Services Claw can handle.</h2><p>Websites, intake systems, content, research, and recurring operator support — each scoped into clear deliverables before work starts.</p></div>
          <div className="services-viewport" aria-label="Scroll-reactive services carousel">
            <div className="services-track">
              {servicesShowcase.map((item, index) => (
                <article className="service-slide" key={item.title}>
                  <div className="service-photo" style={{ backgroundImage: `linear-gradient(180deg, rgba(8,13,29,.02), rgba(8,13,29,.62)), url('${item.image}')` }}>
                    <span>{item.caption}</span>
                    <b>{String(index + 1).padStart(2, "0")}</b>
                  </div>
                  <div className="service-copy">
                    <small>{item.service}</small>
                    <h3>{item.title}</h3>
                    <p>{item.copy}</p>
                    <strong>{item.stat}</strong>
                  </div>
                </article>
              ))}
            </div>
          </div>
          <div className="services-progress" aria-hidden="true"><span /></div>
        </div>
      </section>

      <section className="section" id="builder" data-motion-stage="builder">
        <div className="section-head"><small>Interactive work builder</small><h2>Pick a need. See the package, deliverables, and next step.</h2><p>This is the clearest way to show customers that Claw has the solution and can make the process easy.</p></div>
        <div className="builder-wrap">
          <div className="builder-panel"><h3>What do you need handled?</h3>{(Object.keys(serviceCards) as ServiceKey[]).map((key) => <button key={key} type="button" className="choice-btn" aria-pressed={active === key} onClick={() => setActive(key)}><span>{serviceCards[key].label[0]}</span><b>{serviceCards[key].label}</b><em>{serviceCards[key].summary}</em></button>)}</div>
          <aside className="output-card"><div className="output-top"><h3>{selected.label}</h3><span>{selected.service}</span></div><p>{selected.summary}</p><div className="deliverables">{selected.deliverables.map((item) => <span key={item}>{item}</span>)}</div><div className="output-meta"><span><b>Timeline</b>{selected.timeline}</span><span><b>Client effort</b>{selected.effort}</span><span><b>Next step</b>{selected.next}</span></div></aside>
        </div>
      </section>

      <section className="section process" data-motion-stage="process"><div className="section-head"><small>Process</small><h2>A simple path from rough ask to approved outcome.</h2><p>You do not need exact specs. Claw turns the first message into scope, timeline, price, and a delivery checklist.</p></div>{["Tell us the outcome", "Review the plan", "We fulfill it", "You approve"].map((title, index) => <article key={title}><span>{index + 1}</span><h3>{title}</h3><p>{index === 0 ? "No need to know exact tools or specs." : index === 1 ? "We convert it into scope, timeline, and price." : index === 2 ? "Operators handle execution and status updates." : "Receive the work and optional next sprint."}</p></article>)}</section>

      <section className="section" id="system" data-motion-stage="request">
        <div className="section-head"><small>Request system</small><h2>The actual client path: request, brief, queue, fulfill.</h2><p>This React/Next.js version posts to a real API route. With Supabase and Resend env vars set, it saves to Supabase and emails the team; locally it saves to a JSON fallback so the flow works now.</p></div>
        <div className="request-system">
          <aside><h3>Operator queue</h3><div className="queue"><p><i className="green" /> <b>Premium site refresh</b><span>New</span></p><p><i className="gold" /> <b>Lead intake flow</b><span>Plan</span></p><p><i className="cyan" /> <b>Research pack</b><span>QA</span></p></div></aside>
          <form onSubmit={submitRequest} className="request-form">
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" />
            <input name="name" placeholder="Name or business" required />
            <input type="email" name="email" placeholder="Email" required />
            <input name="businessUrl" placeholder="Business website or social link (optional)" />
            <select name="service" value={selected.service} onChange={(event) => setActive(serviceKeyFromService(event.target.value))}>{serviceOptions.map((option) => <option key={option}>{option}</option>)}</select>
            <div className="form-row"><input name="budget" placeholder="Budget range (optional)" /><input name="timeline" placeholder="Timeline (optional)" /></div>
            <textarea name="request" placeholder="What do you need handled?" required minLength={15} />
            <button className="pill-btn" disabled={status === "submitting"}>{statusCopy}</button>
            {response && <div className={response.ok ? "notice success" : "notice error"}><b>{response.ok ? `Request ID: ${response.requestId}` : response.error}</b>{response.brief && <p>{response.brief}</p>}{response.storage && <p>Storage: {response.storage.mode}</p>}{response.email && <p>Email: {response.email.sent ? "sent" : response.email.reason}</p>}</div>}
          </form>
        </div>
      </section>

      <footer>Claw Services · AI-assisted intake, human-operated delivery. <span>Next.js + Supabase + Resend request desk.</span></footer>
    </main>
  );
}
