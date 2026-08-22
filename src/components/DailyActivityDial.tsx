import { useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Timer,
  Pill,
  Footprints,
  Dumbbell,
  Flower2,
  Droplet,
  Activity,
  Heart,
  Wind,
  ChevronsUp,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  type LucideIcon,
} from "lucide-react";

export interface DialRingItem {
  key: string;
  label: string;
  ratio: number; // 0..1
  color: string;
  hint?: string;
  /** Pillar not unlocked for this user's plan — shown greyed out, not counted. */
  disabled?: boolean;
  /** Optional panel revealed under this legend row when its arrow is tapped. */
  expanded?: ReactNode;
}


interface Props {
  items: DialRingItem[];
  title?: string;
  size?: "md" | "lg";
}

const ICONS: Record<string, LucideIcon> = {
  fasting: Timer,
  supplements: Pill,
  movement: Footprints,
  exercise: Dumbbell,
  yoga: Flower2,
  water: Droplet,
  diabetes: Activity,
  breath: Wind,
  soleus: ChevronsUp,
};

// SVG viewBox: 240x240, centered at (120, 120).
const VB = 240;
const CENTER = VB / 2;

/**
 * Compute geometry so any ring count (1..10+) fits inside the viewBox.
 * Everything is derived OUTWARD-IN from the tick track so the icon chips
 * always sit on one clean circle just outside the outermost ring and never
 * spill outside the dial.
 */
function computeGeometry(n: number) {
  const tickOuter = 118; // hard edge of the viewBox (240/2 = 120)
  const tickInner = tickOuter - 8;

  const iconChip = n <= 5 ? 30 : n <= 7 ? 26 : 23;
  const iconRadius = tickInner - iconChip / 2 - 5;

  // Base stroke tapers with ring count so rings never crowd each other.
  let stroke =
    n <= 2 ? 14 : n <= 3 ? 12 : n <= 4 ? 10 : n <= 5 ? 9 : n <= 6 ? 8 : n <= 7 ? 7 : n <= 8 ? 6 : 5;

  const OUTER_RADIUS = iconRadius - iconChip / 2 - stroke / 2 - 5;
  const INNER_RESERVED = n >= 8 ? 32 : 38; // room for the center readout

  const span = OUTER_RADIUS - INNER_RESERVED;
  let gap = n > 1 ? span / (n - 1) : 0;

  // Guarantee non-overlap: gap must clear the stroke width.
  if (n > 1 && gap < stroke + 0.5) {
    while (stroke > 3 && gap < stroke + 0.5) stroke -= 1;
  }

  return { OUTER_RADIUS, INNER_RESERVED, stroke, gap, iconChip, iconRadius, tickInner, tickOuter };
}


