import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * ResponsiveGrid — CSS grid that auto-fits between a min column width and
 * available space. Because it's driven by the actual column min-width (not a
 * viewport breakpoint) it collapses correctly inside sheets, split views,
 * iPad multitasking, and foldables.
 *
 * Cards inside inherit equal height by default (align-stretch on rows).
 */
export interface ResponsiveGridProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Minimum column width. Below this the grid collapses to fewer columns. */
  minColWidth?: number;
  /** Gap in px (default 12). */
  gap?: number;
  /** Cap the number of columns (default unbounded). */
  maxCols?: number;
}

export const ResponsiveGrid = React.forwardRef<HTMLDivElement, ResponsiveGridProps>(
  ({ minColWidth = 160, gap = 12, maxCols, className, style, children, ...rest }, ref) => {
    const template = maxCols
      ? `repeat(auto-fit, minmax(max(${minColWidth}px, calc((100% - ${(maxCols - 1) * gap}px) / ${maxCols})), 1fr))`
      : `repeat(auto-fit, minmax(${minColWidth}px, 1fr))`;
    return (
      <div
        ref={ref}
        className={cn("grid w-full items-stretch", className)}
        style={{ gridTemplateColumns: template, gap: `${gap}px`, ...style }}
        {...rest}
      >
        {children}
      </div>
    );
  },
);
ResponsiveGrid.displayName = "ResponsiveGrid";

export default ResponsiveGrid;
