import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, TrendingUp, TrendingDown } from "lucide-react";
import { getUser } from "@/lib/userStore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import SoundToggle from "@/components/SoundToggle";
import { HeroCard } from "@/components/ui/HeroCard";
import { setPhase, setIntensity } from "@/lib/musicEngine";

export default function TrajectoryScreen() {
  const navigate = useNavigate();
  const user = getUser();
  const score = user.assessment?.healthScore ?? 72;

  useEffect(() => {
    setPhase("power");
    setIntensity("high");
  }, []);

  // Build wavy trajectories with subtle oscillation so the lines feel organic
  // rather than mechanically straight. Two futures diverge over 18 months.
  const data = useMemo(() => {
    const months = ["Now", "3m", "6m", "9m", "12m", "15m", "18m"];
    return months.map((m, i) => {
      const t = i / (months.length - 1);
      // Sine wave adds natural rhythm to both curves
      const waveA = Math.sin(i * 0.9) * 3.2;
      const waveB = Math.sin(i * 0.75 + 0.6) * 2.4;
      // "Without change" — gentle decline with small dips
      const current = Math.max(8, Math.round(score - t * 32 + waveA));
      // "Continue with BBDO" — accelerating rise with a soft S-curve
      const improved = Math.min(
        98,
        Math.round(score + (100 - score) * (1 - Math.pow(1 - t, 2.2)) + waveB),
      );
      return { month: m, current, improved };
    });
  }, [score]);

  const gainPoints = data[data.length - 1].improved - data[data.length - 1].current;

  return (
    <div className="phone-container ob-lock min-h-dvh flex flex-col overflow-x-hidden">
      <SoundToggle />
      <div className="flex-1 flex flex-col px-5 pt-[calc(env(safe-area-inset-top)+2rem)] mobile-bottom-safe">
        <HeroCard variant="navy" className="pb-5">
          <p className="bbdo-eyebrow text-white mb-2">Health Score Trajectory</p>
          <h1 className="text-[24px] leading-[1.05] font-extrabold tracking-tight text-white">
            Two possible <span className="text-white/95">futures.</span>
          </h1>
          <p className="text-[12px] mt-2 text-white/70 leading-snug">
            From where you are to where you could be over the next 18 months.
          </p>
        </HeroCard>

        {/* Chart card */}
        <motion.div
          className="bbdo-card mt-3 p-3 pb-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Legend */}
          <div className="flex items-center justify-between mb-2 px-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bbdo-red, #E63946)" }} />
              <span className="text-[10px] font-bold text-bbdo-ink-soft uppercase tracking-wider">
                Pass for now
              </span>

            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--bbdo-blue, #1E3A8A)" }} />
              <span className="text-[10px] font-bold text-bbdo-ink uppercase tracking-wider">
                Continue with BBDO
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="gradImproved" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--bbdo-blue, #1E3A8A)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--bbdo-blue, #1E3A8A)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradCurrent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--bbdo-red, #E63946)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--bbdo-red, #E63946)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="rgba(15,26,61,0.08)" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fill: "hsl(220 9% 45%)", fontSize: 11, fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                dy={4}
              />
              <YAxis
                tick={{ fill: "hsl(220 9% 55%)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                width={32}
                tickMargin={4}
              />

              <Tooltip
                cursor={{ stroke: "rgba(15,26,61,0.15)", strokeWidth: 1 }}
                contentStyle={{
                  background: "#fff",
                  border: "1px solid rgba(15,26,61,0.1)",
                  borderRadius: 12,
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: "0 8px 24px -8px rgba(15,26,61,0.18)",
                }}
                labelStyle={{ color: "var(--bbdo-ink, #0F1A3D)", fontWeight: 800 }}
                formatter={(value: number, name: string) => [
                  `${value} pts`,
                  name === "current" ? "Pass for now" : "Continue with BBDO",
                ]}

              />
              {/* Downward trajectory — dashed red with soft fill */}
              <Area
                type="natural"
                dataKey="current"
                name="current"
                stroke="var(--bbdo-red, #E63946)"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                fill="url(#gradCurrent)"
                dot={{ r: 3, fill: "var(--bbdo-red, #E63946)", strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              {/* Upward trajectory — solid blue with lift */}
              <Area
                type="natural"
                dataKey="improved"
                name="improved"
                stroke="var(--bbdo-blue, #1E3A8A)"
                strokeWidth={3}
                fill="url(#gradImproved)"
                dot={{ r: 3.5, fill: "var(--bbdo-blue, #1E3A8A)", strokeWidth: 2, stroke: "#fff" }}
                activeDot={{ r: 6 }}
              />
            </AreaChart>
          </ResponsiveContainer>

          {/* Delta strip */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-left" style={{ background: "rgba(230,57,70,0.08)" }}>
              <TrendingDown className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--bbdo-red, #E63946)" }} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-bbdo-ink-soft leading-tight">Pass for now</p>
                <p className="text-[15px] font-black tabular-nums mt-0.5" style={{ color: "var(--bbdo-red, #E63946)" }}>
                  {data[data.length - 1].current}
                </p>
              </div>
            </div>
            <div className="rounded-xl px-3 py-2.5 flex items-start gap-2 text-left" style={{ background: "rgba(30,58,138,0.08)" }}>
              <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--bbdo-blue, #1E3A8A)" }} strokeWidth={2} />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-bbdo-ink-soft leading-tight">Continue with BBDO</p>
                <p className="text-[15px] font-black tabular-nums mt-0.5" style={{ color: "var(--bbdo-blue, #1E3A8A)" }}>
                  {data[data.length - 1].improved}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Insight card */}
        <motion.div
          className="sub-card mt-4 p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-bbdo-ink font-black text-[16px]">This is not willpower.</p>
          <p className="text-bbdo-ink-soft text-[13px] leading-relaxed mt-1">
            It's a{" "}
            <span className="text-bbdo-ink font-bold">system correction</span> — a{" "}
            <span className="tabular-nums font-bold text-bbdo-ink">+{gainPoints}</span> point swing in
            your health score when the metabolism is guided instead of ignored.
          </p>
        </motion.div>

        <motion.div
          className="ob-bottom flex justify-end"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <button
            onClick={() => navigate("/plans")}
            className="ob-cta ios-tap px-6"
          >
            See my recommended plan <ChevronRight className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}
