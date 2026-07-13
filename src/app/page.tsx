"use client";

import Image from "next/image";
import { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { ClawBrandLogo, ClawHandMark } from "@/components/ClawBrandLogo";
import { SkeletonText } from "@/components/Skeleton";
import { Tooltip } from "@/components/Tooltip";
import { serviceCards, serviceOptions, servicesShowcase, type ServiceKey } from "@/lib/landing-content";

const UI_STATE_STORAGE_KEY = "claw-services:ui-state";
const UI_STATE_VERSION = 1;

const terminalChecks = [
  ["Outcome objective", "Rebuild the pricing page to improve enterprise conversion. Include tier structure, comparison matrix, and a clean request path."],
  ["Provided assets", "Figma draft, copy notes, current site URL, pricing assumptions"],
  ["Validation checks", "Mobile responsive · form path clear · tracking-ready"],
  ["Operator assignment", "Tier 2 specialist · scope and delivery owner"],
] as const;

const imageSkeletonLayer =
  "linear-gradient(100deg, var(--skeleton-base), var(--skeleton-shine), var(--skeleton-base))";

const imageBackedStyle = (image: string, overlay: string): CSSProperties => ({
  backgroundColor: "rgba(216, 225, 236, .62)",
  backgroundImage: `${overlay}, url('${image}'), ${imageSkeletonLayer}`,
  backgroundPosition: "center, center, 160% 0",
  backgroundRepeat: "no-repeat",
  backgroundSize: "auto, cover, 220% 100%",
});

const revealTargetSelector = [
  ".topbar",
  ".hero-grid > div",
  ".brief-card",
  ".brand-band",
  ".terminal-copy",
  ".terminal-shell",
  ".stock-tile",
  ".engagement-card",
  ".services-head",
  ".services-carousel-shell",
  ".builder-panel",
  ".output-card",
  ".live-queue-card",
  ".request-form",
  "footer",
].join(",");

const getRevealKind = (element: HTMLElement) => {
  if (element.matches(".stock-tile, .service-photo")) return "image";
  if (
    element.matches(
      ".brief-card, .terminal-shell, .engagement-card, .services-carousel-shell, .builder-panel, .output-card, .live-queue-card, .request-form",
    )
  ) {
    return "card";
  }
  if (element.matches(".topbar")) return "chrome";
  return "text";
};

const pipelineSteps = [
  ["Describe", "Send the rough ask, links, files, constraints, or just the outcome you want."],
  ["AI Intake", "Claw structures the request into scope, missing details, timeline, and acceptance criteria."],
  ["Human Execution", "A real operator handles the work, uses AI where useful, and keeps delivery accountable."],
  ["Approve", "You review the finished asset, request changes, and keep the delivery record."],
] as const;

const structuredEngagements = [
  {
    tier: "Basic",
    title: "Starter",
    copy: "Essential operational support for small teams.",
    items: ["1 Active Request", "72h Turnaround", "Standard Support"],
    variant: "starter",
    badge: null,
  },
  {
    tier: "Pro",
    title: "Growth",
    copy: "Dedicated capacity for scaling operations.",
    items: ["3 Active Requests", "48h Turnaround", "Priority Support"],
    variant: "growth",
    badge: "Popular",
  },
  {
    tier: "Enterprise",
    title: "Operator",
    copy: "Full-stack digital execution team.",
    items: ["Unlimited Requests", "24h Turnaround", "Dedicated Operator Manager"],
    variant: "operator",
    badge: null,
  },
] as const;

const liveQueuePreview = [
  {
    initials: "J",
    title: "Operator Jane assigned",
    label: "Website Launch",
    state: "assigned",
  },
  {
    initials: "•",
    title: "Request #402 in review",
    label: "Content Update",
    state: "review",
  },
] as const;

const seededFraction = (seed: number) => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const shuffledOrder = (count: number, seed: number) => {
  const order = Array.from({ length: count }, (_, index) => index).sort(
    (a, b) => seededFraction((a + 1) * seed) - seededFraction((b + 1) * seed),
  );

  return order.reduce<number[]>((map, index, position) => {
    map[index] = position;
    return map;
  }, []);
};

const renderStaggeredText = (text: string, className: string, speedMs: number, offsetMs = 0) => {
  let letterIndex = 0;
  const words = text.split(" ");
  const letterCount = words.reduce((count, word) => count + Array.from(word).length, 0);
  const orderByIndex = shuffledOrder(letterCount, text.length + className.length + 11);

  return (
    <span aria-hidden="true" className={`services-reveal-text ${className}`}>
      {words.map((word, wordIndex) => (
        <span className="services-reveal-word" key={`${word}-${wordIndex}`}>
          {Array.from(word).map((char, charIndex) => {
            const currentIndex = letterIndex;
            const order = orderByIndex[currentIndex] ?? currentIndex;
            const drift = Math.round((seededFraction((currentIndex + 1) * 17 + text.length) - 0.5) * 30);
            const rotate = (seededFraction((currentIndex + 1) * 23 + className.length) - 0.5) * 9;
            const startY = Math.round(165 + seededFraction((currentIndex + 1) * 31 + text.length) * 115);
            const duration = Math.round(920 + seededFraction((currentIndex + 1) * 41 + className.length) * 360);
            letterIndex += 1;

            return (
              <span
                className="services-reveal-letter"
                key={`${wordIndex}-${charIndex}-${char}`}
                style={{
                  "--letter-delay": `${offsetMs + order * speedMs}ms`,
                  "--letter-duration": `${duration}ms`,
                  "--letter-start-y": `${startY}px`,
                  "--letter-drift-x": `${drift}px`,
                  "--letter-mid-x": `${Math.round(drift * 0.42)}px`,
                  "--letter-settle-x": `${Math.round(drift * 0.12)}px`,
                  "--letter-rotate": `${rotate.toFixed(2)}deg`,
                  "--letter-mid-rotate": `${(rotate * 0.38).toFixed(2)}deg`,
                  "--letter-settle-rotate": `${(rotate * 0.1).toFixed(2)}deg`,
                } as CSSProperties}
              >
                {char}
              </span>
            );
          })}
          {wordIndex < words.length - 1 ? <span className="services-reveal-space"> </span> : null}
        </span>
      ))}
    </span>
  );
};

const renderSuspendedTitle = (text: string) => {
  let letterIndex = 0;

  return (
    <span aria-hidden="true" className="engagement-rig-title">
      {Array.from(text).map((char, index) => {
        if (char === " ") {
          return <span className="engagement-rig-space" key={`space-${index}`} />;
        }

        const currentIndex = letterIndex;
        const drop = Math.round(104 + seededFraction((currentIndex + 1) * 19 + text.length) * 32);
        const sway = (seededFraction((currentIndex + 1) * 29 + text.length) - 0.5) * 7;
        letterIndex += 1;

        return (
          <span
            className="engagement-rig-unit"
            key={`${char}-${index}`}
            style={{
              "--engagement-delay": `${90 + currentIndex * 26}ms`,
              "--engagement-drop": `${drop * -1}px`,
              "--engagement-string": `${drop + 4}px`,
              "--engagement-sway": `${sway.toFixed(2)}deg`,
              "--engagement-sway-soft": `${(sway * 0.34).toFixed(2)}deg`,
            } as CSSProperties}
          >
            <span className="engagement-rig-cable" />
            <span className="engagement-rig-letter">{char}</span>
          </span>
        );
      })}
    </span>
  );
};

type ApiResponse = {
  ok: boolean;
  pending?: boolean;
  ignored?: boolean;
  requestId?: string;
  brief?: string;
  storage?: { mode: string; id: string };
  email?: { sent: boolean; reason?: string; id?: string | null };
  error?: string;
  issues?: Record<string, string[]>;
};

const requestFieldLabels: Record<string, string> = {
  name: "name/business",
  email: "email",
  businessUrl: "business link",
  service: "service",
  request: "request details",
  budget: "budget",
  timeline: "timeline",
  honeypot: "spam check",
};

const formatRequestIssues = (issues?: Record<string, string[]>) => {
  if (!issues) return null;

  const issueText = Object.entries(issues)
    .flatMap(([field, messages]) =>
      messages.map((message) => `${requestFieldLabels[field] ?? field}: ${message}`),
    )
    .join("; ");

  return issueText || null;
};

const formatRequestError = (data: ApiResponse | null, fallback: string) => {
  if (data?.error === "validation_error") {
    return `Validation failed — ${formatRequestIssues(data.issues) ?? "review the form and retry."}`;
  }

  if (data?.error) return data.error.replaceAll("_", " ");
  return fallback;
};

type RequestStatus = "idle" | "syncing" | "success" | "error";

const makeOptimisticRequestId = () => {
  const randomPart =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);

  return `LOCAL-${randomPart.toUpperCase()}`;
};

