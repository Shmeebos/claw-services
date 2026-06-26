import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

type SkeletonTone = "light" | "dark";
type SkeletonLineVariant = "body" | "eyebrow" | "title" | "heading" | "short";
type SkeletonMediaVariant = "image" | "service" | "card" | "hero" | "section";

type Dimension = CSSProperties["width"];

const classNames = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const lineVariantClass: Record<SkeletonLineVariant, string | undefined> = {
  body: undefined,
  eyebrow: "skeleton-eyebrow",
  title: "skeleton-line-title",
  heading: "skeleton-heading",
  short: "skeleton-line-short",
};

/**
 * Shared Claw skeleton primitives.
 *
 * Integration rules:
 * - Skeleton blocks are decorative by default (`aria-hidden="true"`). Put `aria-busy`
 *   on the real region that is loading, not on every placeholder row.
 * - Use `tone="dark"` or `.skeleton-dark` inside navy panels so the token set changes
 *   without one-off colors.
 * - Pass explicit width/height/minHeight/aspectRatio when a final component has a stable
 *   dimension. Do not let loading states change layout height.
 * - Shimmer is disabled globally by the app stylesheet for `prefers-reduced-motion`.
 */
export type SkeletonBlockProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  width?: Dimension;
  height?: CSSProperties["height"];
  minHeight?: CSSProperties["minHeight"];
  radius?: CSSProperties["borderRadius"];
  aspectRatio?: CSSProperties["aspectRatio"];
  strong?: boolean;
};

export function SkeletonBlock({
  className,
  width,
  height,
  minHeight,
  radius,
  aspectRatio,
  strong = false,
  style,
  ...props
}: SkeletonBlockProps) {
  const blockStyle: CSSProperties = { ...style };

  if (width !== undefined) blockStyle.width = width;
  if (height !== undefined) blockStyle.height = height;
  if (minHeight !== undefined) blockStyle.minHeight = minHeight;
  if (radius !== undefined) blockStyle.borderRadius = radius;
  if (aspectRatio !== undefined) blockStyle.aspectRatio = aspectRatio;

  return (
    <span
      aria-hidden="true"
      {...props}
      className={classNames("skeleton-block", strong && "skeleton-strong", className)}
      style={blockStyle}
    />
  );
}

export type SkeletonLineProps = SkeletonBlockProps & {
  variant?: SkeletonLineVariant;
};

export function SkeletonLine({ variant = "body", className, ...props }: SkeletonLineProps) {
  return (
    <SkeletonBlock
      {...props}
      className={classNames("skeleton-line", lineVariantClass[variant], className)}
    />
  );
}

export type SkeletonTextProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  lines?: number;
  widths?: Dimension[];
  titleFirstLine?: boolean;
  centered?: boolean;
  lineClassName?: string;
};

export function SkeletonText({
  lines = 3,
  widths,
  titleFirstLine = false,
  centered = false,
  lineClassName,
  className,
  ...props
}: SkeletonTextProps) {
  const safeLineCount = Math.max(1, lines);
  const fallbackWidths: Dimension[] = safeLineCount === 1 ? ["72%"] : ["100%", "92%", "68%"];
  const widthPattern = widths?.length ? widths : fallbackWidths;

  return (
    <div
      aria-hidden="true"
      {...props}
      className={classNames("skeleton-text", centered && "skeleton-text-centered", className)}
    >
      {Array.from({ length: safeLineCount }, (_, index) => {
        const isLast = index === safeLineCount - 1;
        const variant: SkeletonLineVariant = titleFirstLine && index === 0 ? "title" : isLast ? "short" : "body";

        return (
          <SkeletonLine
            className={lineClassName}
            key={index}
            variant={variant}
            width={widthPattern[index % widthPattern.length]}
          />
        );
      })}
    </div>
  );
}

export type SkeletonButtonProps = SkeletonBlockProps & {
  secondary?: boolean;
};

export function SkeletonButton({ className, secondary = false, ...props }: SkeletonButtonProps) {
  return <SkeletonBlock {...props} className={classNames("skeleton-button", secondary && "secondary", className)} />;
}

