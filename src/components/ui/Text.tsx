import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Text — typography primitive bound to the fluid type scale in index.css.
 * Variants map to design-system tokens so every screen has consistent
 * hierarchy without hardcoded font sizes.
 */
export type TextVariant =
  | "display"
  | "heading"
  | "subhead"
  | "body"
  | "bodyStrong"
  | "caption"
  | "label"
  | "overline";

const variantClass: Record<TextVariant, string> = {
  display: "text-[var(--fs-display)] leading-[1.02] tracking-[-0.03em] font-semibold text-[color:var(--bbdo-ink)]",
  heading: "text-[var(--fs-heading)] leading-[1.1] tracking-[-0.025em] font-semibold text-[color:var(--bbdo-ink)]",
  subhead: "text-[var(--fs-subhead)] leading-[1.25] tracking-[-0.01em] font-semibold text-[color:var(--bbdo-ink)]",
  body: "text-[var(--fs-body)] leading-[1.45] text-[color:var(--bbdo-ink)]",
  bodyStrong: "text-[var(--fs-body)] leading-[1.45] font-semibold text-[color:var(--bbdo-ink)]",
  caption: "text-[var(--fs-caption)] leading-[1.35] text-[color:var(--bbdo-ink-soft)]",
  label: "text-[var(--fs-caption)] leading-[1.2] font-semibold text-[color:var(--bbdo-ink)]",
  overline: "text-[10px] leading-[1.2] font-bold uppercase tracking-[0.16em] text-[color:var(--bbdo-ink-soft)]",
};

type ElementTag = "p" | "span" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "label";

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  variant?: TextVariant;
  as?: ElementTag;
  /** Truncate to N lines with ellipsis. */
  lines?: number;
  /** Prevent mid-word breaking; falls back to shrink+ellipsis when needed. */
  noBreak?: boolean;
}

export const Text = React.forwardRef<HTMLElement, TextProps>(
  ({ variant = "body", as = "p", lines, noBreak, className, style, children, ...rest }, ref) => {
    const Tag = as as any;
    const clampStyle =
      lines && lines > 1
        ? {
            display: "-webkit-box",
            WebkitLineClamp: lines,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden",
          }
        : lines === 1
          ? { whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }
          : undefined;
    return (
      <Tag
        ref={ref}
        className={cn(variantClass[variant], noBreak && "no-break", className)}
        style={{ ...clampStyle, ...style }}
        {...rest}
      >
        {children}
      </Tag>
    );
  },
);
Text.displayName = "Text";

export default Text;
