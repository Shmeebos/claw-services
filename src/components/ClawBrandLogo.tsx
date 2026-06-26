type ClawHandMarkProps = {
  animated?: boolean;
  className?: string;
};

type ClawBrandLogoProps = {
  className?: string;
};

export function ClawHandMark({ animated = false, className = "" }: ClawHandMarkProps) {
  const motionClass = animated ? "is-pressing" : "is-floating";
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
        <path className="claw-mark-hand-line claw-mark-arm" d="M14 18V45H35" />
        <path className="claw-mark-hand-line claw-mark-palm" d="M28 18H43L55 14L77 21L76 27H63L52 24L40 31H28" />
        <path className="claw-mark-hand-line claw-mark-finger" d="M35 45L46 38H69" />
      </g>
      <g className="claw-mark-bell">
        <path className="claw-mark-bell-line claw-mark-bell-knob" d="M70 32V38" />
        <path className="claw-mark-bell-line claw-mark-bell-dome" d="M57 52C57 44 62 38 70 38C78 38 83 44 83 52" />
        <path className="claw-mark-bell-line claw-mark-bell-rim" d="M53 57H87" />
        <path className="claw-mark-bell-line claw-mark-bell-base" d="M59 64H81" />
      </g>
      <path className="claw-mark-ring-ray" d="M83 37L89 31" />
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
