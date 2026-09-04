import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, ChevronRight, Star, Loader2, ShieldCheck, AlertTriangle } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";
import { setPhase } from "@/lib/musicEngine";
import {
  fetchPackagesWithPricing,
  computePrice,
  saveSelectedPlan,
  CYCLE_LABEL,
  CYCLE_MONTHS,
  type BillingCycle,
  type PackageWithPricing,
} from "@/lib/packageService";
import {
  fetchActiveSubscription,
  fetchLatestSubscription,
  fetchScheduledSubscription,
  isSubscriptionExpired,
  normalizePlanKey,
  type Subscription,
} from "@/lib/subscriptionService";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchRegionPriceContext,
  formatMoney,
  getStoredRegionCode,
  subscribeRegionPricing,
  INR_CONTEXT,
  type RegionPriceContext,
} from "@/lib/regionPricing";
import { cn } from "@/lib/utils";

const CYCLES: BillingCycle[] = ["yearly", "half_yearly", "quarterly", "monthly"];

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Plans() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [pkgs, setPkgs] = useState<PackageWithPricing[]>([]);
  const [cycle, setCycle] = useState<BillingCycle>("yearly");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlanKey, setCurrentPlanKey] = useState<string | null>(null);
  const [currentSortOrder, setCurrentSortOrder] = useState<number | null>(null);
  const [activeSub, setActiveSub] = useState<Subscription | null>(null);
  const [scheduledSub, setScheduledSub] = useState<Subscription | null>(null);
  const [expiredSub, setExpiredSub] = useState<Subscription | null>(null);

  useEffect(() => {
    setPhase("power");
    (async () => {
      const [data, active, latestSub, scheduled] = await Promise.all([
        fetchPackagesWithPricing({ onlyEnabled: true }),
        user ? fetchActiveSubscription(user.id) : Promise.resolve(null),
        user ? fetchLatestSubscription(user.id) : Promise.resolve(null),
        user ? fetchScheduledSubscription(user.id) : Promise.resolve(null),
      ]);
      const activeKey = normalizePlanKey(active?.plan_id);
      // Show every other package — higher ones are upgrades, lower ones downgrades.
      const visible = data.filter((p) => p.show_in_onboarding !== false);
      const current = activeKey ? data.find((p) => p.plan_key === activeKey) : null;
      setPkgs(visible);
      setCurrentPlanKey(activeKey);
      setCurrentSortOrder(current?.sort_order ?? null);
      setActiveSub(active);
      setScheduledSub(scheduled);
      const expired = !active && isSubscriptionExpired(latestSub) ? latestSub : null;
      setExpiredSub(expired);
      // Preselect: previously held plan if expired, else popular, else first non-current
      const previousKey = normalizePlanKey(expired?.plan_id);
      const previous = previousKey ? visible.find((p) => p.plan_key === previousKey) : null;
      const popular = visible.find((p) => p.accent === "popular" && p.plan_key !== activeKey);
      const firstOther = visible.find((p) => p.plan_key !== activeKey);
      const pick = previous ?? popular ?? firstOther ?? null;
      if (pick) setSelectedId(pick.id);
      setLoading(false);
    })();
  }, [user]);

  const availableCycles = useMemo(() => {
    const set = new Set<BillingCycle>();
    pkgs.forEach((p) => p.pricing.filter((r) => r.enabled).forEach((r) => set.add(r.billing_cycle)));
    return CYCLES.filter((c) => set.has(c));
  }, [pkgs]);

  useEffect(() => {
    if (availableCycles.length > 0 && !availableCycles.includes(cycle)) setCycle(availableCycles[0]);
  }, [availableCycles, cycle]);

  const directionFor = (plan: PackageWithPricing): "upgrade" | "downgrade" | null => {
    if (currentSortOrder == null || plan.plan_key === currentPlanKey) return null;
    return plan.sort_order > currentSortOrder ? "upgrade" : "downgrade";
  };

  const selectedPkg = pkgs.find((p) => p.id === selectedId) ?? null;
  const selectedDirection = selectedPkg ? directionFor(selectedPkg) : null;

  const handleStart = () => {
    const pkg = selectedPkg;
    if (!pkg) return;
    const row = pkg.pricing.find((r) => r.billing_cycle === cycle && r.enabled);
    if (!row) return;
    const months = CYCLE_MONTHS[cycle];
    const { monthly, total } = computePrice(pkg.base_monthly_price, row.discount_percent, months);
    const direction = directionFor(pkg);
    saveSelectedPlan({
      package_id: pkg.id,
      plan_key: pkg.plan_key,
      name: pkg.name,
      billing_cycle: cycle,
      duration_months: months,
      monthly_price: monthly,
      total_price: total,
      base_monthly_price: pkg.base_monthly_price,
      discount_percent: row.discount_percent,
      assigns_coach: pkg.assigns_coach !== false,
      change_mode: direction ?? "new",
    });
    navigate("/commitment");
  };

  if (loading) {
    return (
      <div className="phone-container min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div
      className="phone-container min-h-dvh flex flex-col px-6 pt-14 overflow-y-auto bg-background"
      style={{ paddingBottom: "calc(var(--kb-h, 0px) + var(--nav-clear, calc(env(safe-area-inset-bottom, 0px) + 2.5rem)))" }}
    >
      <SoundToggle />
      <button
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="absolute top-12 left-4 z-20 w-10 h-10 rounded-full liquid-glass flex items-center justify-center"
      >
        <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={2} />
      </button>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col flex-1">
        <div className="mb-5 mt-10">
          <span className="text-xs font-medium text-primary uppercase tracking-widest">
            {expiredSub ? "Renew Access" : currentPlanKey ? "Change Your Plan" : "Choose Your Path"}
          </span>
          <h1 className="text-3xl font-black text-foreground mt-1">
            {expiredSub ? (<>Your plan<br />has expired</>) : currentPlanKey ? (<>Change<br />your plan</>) : (<>Pick your<br />reset plan</>)}
          </h1>
          {!expiredSub && currentPlanKey && (
            <p className="text-muted-foreground text-xs mt-2 leading-snug">
              Upgrades start today with credit for the unused part of your current plan. Downgrades start when your
              current plan ends{activeSub ? ` on ${fmtDate(activeSub.expires_at)}` : ""}.
            </p>
          )}
        </div>

        {scheduledSub && (
          <div className="mb-5 rounded-2xl p-4 border border-primary/30 bg-primary/5">
            <p className="text-foreground font-bold text-sm leading-tight">
              {scheduledSub.plan_name} is scheduled
            </p>
            <p className="text-muted-foreground text-xs mt-1 leading-snug">
              It starts on {fmtDate(scheduledSub.started_at)}. Choosing another plan below will replace it.
            </p>
          </div>
        )}

        {expiredSub && (
          <div className="mb-5 rounded-2xl p-4 border border-destructive/40 bg-destructive/10 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-destructive mt-0.5" strokeWidth={2} />
            <div className="min-w-0">
              <p className="text-foreground font-bold text-sm leading-tight">
                {expiredSub.plan_name} expired on {fmtDate(expiredSub.expires_at)}
              </p>
              <p className="text-muted-foreground text-xs mt-1 leading-snug">
                Renew a plan below to restore full access to your dashboard, coach, and tracking.
              </p>
            </div>
          </div>
        )}

        {/* Billing cycle selector */}
        <div className="liquid-glass rounded-2xl p-1 grid grid-cols-4 gap-1 mb-5">
          {availableCycles.map((c) => (
            <button
              key={c}
              onClick={() => setCycle(c)}
              className={cn(
                "py-2 rounded-xl text-xs font-bold transition-colors",
                cycle === c ? "gradient-blue text-primary-foreground" : "text-muted-foreground"
              )}
            >
              {CYCLE_LABEL[c]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-7 mb-6">
          {pkgs.map((plan, i) => {
            const row = plan.pricing.find((r) => r.billing_cycle === cycle && r.enabled);
            if (!row) return null;
            const months = CYCLE_MONTHS[cycle];
            const { monthly, total } = computePrice(plan.base_monthly_price, row.discount_percent, months);
            const isCurrent = currentPlanKey != null && plan.plan_key === currentPlanKey;
            const isSelected = !isCurrent && selectedId === plan.id;
            const isPopular = plan.accent === "popular";
            const direction = directionFor(plan);
            return (
              <motion.button
                key={plan.id}
                onClick={() => { if (!isCurrent) setSelectedId(plan.id); }}
                disabled={isCurrent}
                initial={{ opacity: 0, y: 20, scale: 1 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: isSelected ? 1.04 : 1,
                }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                whileTap={isCurrent ? undefined : { scale: isSelected ? 1.02 : 0.98 }}
                aria-disabled={isCurrent}
                className={cn(
                  "relative p-5 rounded-2xl transition-colors text-left liquid-glass",
                  isSelected && "shadow-xl shadow-primary/25 ring-2 ring-primary/40 z-10",
                  isPopular && !isSelected && !isCurrent && "ring-1 ring-primary/20",
                  plan.accent === "premium" && !isCurrent && "ring-2 ring-amber-300/70 shadow-lg shadow-amber-300/20",
                  isCurrent && "opacity-60 cursor-not-allowed ring-1 ring-success/40"
                )}
                style={
                  plan.accent === "premium" && !isCurrent
                    ? { background: "linear-gradient(140deg, hsl(48 95% 88%) 0%, hsl(45 92% 80%) 55%, hsl(42 88% 72%) 100%)" }
                    : undefined
                }
              >
                {isSelected && (
                  <motion.div
                    aria-hidden
                    className="absolute inset-0 rounded-2xl ring-2 ring-primary/30 pointer-events-none"
                    animate={{ opacity: [0.4, 0.9, 0.4] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}



                {isCurrent ? (
                  <div className="absolute -top-3 left-5 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 bg-success text-success-foreground">
                    <ShieldCheck className="w-3 h-3" strokeWidth={2} />
                    Your current plan
                  </div>
                ) : plan.badge ? (
                  <div
                    className={cn(
                      "absolute -top-3 left-5 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1",
                      isPopular
                        ? "gradient-blue text-primary-foreground glow-blue"
                        : plan.accent === "premium"
                        ? "bg-amber-300 text-amber-950 shadow-md shadow-amber-300/60"
                        : "bg-amber-100 text-amber-900"
                    )}
                  >
                    {isPopular && <Star className="w-3 h-3" strokeWidth={1.5} />}
                    {plan.accent === "premium" && <Star className="w-3 h-3 fill-amber-900 text-amber-900" strokeWidth={1.5} />}
                    {plan.badge}
                  </div>
                ) : null}

                <div className="flex items-start justify-between mb-4 mt-1 gap-3">
                  <div>
                    <p className="text-foreground font-bold text-base">{plan.name}</p>
                    {plan.tagline && <p className="text-muted-foreground text-xs">{plan.tagline}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-2xl font-black text-primary">₹{monthly.toLocaleString("en-IN")}</span>
                    <p className="text-muted-foreground text-xs">/mo</p>
                    {row.discount_percent > 0 && (
                      <p className="text-[10px] text-emerald-600 font-semibold">{row.discount_percent}% off</p>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {isCurrent
                    ? "You're already enrolled on this plan."
                    : `Billed ₹${total.toLocaleString("en-IN")} every ${months} month${months > 1 ? "s" : ""}`}
                </p>
                {!isCurrent && direction && (
                  <p
                    className={cn(
                      "text-[11px] font-semibold mb-3",
                      direction === "upgrade" ? "text-primary" : "text-amber-700"
                    )}
                  >
                    {direction === "upgrade"
                      ? "Upgrade · starts today, unused balance credited"
                      : `Downgrade · starts ${activeSub ? fmtDate(activeSub.expires_at) : "when your current plan ends"}`}
                  </p>
                )}
                <div className="flex flex-col gap-2">
                  {plan.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2">
                      <Check className="w-4 h-4 flex-shrink-0 text-success" strokeWidth={2} />
                      <span className="text-foreground/70 text-sm">{feat}</span>
                    </div>
                  ))}
                </div>
                {isSelected && (
                  <motion.div
                    className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-success flex items-center justify-center ring-2 ring-background"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <Check className="w-3 h-3 text-success-foreground" strokeWidth={2.5} />
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>

        <div className="ob-bottom">
          <motion.button
            onClick={handleStart}
            disabled={!selectedId || (currentPlanKey != null && pkgs.find((p) => p.id === selectedId)?.plan_key === currentPlanKey)}
            className="ob-cta gradient-blue glow-blue disabled:opacity-40"
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {expiredSub
              ? "Renew Plan"
              : selectedDirection === "downgrade"
              ? "Schedule Downgrade"
              : selectedDirection === "upgrade"
              ? "Upgrade Plan"
              : "Start My Journey"}{" "}
            <ChevronRight className="w-5 h-5" strokeWidth={1.5} />
          </motion.button>
        </div>

        
      </motion.div>
    </div>
  );
}
