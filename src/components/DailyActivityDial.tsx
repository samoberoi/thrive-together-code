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
 * Compute geometry so any ring count (1..10+) fits without overlap.
 * - Rings live between INNER_RESERVED and OUTER_RADIUS.
 * - Stroke and gap scale down as `n` grows.
 * - Icon chips sit on a track outside the outermost ring.
 * - Tick marks sit outside the icon track.
 */
function computeGeometry(n: number) {
  const OUTER_RADIUS = 88; // center of outermost ring
  const INNER_RESERVED = 40; // room for the center readout — must clear the biggest text

  // Base stroke tapers with ring count so rings never crowd each other.
  let stroke =
    n <= 2 ? 14 : n <= 3 ? 12 : n <= 4 ? 10 : n <= 5 ? 9 : n <= 6 ? 8 : n <= 7 ? 7 : n <= 8 ? 6 : 5;

  const span = OUTER_RADIUS - INNER_RESERVED;
  let gap = n > 1 ? span / (n - 1) : 0;

  // Guarantee non-overlap: gap must exceed stroke + 1px breathing room.
  if (n > 1 && gap < stroke + 1) {
    while (stroke > 4 && gap < stroke + 1) stroke -= 1;
  }

  const iconChip = n <= 5 ? 30 : n <= 7 ? 28 : 24;
  const iconOffset = stroke / 2 + iconChip / 2 + 4;
  const iconRadius = OUTER_RADIUS + iconOffset;
  const tickInner = iconRadius + iconChip / 2 + 4;
  const tickOuter = tickInner + 8;

  return { OUTER_RADIUS, INNER_RESERVED, stroke, gap, iconChip, iconRadius, tickInner, tickOuter };
}

export default function DailyActivityDial({
  items,
  title = "Daily activity",
  size = "md",
}: Props) {
  const safe = items.filter((i) => Number.isFinite(i.ratio));
  const n = safe.length;
  const done = safe.filter((i) => i.ratio >= 1).length;
  const allDone = n > 0 && done === n;

  const geo = computeGeometry(Math.max(n, 1));

  // Ratio to convert SVG units to % for absolutely-positioned icon chips.
  const toPct = (svgVal: number) => (svgVal / VB) * 100;

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
          </svg>

          {/* Icon chips positioned around the outer dial */}
          {safe.map((it, i) => {
            const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2;
            const x = CENTER + Math.cos(angle) * geo.iconRadius;
            const y = CENTER + Math.sin(angle) * geo.iconRadius;
            const Icon = ICONS[it.key] ?? Heart;
            const complete = it.ratio >= 1;
            return (
              <motion.div
                key={`chip-${it.key}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-white flex items-center justify-center border"
                style={{
                  left: `${toPct(x)}%`,
                  top: `${toPct(y)}%`,
                  width: `${(geo.iconChip / VB) * 100}%`,
                  height: `${(geo.iconChip / VB) * 100}%`,
                  borderColor: complete ? it.color : "hsl(var(--border))",
                  boxShadow: complete
                    ? `0 4px 10px ${it.color}55, 0 1px 2px rgba(15,26,61,0.08)`
                    : "0 1px 3px rgba(15,26,61,0.08)",
                }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.3 + Math.min(i, 6) * 0.04,
                  duration: 0.22,
                  ease: [0.22, 1, 0.36, 1],
                }}
                title={`${it.label}${it.hint ? ` · ${it.hint}` : ""}`}
              >
                <Icon
                  style={{
                    color: complete ? it.color : "#94A3B8",
                    width: "55%",
                    height: "55%",
                  }}
                  strokeWidth={2.4}
                />
              </motion.div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-2">
          {safe.map((it) => {
            const complete = it.ratio >= 1;
            const pct = Math.round(Math.max(0, Math.min(1, it.ratio)) * 100);
            const Icon = ICONS[it.key] ?? Heart;
            return (
              <div key={`leg-${it.key}`} className="flex items-center gap-2 min-w-0">
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: complete ? `${it.color}18` : "hsl(var(--muted))",
                  }}
                >
                  <Icon
                    className="w-3 h-3"
                    style={{ color: complete ? it.color : "#94A3B8" }}
                    strokeWidth={2.6}
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-bold text-foreground truncate">
                      {it.label}
                    </span>
                    <span
                      className="text-[10px] font-black tabular-nums shrink-0"
                      style={{
                        color: complete ? it.color : "hsl(var(--muted-foreground))",
                      }}
                    >
                      {complete ? (
                        <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={2.4} />
                      ) : (
                        `${pct}%`
                      )}
                    </span>
                  </div>
                  {it.hint && (
                    <p className="text-[9px] text-muted-foreground font-medium truncate">
                      {it.hint}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