const serviceKeyFromService = (service: string): ServiceKey => {
  return (
    (Object.keys(serviceCards) as ServiceKey[]).find((key) => serviceCards[key].service === service) ??
    "website"
  );
};

const isServiceKey = (value: unknown): value is ServiceKey => {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(serviceCards, value);
};

const readPersistedUiState = (): ServiceKey | null => {
  if (typeof window === "undefined") return null;

  try {
    const stored = window.localStorage.getItem(UI_STATE_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as { version?: unknown; selectedService?: unknown } | null;
    if (parsed?.version === UI_STATE_VERSION && isServiceKey(parsed.selectedService)) {
      return parsed.selectedService;
    }
  } catch {
    // Bad JSON or unavailable storage should not block app startup.
  }

  try {
    window.localStorage.removeItem(UI_STATE_STORAGE_KEY);
  } catch {
    // Ignore storage errors; default UI state remains safe.
  }
  return null;
};

const writePersistedUiState = (selectedService: ServiceKey) => {
  if (typeof window === "undefined") return;

  try {
    // Persist only harmless UI preference data. Never store form fields,
    // request payloads, auth/session state, or server/customer data here.
    window.localStorage.setItem(
      UI_STATE_STORAGE_KEY,
      JSON.stringify({ version: UI_STATE_VERSION, selectedService }),
    );
  } catch {
    // Private browsing or quota failures should not affect the request flow.
  }
};

const buildLocalOperatorBrief = (payload: {
  name: string;
  businessUrl: string;
  service: string;
  request: string;
  budget: string;
  timeline: string;
}) => {
  const business = payload.businessUrl.trim() ? ` Website/source: ${payload.businessUrl.trim()}.` : "";
  const budget = payload.budget.trim() ? ` Budget signal: ${payload.budget.trim()}.` : "";
  const timeline = payload.timeline.trim() ? ` Timeline: ${payload.timeline.trim()}.` : "";

  return `${payload.name.trim()} needs ${payload.service}.${business}${budget}${timeline} First operator action: clarify scope, assets, success criteria, timeline, and approval path. Request summary: ${payload.request.trim()}`;
};

export default function Home() {
  const [active, setActive] = useState<ServiceKey>(() => readPersistedUiState() ?? "website");
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [introComplete, setIntroComplete] = useState(false);
  const submitInFlightRef = useRef(false);
  const [loadedServiceImages, setLoadedServiceImages] = useState<Record<string, boolean>>({});
  const selected = serviceCards[active];
  const engagementTitle = useMemo(() => renderSuspendedTitle("Structured Engagements"), []);
  const servicesTitle = useMemo(() => renderStaggeredText("Services Claw can handle.", "services-title-fill", 20), []);
  const servicesCopy = useMemo(
    () =>
      renderStaggeredText(
        "Websites, intake systems, content, research, and recurring operator support — each scoped into clear deliverables before work starts.",
        "services-copy-fill",
        8,
        280,
      ),
    [],
  );

  const markServiceImageLoaded = (image: string) => {
    setLoadedServiceImages((current) => (current[image] ? current : { ...current, [image]: true }));
  };

  useEffect(() => {
    const minimumTimer = window.setTimeout(() => setIntroComplete(true), 1080);
    const fallbackTimer = window.setTimeout(() => setIntroComplete(true), 2600);

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (!introComplete) return;

    const root = document.documentElement;
    const targets = Array.from(new Set(Array.from(document.querySelectorAll<HTMLElement>(revealTargetSelector))));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    targets.forEach((element, index) => {
      element.dataset.reveal = "true";
      element.dataset.revealKind = getRevealKind(element);
      element.style.setProperty("--reveal-delay", `${Math.min((index % 7) * 58, 348)}ms`);
    });

    const revealElement = (element: HTMLElement) => {
      element.dataset.revealState = "visible";
    };

    if (prefersReducedMotion.matches) {
      targets.forEach(revealElement);
      return () => {
        targets.forEach((element) => {
          delete element.dataset.reveal;
          delete element.dataset.revealKind;
          delete element.dataset.revealState;
          element.style.removeProperty("--reveal-delay");
        });
      };
    }

    root.dataset.revealReady = "true";

    const revealVisibleTargets = () => {
      for (const element of targets) {
        if (element.dataset.revealState === "visible") continue;
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.88 && rect.bottom > window.innerHeight * 0.08) {
          revealElement(element);
        }
      }
    };

    const observer = "IntersectionObserver" in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              revealElement(entry.target as HTMLElement);
              observer?.unobserve(entry.target);
            }
          },
          { rootMargin: "0px 0px -12% 0px", threshold: 0.01 },
        )
      : null;

    const shouldUseScrollFallback = observer === null;

    targets.forEach((element) => observer?.observe(element));
    revealVisibleTargets();
    window.addEventListener("resize", revealVisibleTargets);
    if (shouldUseScrollFallback) {
      window.addEventListener("scroll", revealVisibleTargets, { passive: true });
    }

    return () => {
      observer?.disconnect();
      delete root.dataset.revealReady;
      window.removeEventListener("resize", revealVisibleTargets);
      if (shouldUseScrollFallback) {
        window.removeEventListener("scroll", revealVisibleTargets);
      }
      targets.forEach((element) => {
        delete element.dataset.reveal;
        delete element.dataset.revealKind;
        delete element.dataset.revealState;
        element.style.removeProperty("--reveal-delay");
      });
    };
  }, [introComplete]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/claw-cache-sw.js").catch(() => undefined);
  }, []);

  useEffect(() => {
    const scrollToCurrentHash = () => {
      const targetId = window.location.hash.slice(1);
      if (!targetId) return;

      const target = document.getElementById(targetId);
      if (!target) return;

      window.requestAnimationFrame(() => {
        const topbarOffset = 76;
        const top = target.getBoundingClientRect().top + window.scrollY - topbarOffset;
        window.scrollTo({ top, behavior: "auto" });
        window.dispatchEvent(new Event("scroll"));
      });
    };

    scrollToCurrentHash();
    window.addEventListener("hashchange", scrollToCurrentHash);
    return () => window.removeEventListener("hashchange", scrollToCurrentHash);
  }, []);

  const selectActiveService = (nextActive: ServiceKey) => {
    setActive(nextActive);
    writePersistedUiState(nextActive);
  };

  useEffect(() => {
    const root = document.documentElement;
    const stages = Array.from(document.querySelectorAll<HTMLElement>("[data-motion-stage]"));
    const servicesSection = document.getElementById("deliverables");
    const engagementSection = document.getElementById("ways-to-work");
    const servicesTrack = document.querySelector<HTMLElement>(".services-track");
    const servicesViewport = document.querySelector<HTMLElement>(".services-viewport");
    const workflowSection = document.getElementById("process");
    const workflowSteps = Array.from(document.querySelectorAll<HTMLElement>(".workflow-step"));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastY = window.scrollY;
    let ticking = false;
    let servicesRevealed = servicesSection?.dataset.servicesRevealed === "true";
    let engagementTitleRevealed = engagementSection?.dataset.engagementTitleRevealed === "true";

    const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));

    const revealServices = () => {
      if (!servicesSection || servicesRevealed) return;
      servicesSection.dataset.servicesRevealed = "true";
      servicesRevealed = true;
    };

    const revealEngagementTitle = () => {
      if (!engagementSection || engagementTitleRevealed) return;
      engagementSection.dataset.engagementTitleRevealed = "true";
      engagementTitleRevealed = true;
    };

    let revealObserver: IntersectionObserver | null = null;
    let engagementObserver: IntersectionObserver | null = null;

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

      if (engagementSection && !engagementTitleRevealed) {
        const engagementRect = engagementSection.getBoundingClientRect();
        if (engagementRect.top <= window.innerHeight * 0.34 && engagementRect.bottom >= window.innerHeight * 0.64) {
          revealEngagementTitle();
        }
      }

      if (servicesSection && servicesTrack && servicesViewport) {
        const stickyOffset = 76;
        const sectionRect = servicesSection.getBoundingClientRect();

        if (!servicesRevealed && sectionRect.top < window.innerHeight * 0.72 && sectionRect.bottom > window.innerHeight * 0.18) {
          revealServices();
        }

        const sectionTop = sectionRect.top + y;
        const start = sectionTop;
        const end = sectionTop + servicesSection.offsetHeight - window.innerHeight + stickyOffset;
        const travel = Math.max(1, end - start);
        const servicesProgress = clamp((y - start) / travel);
        const maxX = Math.max(0, servicesTrack.scrollWidth - servicesViewport.clientWidth);
        root.style.setProperty("--services-progress", servicesProgress.toFixed(4));
        root.style.setProperty("--carousel-x", `${Math.round(maxX * servicesProgress * -1)}px`);
        root.style.setProperty("--carousel-depth", `${Math.round(servicesProgress * 100)}%`);
      }

      if (workflowSection && workflowSteps.length) {
        const sectionRect = workflowSection.getBoundingClientRect();
        const sectionTop = sectionRect.top + y;
        const start = sectionTop - window.innerHeight * 0.08;
        const end = sectionTop + workflowSection.offsetHeight - window.innerHeight * 0.72;
        const travel = Math.max(1, end - start);
        const workflowProgress = clamp((y - start) / travel);
        const maxIndex = Math.max(1, workflowSteps.length - 1);
        const activeIndex = Math.min(workflowSteps.length - 1, Math.round(workflowProgress * maxIndex));

        root.style.setProperty("--workflow-progress", workflowProgress.toFixed(4));
        root.style.setProperty("--workflow-line-progress", `${Math.round(workflowProgress * 100)}%`);
        root.style.setProperty("--workflow-active-index", String(activeIndex));

        workflowSteps.forEach((step, index) => {
          const target = index / maxIndex;
          const distance = Math.abs(workflowProgress - target);
          const focus = clamp(1 - distance * 2.65);
          const drift = Math.round((target - workflowProgress) * 96);
          step.style.setProperty("--step-focus", focus.toFixed(3));
          step.style.setProperty("--step-drift", `${drift}px`);
          step.dataset.workflowState = index < activeIndex ? "past" : index === activeIndex ? "active" : "future";
        });
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
      delete root.dataset.servicesRevealReady;
      root.style.setProperty("--scroll-progress", "0");
      root.style.setProperty("--services-progress", "0");
      root.style.setProperty("--drift-y", "0px");
      root.style.setProperty("--drift-x", "0px");
      root.style.setProperty("--orb-rotate", "0deg");
      root.style.setProperty("--ribbon-shift", "0px");
      root.style.setProperty("--carousel-x", "0px");
      root.style.setProperty("--carousel-depth", "0%");
      root.style.setProperty("--workflow-progress", "1");
      root.style.setProperty("--workflow-line-progress", "100%");
      engagementSection?.setAttribute("data-engagement-title-revealed", "true");
      workflowSteps.forEach((step) => {
        step.style.setProperty("--step-focus", "1");
        step.style.setProperty("--step-drift", "0px");
        step.dataset.workflowState = "active";
      });
      servicesSection?.setAttribute("data-services-revealed", "true");
      return;
    }

    root.dataset.servicesRevealReady = "true";
    root.dataset.engagementTitleReady = "true";

    if (engagementSection && "IntersectionObserver" in window) {
      engagementObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          revealEngagementTitle();
          requestUpdate();
          engagementObserver?.disconnect();
        },
        { rootMargin: "-24% 0px -24% 0px", threshold: 0.52 },
      );
      engagementObserver.observe(engagementSection);
    }

    if (servicesSection && "IntersectionObserver" in window) {
      revealObserver = new IntersectionObserver(
        ([entry]) => {
          if (!entry?.isIntersecting) return;
          revealServices();
          requestUpdate();
          revealObserver?.disconnect();
        },
        { rootMargin: "-10% 0px -18% 0px", threshold: 0.22 },
      );
      revealObserver.observe(servicesSection);
    }

    updateMotion();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    return () => {
      delete root.dataset.servicesRevealReady;
      delete root.dataset.engagementTitleReady;
      revealObserver?.disconnect();
      engagementObserver?.disconnect();
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const statusCopy = useMemo(() => {
    if (status === "syncing") return response?.pending ? "Saving request..." : "Syncing request...";
    if (status === "success") return "Request saved.";
    if (status === "error") return "Review and retry.";
    return "Prepare my brief";
  }, [response?.pending, status]);

  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitInFlightRef.current) return;

    submitInFlightRef.current = true;
    const optimisticId = makeOptimisticRequestId();

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
    const optimisticBrief = buildLocalOperatorBrief(payload);

    setStatus("syncing");
    setResponse({
      ok: true,
      pending: true,
      requestId: optimisticId,
      brief: optimisticBrief,
      storage: { mode: "optimistic", id: optimisticId },
      email: { sent: false, reason: "syncing" },
    });

    try {
      const apiResponse = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      let data: ApiResponse | null = null;
      try {
        data = (await apiResponse.json()) as ApiResponse;
      } catch {
        data = null;
      }

      if (!apiResponse.ok || !data?.ok) {
        setResponse({
          ...data,
          ok: false,
          brief: optimisticBrief,
          error: formatRequestError(
            data,
            `Request was not saved. Server returned ${apiResponse.status}; please retry.`,
          ),
          issues: data?.issues,
        });
        setStatus("error");
        return;
      }

      if (!data.ignored && !data.requestId) {
        setResponse({
          ok: false,
          brief: optimisticBrief,
          error: "Request was not confirmed by the server. Please retry so Claw can return a request ID.",
        });
        setStatus("error");
        return;
      }

      setResponse(data);
      setStatus("success");
    } catch (error) {
      setResponse({
        ok: false,
        brief: optimisticBrief,
        error: `Save failed — no request was created. Your draft is still in the form. (${error instanceof Error ? error.message : "unknown_error"})`,
      });
      setStatus("error");
    } finally {
      submitInFlightRef.current = false;
    }
  }

  return (
    <main className={`page-shell ${introComplete ? "is-ready" : "is-loading"}`} aria-busy={!introComplete}>
      <div
        className={`brand-loader ${introComplete ? "is-complete" : ""}`}
        aria-hidden={introComplete}
        aria-label="Loading Claw Services"
        role="status"
      >
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
          <div className="loader-skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
      </div>

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
          <ClawBrandLogo />
        </a>
        <nav className="nav" aria-label="Primary navigation">
          <a href="#intake">Intake</a>
          <a href="#deliverables">Services</a>
          <Tooltip content="Preview request rooms, approvals, credits, and delivery status.">
            <a href="/portal">Portal</a>
          </Tooltip>
          <a href="#ways-to-work">Engagement</a>
          <a href="#process">Process</a>
          <Tooltip content="Jump to the interactive package preview.">
            <a href="#builder">Work builder</a>
          </Tooltip>
        </nav>
        <Tooltip content="Open the guided intake workspace.">
          <a className="pill-btn" href="/request">Start a request</a>
        </Tooltip>
      </header>

      <section className="hero" id="top" data-motion-stage="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow-row"><span>Human-led digital operations</span></div>
            <div className="hero-kicker">
              <span>Websites</span><span>Automations</span><span>Design</span><span>Research</span><span>Operator desk</span>
            </div>
            <h1>Messy digital work, turned into finished outcomes.</h1>
            <p className="subhead">Submit raw intent through an AI-assisted intake. Claw turns it into a structured operator brief, then a human team executes the work through a clear delivery path.</p>
            <div className="clarity-strip">
              {["Send the ask", "Get scope + price", "We build it", "You approve"].map((step) => <span key={step}>{step}</span>)}
            </div>
            <div className="hero-actions">
              <Tooltip content="Open the guided intake workspace.">
                <a className="pill-btn" href="/request">Initiate request</a>
              </Tooltip>
              <a className="outline-btn" href="#deliverables">View capabilities</a>
            </div>
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

      <section className="section intake-terminal" id="intake" data-motion-stage="proof">
        <div className="terminal-copy">
          <small>The interface</small>
          <h2>Native intake terminal.</h2>
          <p>A transparent look at how rough requests become scoped operator work before execution starts.</p>
        </div>
        <div className="terminal-shell" aria-label="Claw Services intake terminal preview">
          <div className="terminal-header">
            <div className="terminal-dots" aria-hidden="true"><span /><span /><span /></div>
            <strong>REQ-8492 // secure connection</strong>
          </div>
          <div className="terminal-grid">
            <div className="terminal-main">
              <label>Outcome objective</label>
              <div className="terminal-objective">“We need a complete tear-down and rebuild of the pricing page to optimize for enterprise conversion. Include new tier structures and a comparison matrix.”</div>
              <div className="terminal-check-grid">
                {terminalChecks.slice(1, 3).map(([label, copy]) => (
                  <div key={label} className="terminal-check">
                    <label>{label}</label>
                    <p>{copy}</p>
                  </div>
                ))}
              </div>
            </div>
            <aside className="terminal-side">
              {terminalChecks.slice(3).map(([label, copy]) => (
                <div key={label} className="terminal-check strong">
                  <label>{label}</label>
                  <p>{copy}</p>
                </div>
              ))}
              <div className="terminal-status"><i /> In progress</div>
            </aside>
          </div>
        </div>
      </section>

      <section className="workflow-motion" id="process" data-motion-stage="process" aria-label="Claw Services workflow progression">
        <div className="workflow-sticky">
          <div className="workflow-head">
            <small>Process</small>
            <h2>Rough ask. Clean brief. Real execution. Approved outcome.</h2>
            <p>Scroll the path. The workflow advances like a signal through the operation — open, unboxed, and easy to understand.</p>
          </div>
          <div className="workflow-stage" aria-label="Request to approval workflow">
            <div className="workflow-rail" aria-hidden="true"><span /></div>
            {pipelineSteps.map(([title, copy], index) => (
              <article
                className="workflow-step"
                data-workflow-state={index === 0 ? "active" : "future"}
                key={title}
                style={{
                  "--step-left": `${index * 30.5}%`,
                  "--step-y": index % 2 === 0 ? "-48px" : "48px",
                  "--step-index": index,
                  "--step-focus": index === 0 ? 1 : 0,
                  "--step-drift": "0px",
                } as CSSProperties}
              >
                <div className="workflow-copy">
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section stock-strip" aria-label="Branded service imagery" data-motion-stage="proof">
        <article className="stock-tile large" style={imageBackedStyle("/stock/premium-workspace.jpg", "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58))")}><b>Premium enough to trust.</b><span>Clean visual systems for local businesses and service teams.</span></article>
        <article className="stock-tile" style={imageBackedStyle("/stock/client-laptop.jpg", "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58))")}><b>Request to brief.</b><span>Clear intake before work starts.</span></article>
        <article className="stock-tile" style={imageBackedStyle("/stock/team-ops.jpg", "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58))")}><b>Human operated.</b><span>Real execution, not vague automation.</span></article>
        <article className="stock-tile" style={imageBackedStyle("/stock/strategy-desk.jpg", "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58))")}><b>Deliverables tracked.</b><span>Scope, updates, review, approval.</span></article>
        <article className="stock-tile" style={imageBackedStyle("/stock/operator-support.jpg", "linear-gradient(180deg, rgba(8,13,29,.04), rgba(8,13,29,.58))")}><b>Support after launch.</b><span>Updates, fixes, and follow-through handled.</span></article>
      </section>

      <section className="section engagement-section" id="ways-to-work" data-motion-stage="packages">
        <h2 className="engagement-title" aria-label="Structured Engagements">
          {engagementTitle}
        </h2>
        <div className="engagement-grid">
          {structuredEngagements.map((engagement) => (
            <article className={`engagement-card ${engagement.variant}`} key={engagement.title}>
              {engagement.badge ? <div className="engagement-badge">{engagement.badge}</div> : null}
              <div className="engagement-chip">{engagement.tier}</div>
              <div>
                <h3>{engagement.title}</h3>
                <p>{engagement.copy}</p>
              </div>
              <div className="engagement-divider" />
              <ul>
                {engagement.items.map((item) => (
                  <li key={item}>
                    <span className="engagement-check" aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="section services-scroll" id="deliverables" data-motion-stage="services">
        <div className="services-sticky">
          <div className="section-head services-head">
            <h2 aria-label="Services Claw can handle.">{servicesTitle}</h2>
            <p aria-label="Websites, intake systems, content, research, and recurring operator support — each scoped into clear deliverables before work starts.">{servicesCopy}</p>
          </div>
          <div className="services-carousel-shell">
            <div className="services-viewport" aria-label="Scroll-reactive services carousel">
              <div className="services-track">
                {servicesShowcase.map((item, index) => (
                  <article
                    className="service-slide"
                    key={item.title}
                    style={{
                      "--slide-delay": `${180 + index * 150}ms`,
                      "--slide-index": index,
                      "--image-delay": `${120 + index * 80}ms`,
                      "--sheen-delay": `${300 + index * 150}ms`,
                    } as CSSProperties}
                  >
                    <div className={`service-photo ${loadedServiceImages[item.image] ? "is-loaded" : ""}`}>
                      <Image
                        src={item.image}
                        alt=""
                        fill
                        sizes="(max-width: 700px) 84vw, (max-width: 1100px) 76vw, 610px"
                        onLoad={() => markServiceImageLoaded(item.image)}
                      />
                      <span>{item.caption}</span>
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
        </div>
      </section>

      <section className="section" id="builder" data-motion-stage="builder">
        <div className="section-head"><small>Interactive work builder</small><h2>Pick a need. See the package, deliverables, and next step.</h2><p>This is the clearest way to show customers that Claw has the solution and can make the process easy.</p></div>
        <div className="builder-wrap">
          <div className="builder-panel">
            <h3>What do you need handled?</h3>
            {(Object.keys(serviceCards) as ServiceKey[]).map((key) => (
              <Tooltip block content={serviceCards[key].tooltip} key={key} placement="bottom">
                <button
                  type="button"
                  className="choice-btn"
                  aria-pressed={active === key}
                  aria-label={`${serviceCards[key].label}. ${serviceCards[key].summary}`}
                  onClick={() => selectActiveService(key)}
                >
                  <b>{serviceCards[key].label}</b>
                  <em>{serviceCards[key].summary}</em>
                </button>
              </Tooltip>
            ))}
          </div>
          <aside className="output-card"><div className="output-top"><h3>{selected.label}</h3><span>{selected.service}</span></div><p>{selected.summary}</p><div className="deliverables">{selected.deliverables.map((item) => <span key={item}>{item}</span>)}</div><div className="output-meta"><span><b>Timeline</b>{selected.timeline}</span><span><b>Client effort</b>{selected.effort}</span><span><b>Next step</b>{selected.next}</span></div></aside>
        </div>
      </section>

      <section className="section" id="system" data-motion-stage="request">
        <div className="section-head"><small>Request system</small><h2>The actual client path: request, brief, queue, fulfill.</h2><p>This React/Next.js version posts to a real API route. With Supabase and Resend env vars set, it saves to Supabase and emails the team; locally it saves to a JSON fallback so the flow works now.</p></div>
        <div className="request-system">
          <aside className="live-queue-card" aria-label="Live queue status preview">
            <div className="live-queue-glow" aria-hidden="true" />
            <div className="live-queue-header">
              <span>Live Queue Status</span>
              <strong><i aria-hidden="true" />Active</strong>
            </div>
            <div className="live-queue-list">
              {liveQueuePreview.map((item) => (
                <div className={`live-queue-item ${item.state}`} key={item.title}>
                  <div className="queue-avatar" aria-hidden="true">{item.initials}</div>
                  <div>
                    <b>{item.title}</b>
                    <span>{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
          <form onSubmit={submitRequest} className="request-form" aria-busy={status === "syncing"}>
            <input name="website" className="honeypot" tabIndex={-1} autoComplete="off" />
            <input name="name" placeholder="Name or business" required />
            <input type="email" name="email" placeholder="Email" required />
            <input name="businessUrl" placeholder="Business website or social link (optional)" />
            <Tooltip block content="Sync the form and package preview." placement="bottom">
              <select name="service" aria-label="Service type" value={selected.service} onChange={(event) => selectActiveService(serviceKeyFromService(event.target.value))}>{serviceOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
            </Tooltip>
            <div className="form-row"><input name="budget" placeholder="Budget range (optional)" /><input name="timeline" placeholder="Timeline (optional)" /></div>
            <textarea name="request" placeholder="What do you need handled?" required minLength={15} />
            <Tooltip block content="Draft the brief and save the request." placement="bottom">
              <button className="pill-btn" disabled={status === "syncing"} aria-busy={status === "syncing"}>{statusCopy}</button>
            </Tooltip>
            <div className="request-status-slot">
              {response && (
                <div
                  className={response.pending ? "notice pending" : response.ok ? "notice success" : "notice error"}
                  role={response.ok ? "status" : "alert"}
                  aria-live={response.ok ? "polite" : "assertive"}
                >
                  <b>
                    {response.pending
                      ? `Brief ready locally — syncing ${response.requestId}...`
                      : response.ok
                        ? response.ignored
                          ? "Request received."
                          : `Request ID: ${response.requestId}`
                        : response.error ?? "Request was not saved."}
                  </b>
                  {response.pending ? (
                    <>
                      <SkeletonText
                        className="sync-skeleton"
                        lines={3}
                        widths={["min(300px, 82%)", "100%", "62%"]}
                        titleFirstLine
                      />
                      <p>Keep this tab open. If the save fails, the draft stays in the form so you can retry.</p>
                    </>
                  ) : null}
                  {response.brief && <p>{response.brief}</p>}
                  {response.storage && <p>Storage: {response.storage.mode}</p>}
                  {response.email && <p>Email: {response.email.sent ? "sent" : response.email.reason}</p>}
                </div>
              )}
            </div>
          </form>
        </div>
      </section>

      <footer>Claw Services · AI-assisted intake, human-operated delivery. <span>Next.js + Supabase + Resend request desk.</span></footer>
    </main>
  );
}