export default function DailyActivityDial({
  items,
  title = "Daily activity",
  size = "md",
}: Props) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const safe = items.filter((i) => Number.isFinite(i.ratio));
  const active = safe.filter((i) => !i.disabled);
  const n = active.length;
  const done = active.filter((i) => i.ratio >= 1).length;
  const allDone = n > 0 && done === n;

  const geo = computeGeometry(Math.max(safe.length, 1));


  return (
    <motion.div
      className={`liquid-glass rounded-3xl relative overflow-hidden ${
        size === "lg" ? "p-6 md:p-7" : "p-5"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted-foreground">
            Today
          </p>
          <h3 className="text-foreground font-black text-[15px] sm:text-base leading-tight">
            {title}
          </h3>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black text-foreground leading-none tabular-nums">
            {done}
            <span className="text-sm text-muted-foreground font-bold">/{n}</span>
          </p>
          <p className="text-[10px] text-muted-foreground font-medium mt-0.5 whitespace-nowrap">
            {allDone ? "All complete" : "in progress"}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-5 lg:gap-6">
        <div
          className={`relative shrink-0 mx-auto lg:mx-0 ${
            size === "lg"
              ? "w-[min(78vw,280px)] h-[min(78vw,280px)] lg:w-[300px] lg:h-[300px]"
              : "w-[min(72vw,230px)] h-[min(72vw,230px)]"
          }`}
        >
          <svg
            viewBox={`0 0 ${VB} ${VB}`}
            className="w-full h-full overflow-visible"
            aria-hidden="true"
          >
            {/* Tick marks around the outer dial */}
            {Array.from({ length: 60 }).map((_, i) => {
              const angle = (i / 60) * Math.PI * 2 - Math.PI / 2;
              const major = i % 5 === 0;
              const r1 = geo.tickInner;
              const r2 = geo.tickInner + (major ? geo.tickOuter - geo.tickInner : (geo.tickOuter - geo.tickInner) * 0.6);
              return (
                <line
                  key={`tick-${i}`}
                  x1={CENTER + Math.cos(angle) * r1}
                  y1={CENTER + Math.sin(angle) * r1}
                  x2={CENTER + Math.cos(angle) * r2}
                  y2={CENTER + Math.sin(angle) * r2}
                  stroke="hsl(var(--muted-foreground))"
                  strokeOpacity={major ? 0.35 : 0.15}
                  strokeWidth={major ? 1.2 : 0.7}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Concentric progress rings */}
            {safe.map((it, i) => {
              const r = geo.OUTER_RADIUS - i * geo.gap;
              if (r < geo.INNER_RESERVED - geo.stroke / 2) return null;
              const circ = 2 * Math.PI * r;
              const pct = Math.max(0, Math.min(1, it.ratio));
              if (it.disabled) {
                return (
                  <circle
                    key={`ring-${it.key}`}
                    cx={CENTER}
                    cy={CENTER}
                    r={r}
                    fill="none"
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.14}
                    strokeWidth={geo.stroke}
                    strokeDasharray="2 5"
                    strokeLinecap="round"
                  />
                );
              }
              return (
                <g key={`ring-${it.key}`}>
                  <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={r}
                    fill="none"
                    stroke={it.color}
                    strokeOpacity={0.15}
                    strokeWidth={geo.stroke}
                  />
                  <motion.circle
                    cx={CENTER}
                    cy={CENTER}
                    r={r}
                    fill="none"
                    stroke={it.color}
                    strokeWidth={geo.stroke}
                    strokeLinecap="round"
                    strokeDasharray={circ}
                    initial={{ strokeDashoffset: circ }}
                    animate={{ strokeDashoffset: circ * (1 - pct) }}
                    transition={{
                      delay: 0.1 + Math.min(i, 6) * 0.05,
                      duration: 0.6,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    transform={`rotate(-90 ${CENTER} ${CENTER})`}
                    style={{
                      filter: pct >= 1 ? `drop-shadow(0 0 5px ${it.color}88)` : undefined,
                    }}
                  />
                </g>
              );
            })}


            {/* Center readout drawn as SVG so it scales with the dial */}
            <g>
              <text
                x={CENTER}
                y={CENTER - 4}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-foreground"
                style={{
                  fontSize: 22,
                  fontWeight: 900,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "-0.02em",
                }}
              >
                <tspan>{done}</tspan>
                <tspan
                  className="fill-muted-foreground"
                  dy="-2"
                  style={{ fontSize: 12, fontWeight: 700 }}
                >
                  /{n}
                </tspan>
              </text>
              <text
                x={CENTER}
                y={CENTER + 12}
                textAnchor="middle"
                dominantBaseline="central"
                className={allDone ? "" : "fill-muted-foreground"}
                style={{
                  fontSize: 6.5,
                  fontWeight: 800,
                  letterSpacing: "0.18em",
                  fill: allDone ? "var(--bbdo-red)" : undefined,
                }}
              >
                {allDone ? "COMPLETE" : "PILLARS"}
              </text>
            </g>

            {/* Icon chips — drawn inside the SVG so they always sit exactly on
                the same circle as the rings, on every screen size. */}
            {safe.map((it, i) => {
              const angle = (i / Math.max(safe.length, 1)) * Math.PI * 2 - Math.PI / 2;
              const x = CENTER + Math.cos(angle) * geo.iconRadius;
              const y = CENTER + Math.sin(angle) * geo.iconRadius;
              const Icon = ICONS[it.key] ?? Heart;
              const complete = !it.disabled && it.ratio >= 1;
              const inProgress = !it.disabled && it.ratio > 0 && it.ratio < 1;
              const r = geo.iconChip / 2;
              const glyph = geo.iconChip * 0.52;
              const glyphColor = it.disabled
                ? "#CBD5E1"
                : complete
                  ? it.color
                  : inProgress
                    ? it.color
                    : "#94A3B8";
              return (
                <g key={`chip-${it.key}`} opacity={it.disabled ? 0.55 : 1}>
                  <title>{`${it.label}${it.disabled ? " · Not unlocked" : it.hint ? ` · ${it.hint}` : ""}`}</title>
                  <circle
                    cx={x}
                    cy={y}
                    r={r}
                    fill="#ffffff"
                    stroke={complete ? it.color : "hsl(var(--border))"}
                    strokeWidth={complete ? 1.6 : 1}
                    strokeDasharray={it.disabled ? "2 3" : undefined}
                  />
                  <Icon
                    x={x - glyph / 2}
                    y={y - glyph / 2}
                    width={glyph}
                    height={glyph}
                    color={glyphColor}
                    opacity={inProgress ? 0.75 : 1}
                    strokeWidth={2.4}
                  />
                </g>
              );
            })}

          </svg>
        </div>


        {/* Legend */}
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-2">
          {safe.map((it) => {
            const disabled = !!it.disabled;
            const complete = !disabled && it.ratio >= 1;
            const inProgress = !disabled && it.ratio > 0 && it.ratio < 1;
            const pct = Math.round(Math.max(0, Math.min(1, it.ratio)) * 100);
            const Icon = ICONS[it.key] ?? Heart;
            const accent = complete ? it.color : inProgress ? `${it.color}CC` : undefined;
            const open = openKey === it.key;
            return (
              <div key={`leg-${it.key}`} className="min-w-0">
              <div
                className={`flex items-center gap-2 min-w-0 ${disabled ? "opacity-55" : ""}`}
              >
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: complete
                      ? `${it.color}18`
                      : inProgress
                        ? `${it.color}0F`
                        : "hsl(var(--muted))",
                  }}
                >
                  <Icon
                    className="w-3 h-3"
                    style={{ color: disabled ? "#CBD5E1" : (accent ?? "#94A3B8") }}
                    strokeWidth={2.6}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_66px_28px] items-center gap-1">
                    <span
                      className="min-w-0 truncate pr-1 text-[11px] font-bold"
                      style={{ color: disabled ? "hsl(var(--muted-foreground))" : (accent ?? "hsl(var(--foreground))") }}
                    >
                      {it.label}
                    </span>
                    <span
                      className="inline-flex w-[66px] shrink-0 items-center justify-end whitespace-nowrap text-[10px] font-black tabular-nums"
                      style={{
                        color: complete ? it.color : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {disabled ? (
                        "Not unlocked"
                      ) : complete ? (
                        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.4} />
                      ) : (
                        `${pct}%`
                      )}
                    </span>
                    {/* Keep every arrow in one right-side column, inset slightly from the edge. */}
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                      {!disabled && it.expanded && (
                        <button
                          type="button"
                          onClick={() => setOpenKey(open ? null : it.key)}
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} ${it.label} details`}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-white transition-transform"
                          style={{ backgroundColor: it.color, transform: open ? "rotate(90deg)" : undefined }}
                        >
                          <ChevronRight className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                      )}
                    </span>
                  </div>

                  {(disabled || it.hint) && (
                    <p className="text-[9px] text-muted-foreground font-medium truncate">
                      {disabled ? "Not part of your plan yet" : it.hint}
                    </p>
                  )}
                </div>

              </div>
              {open && it.expanded}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