export type SkeletonMediaProps = SkeletonBlockProps & {
  variant?: SkeletonMediaVariant;
};

export function SkeletonMedia({ variant = "image", className, strong = true, ...props }: SkeletonMediaProps) {
  return (
    <SkeletonBlock
      {...props}
      strong={strong}
      className={classNames("skeleton-media", `skeleton-media-${variant}`, className)}
    />
  );
}

export type SkeletonCardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SkeletonTone;
  lines?: number;
  withButton?: boolean;
  children?: ReactNode;
};

export function SkeletonCard({
  tone = "light",
  lines = 3,
  withButton = false,
  children,
  className,
  ...props
}: SkeletonCardProps) {
  return (
    <div
      aria-hidden="true"
      data-skeleton-tone={tone}
      {...props}
      className={classNames("skeleton-card", "skeleton-surface", tone === "dark" && "skeleton-dark", className)}
    >
      {children ?? (
        <>
          <SkeletonLine variant="eyebrow" />
          <SkeletonText lines={lines} titleFirstLine />
          {withButton ? <SkeletonButton width="min(168px, 72%)" /> : null}
        </>
      )}
    </div>
  );
}

export type SkeletonRowProps = HTMLAttributes<HTMLDivElement> & {
  tone?: SkeletonTone;
  leading?: boolean;
  trailing?: boolean;
  lines?: 1 | 2 | 3;
};

export function SkeletonRow({
  tone = "light",
  leading = true,
  trailing = true,
  lines = 1,
  className,
  ...props
}: SkeletonRowProps) {
  return (
    <div
      aria-hidden="true"
      data-skeleton-tone={tone}
      {...props}
      className={classNames("skeleton-row", lines > 1 && "skeleton-row-multiline", tone === "dark" && "skeleton-dark", className)}
    >
      {leading ? <SkeletonBlock className="skeleton-dot" /> : null}
      <SkeletonText lines={lines} widths={lines > 1 ? ["82%", "54%"] : ["72%"]} />
      {trailing ? <SkeletonBlock className="skeleton-value" /> : null}
    </div>
  );
}

export type SkeletonGridProps = Omit<HTMLAttributes<HTMLDivElement>, "children"> & {
  items?: number;
  columns?: number;
  tone?: SkeletonTone;
  renderItem?: (index: number) => ReactNode;
};

export function SkeletonGrid({
  items = 3,
  columns = 3,
  tone = "light",
  renderItem,
  className,
  style,
  ...props
}: SkeletonGridProps) {
  const gridStyle = {
    "--skeleton-grid-columns": String(columns),
    ...style,
  } as CSSProperties;

  return (
    <div
      aria-hidden="true"
      data-skeleton-tone={tone}
      {...props}
      className={classNames("skeleton-grid", tone === "dark" && "skeleton-dark", className)}
      style={gridStyle}
    >
      {Array.from({ length: Math.max(1, items) }, (_, index) =>
        renderItem ? renderItem(index) : <SkeletonCard key={index} tone={tone} />,
      )}
    </div>
  );
}

export type SkeletonSectionProps = HTMLAttributes<HTMLElement> & {
  label: string;
  tone?: SkeletonTone;
  headingLines?: number;
  children?: ReactNode;
};

export function SkeletonSection({
  label,
  tone = "light",
  headingLines = 2,
  children,
  className,
  ...props
}: SkeletonSectionProps) {
  const { "aria-label": ariaLabel, "aria-busy": ariaBusy, ...sectionProps } = props;

  return (
    <section
      aria-busy={ariaBusy ?? true}
      aria-label={ariaLabel ?? label}
      data-skeleton-tone={tone}
      {...sectionProps}
      className={classNames("skeleton-section", tone === "dark" && "skeleton-dark", className)}
    >
      <div className="skeleton-section-head">
        <SkeletonText lines={headingLines} titleFirstLine />
      </div>
      {children}
    </section>
  );
}
