"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

type FlowStep = readonly [string, string];

type FlowCubeProps = {
  steps: readonly FlowStep[];
};

export function FlowCube({ steps }: FlowCubeProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let frame = 0;

    const update = () => {
      const section = sectionRef.current;
      if (!section) return;

      const rect = section.getBoundingClientRect();
      const scrollable = Math.max(1, rect.height - window.innerHeight);
      const progress = Math.min(1, Math.max(0, -rect.top / scrollable));
      const nextIndex = Math.min(steps.length - 1, Math.max(0, Math.round(progress * (steps.length - 1))));

      section.style.setProperty("--cube-rotation", `${progress * -270}deg`);
      section.style.setProperty("--cube-progress", progress.toFixed(4));
      setActiveIndex((current) => (current === nextIndex ? current : nextIndex));
    };

    const requestUpdate = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    requestUpdate();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, [steps.length]);

  return (
    <section ref={sectionRef} className={styles.flowBand} id="flow" aria-label="Portal delivery flow">
      <div className={styles.flowCubeSticky}>
        <div className={styles.flowConsoleGlow} aria-hidden="true" />
        <div className={styles.flowCubeIntro}>
          <p className={styles.kicker}>Delivery flow</p>
          <h2>From raw intent to approved artifact.</h2>
          <div className={styles.flowCubeTerminal} aria-hidden="true">
            <span>request console</span>
            <b>scroll to rotate</b>
          </div>
        </div>

        <div className={styles.flowCubeStage}>
          <div className={styles.flowCubeChrome} aria-hidden="true">
            <span />
            <span />
            <span />
            <b>FLOW-CUBE</b>
          </div>
          <div className={styles.flowCubeScene}>
            <div className={styles.flowCube}>
              {steps.map(([title, copy], index) => (
                <article
                  className={`${styles.flowCubeFace} ${activeIndex === index ? styles.isActive : ""}`}
                  key={title}
                  style={{
                    "--face-index": index,
                    transform: `rotateY(${index * 90}deg) translateZ(var(--cube-depth))`,
                  } as CSSProperties}
                  aria-hidden={activeIndex !== index}
                >
                  <div className={styles.flowCubeFaceInner}>
                    <span className={styles.flowCubeIndex}>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3>{title}</h3>
                      <p>{copy}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <ol className={styles.flowCubeProgress} aria-label="Delivery flow steps">
          {steps.map(([title], index) => (
            <li className={activeIndex === index ? styles.isActive : ""} key={title}>
              <span />
              <b>{title}</b>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
