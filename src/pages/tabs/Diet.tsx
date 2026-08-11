import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, UtensilsCrossed, ChevronRight, History, UserCheck } from "lucide-react";
import QuickFoodReference from "@/components/diet/QuickFoodReference";
import BuildMyPlate from "@/components/diet/BuildMyPlate";
import SavedPlates from "@/components/diet/SavedPlates";
import DietPlatingCalendar from "@/components/diet/DietPlatingCalendar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

type Mode = "hub" | "reference" | "plate" | "saved";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Diet({ planOverride }: { planOverride?: string } = {}) {
  const [mode, setMode] = useState<Mode>("hub");
  const { user } = useAuth();
  const [planId, setPlanId] = useState<string | null>(null);
  const [hasCompletedMeeting, setHasCompletedMeeting] = useState<boolean | null>(null);
  const [subLoaded, setSubLoaded] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem("bbdo:openReference") === "1") {
        localStorage.removeItem("bbdo:openReference");
        setMode("reference");
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("plan_id")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setPlanId(planOverride ?? ((sub as any)?.plan_id ?? null));
      const { count } = await supabase
        .from("coach_meetings")
        .select("id", { head: true, count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "completed");
      setHasCompletedMeeting((count ?? 0) > 0);
      setSubLoaded(true);
    })();
  }, [user, planOverride]);

  if (mode === "reference") return <QuickFoodReference onClose={() => setMode("hub")} />;
  if (mode === "plate") return <BuildMyPlate onClose={() => setMode("hub")} />;
  if (mode === "saved") return <SavedPlates onClose={() => setMode("hub")} />;

  // Don't render either variant of the hub until the subscription is resolved —
  // otherwise Package 1 users briefly see the paid "Eat smart. Reverse the spike."
  // hub before it swaps to the embedded Quick Food Reference.
  if (!subLoaded) {
    return (
      <div className="theme-diet px-5 pt-2 pb-28 max-w-3xl mx-auto min-h-[60vh]" aria-hidden />
    );
  }

  const effectivePlan = planOverride ?? planId;
  const isPaid = effectivePlan === "active" || effectivePlan === "intensive" || effectivePlan === "pro";
  // Package 2 (active) = user builds their own plates. Package 3 (intensive/pro) = pre-built 30-day plates.
  const isPrebuiltPlan = effectivePlan === "intensive" || effectivePlan === "pro";
  const isBuildYourOwnPlan = effectivePlan === "active" || !!planOverride;
  const awaitingCoach = !planOverride && isPrebuiltPlan && hasCompletedMeeting === false;
  // Package 1 (free / basic) has nothing else to see — auto-load the food reference directly.
  const isPackageOne = effectivePlan !== "active" && effectivePlan !== "intensive" && effectivePlan !== "pro";

  if (isPackageOne) {
    return (
      <div className="theme-diet px-4 pt-2 pb-28 max-w-3xl mx-auto">
        <QuickFoodReference embedded />
      </div>
    );
  }


  return (
    <div className="theme-diet px-5 pt-2 pb-28 max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        <p className="text-[11px] font-bold tracking-[0.18em] text-[var(--bbdo-blue)] uppercase">Diet</p>
        <h1 className="text-2xl font-black text-foreground mt-1.5 leading-tight">
          Eat smart. Reverse the spike.
        </h1>
        <p className="text-[13px] text-muted-foreground mt-2 leading-relaxed">
          Browse foods by how your body responds, or build a metabolically balanced plate.
        </p>
      </motion.div>


      <div className="mt-4 space-y-3">
        {awaitingCoach && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="liquid-glass rounded-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--pillar-diet-soft)", color: "var(--pillar-diet)" }}
              >
                <UserCheck className="w-5 h-5" strokeWidth={1.6} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "var(--pillar-diet)" }}>Awaiting first consultation</p>
                <h3 className="text-base font-black text-foreground mt-1 leading-tight tracking-[-0.02em]">
                  Your 30-day plan unlocks after your first consultation
                </h3>
                <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                  Once your first consultation is done — so we can factor in allergies, preferences and health
                  markers — your meal-by-meal plate plan appears here automatically. Meanwhile, explore the food
                  reference below.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {isPrebuiltPlan && !awaitingCoach && <DietPlatingCalendar />}

        {isPaid && (
          <ActionCard
            onClick={() => setMode("plate")}
            icon={UtensilsCrossed}
            title="Build My Plate"
            subtitle="6 steps · ~90 seconds"
            desc="We walk you through the 6 Metabolic Essentials and generate a balanced plate with full nutrition breakdown."
            color="var(--pillar-diet)"
            delay={0.05}
          />
        )}
        <ActionCard
          onClick={() => setMode("reference")}
          icon={BookOpen}
          title="Quick Food Reference"
          subtitle="13 categories · ~240 foods"
          desc="Carbs, protein, GI, portion sizes and metabolic guidance at a glance."
          color="var(--pillar-diet)"
          delay={0.1}
        />

        {isBuildYourOwnPlan && (
          <motion.button
            onClick={() => setMode("saved")}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: EASE, delay: 0.18 }}
            className="no-pill w-full flex items-center gap-3 px-5 py-4 liquid-glass rounded-2xl text-left"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "var(--pillar-diet-soft)", color: "var(--pillar-diet)" }}
            >
              <History className="w-5 h-5" strokeWidth={1.6} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground tracking-tight">My Saved Plates</p>
              <p className="text-xs text-muted-foreground">Reuse and tweak past meals</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground" strokeWidth={1.5} />
          </motion.button>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  onClick, icon: Icon, title, subtitle, desc, color, delay,
}: { onClick: () => void; icon: any; title: string; subtitle: string; desc: string; color: string; delay: number }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: EASE, delay }}
      whileTap={{ scale: 0.985 }}
      className="no-pill w-full text-left rounded-2xl p-5 relative overflow-hidden text-white shadow-card hover:shadow-lift transition-shadow"
      style={{ background: color }}
    >
      <div className="relative flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center shrink-0 ring-1 ring-white/30">
          <Icon className="w-6 h-6 text-white" strokeWidth={1.6} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/85">{subtitle}</p>
          <h3 className="text-xl font-black mt-1 leading-tight tracking-[-0.02em]">{title}</h3>
          <p className="text-sm text-white/90 mt-2 leading-relaxed">{desc}</p>
        </div>
        <ChevronRight className="w-6 h-6 text-white/85 shrink-0 mt-1" strokeWidth={1.6} />
      </div>
    </motion.button>
  );
}
