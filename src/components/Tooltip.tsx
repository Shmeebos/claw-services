"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from "react";
import styles from "./Tooltip.module.css";

type TooltipTriggerProps = {
  "aria-describedby"?: string;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void;
  onMouseLeave?: (event: MouseEvent<HTMLElement>) => void;
};

type TooltipProps = {
  children: ReactElement<TooltipTriggerProps>;
  content: string;
  placement?: "top" | "bottom";
  block?: boolean;
};

/**
 * Accessible tooltip wrapper for concise helper text on buttons and icon controls.
 *
 * Behavior:
 * - The trigger keeps its own accessible name; tooltip copy is connected with aria-describedby only.
 * - Opens from keyboard focus and fine-pointer hover, closes on blur/mouseleave, and Escape dismisses it.
 * - The tooltip never receives focus and does not trap focus.
 * - On coarse pointers/touch layouts the visual bubble is suppressed with CSS to avoid mobile clutter.
 */
export function Tooltip({ children, content, placement = "top", block = false }: TooltipProps) {
  const generatedId = useId();
  const tooltipId = `tooltip-${generatedId.replace(/:/g, "")}`;
  const [canHover, setCanHover] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const syncHoverCapability = () => setCanHover(media.matches);

    syncHoverCapability();
    media.addEventListener("change", syncHoverCapability);
    return () => media.removeEventListener("change", syncHoverCapability);
  }, []);

  const trigger = Children.only(children);
  const tooltipText = content.trim();
  const isOpen = Boolean(tooltipText && !isDismissed && (isFocused || (canHover && isHovered)));

  const describedBy = useMemo(() => {
    const existingDescription = trigger.props["aria-describedby"];
    return [existingDescription, tooltipId].filter(Boolean).join(" ") || undefined;
  }, [tooltipId, trigger.props]);

  if (!isValidElement<TooltipTriggerProps>(trigger) || !tooltipText) {
    return trigger;
  }

  const tooltipTrigger = cloneElement(trigger, {
    "aria-describedby": describedBy,
    onBlur: (event: FocusEvent<HTMLElement>) => {
      trigger.props.onBlur?.(event);
      setIsFocused(false);
      setIsDismissed(false);
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      trigger.props.onFocus?.(event);
      setIsFocused(true);
      setIsDismissed(false);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      trigger.props.onKeyDown?.(event);
      if (event.key === "Escape") {
        setIsDismissed(true);
      }
    },
    onMouseEnter: (event: MouseEvent<HTMLElement>) => {
      trigger.props.onMouseEnter?.(event);
      setIsHovered(true);
      setIsDismissed(false);
    },
    onMouseLeave: (event: MouseEvent<HTMLElement>) => {
      trigger.props.onMouseLeave?.(event);
      setIsHovered(false);
      setIsDismissed(false);
    },
  });

  return (
    <span
      className={`${styles.root} ${block ? styles.block : ""}`}
      data-dismissed={isDismissed ? "true" : undefined}
      data-placement={placement}
      data-state={isOpen ? "open" : "closed"}
    >
      {tooltipTrigger}
      <span className={styles.bubble} id={tooltipId} role="tooltip">
        {tooltipText}
      </span>
    </span>
  );
}
