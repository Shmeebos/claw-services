type ClawHandMarkProps = {
  animated?: boolean;
  className?: string;
};

type ClawBrandLogoProps = {
  className?: string;
};

export function ClawHandMark({ animated = false, className = "" }: ClawHandMarkProps) {
  const motionClass = animated ? "is-pressing" : "";
  const classes = ["claw-hand-mark", motionClass, className].filter(Boolean).join(" ");

  return (
    <svg
      aria-hidden="true"
      className={classes}
      focusable="false"
      viewBox="0 0 96 72"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g className="claw-mark-hand">
        <path className="claw-mark-hand-line claw-mark-claw-left" d="M28 13C34 22 34 32 28 40" />
        <path className="claw-mark-hand-line claw-mark-claw-center" d="M48 9C54 20 54 31 48 41" />
        <path className="claw-mark-hand-line claw-mark-claw-right" d="M68 13C62 22 62 32 68 40" />
      </g>
      <g className="claw-mark-bell">
        <path className="claw-mark-bell-line claw-mark-bell-knob" d="M48 31V36" />
        <path className="claw-mark-bell-line claw-mark-bell-dome" d="M32 54C32 43 38 36 48 36C58 36 64 43 64 54" />
        <path className="claw-mark-bell-line claw-mark-bell-rim" d="M27 57H69" />
        <path className="claw-mark-bell-line claw-mark-bell-base" d="M38 64H58" />
      </g>
      <path className="claw-mark-ring-ray" d="M70 33L78 25" />
    </svg>
  );
}

export function ClawBrandLogo({ className = "" }: ClawBrandLogoProps) {
  const classes = ["claw-brand-logo", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <ClawHandMark />
      <span className="claw-wordmark" aria-hidden="true">
        <span>Claw</span>
        <span>Services</span>
      </span>
    </span>
  );
}
