import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Package, Bell, Check, ChevronRight, Crown, Sparkles, Download, CalendarClock, TrendingDown } from "lucide-react";
import {
  fetchActiveSubscription,
  fetchUpgradeOptions,
  fetchDowngradeOptions,
  fetchScheduledSubscription,
  activateDueSubscriptions,
  fetchPackageByPlanKey,
  type Subscription,
} from "@/lib/subscriptionService";
import { useNavigate } from "react-router-dom";
import { downloadInvoice } from "@/lib/invoiceGenerator";
import { useAuth } from "@/contexts/AuthContext";
import { fetchProfile } from "@/lib/profileService";

interface MyPlanSectionProps {
  onBack: () => void;
}

export default function MyPlanSection({ onBack }: MyPlanSectionProps) {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("User");
  const [userPhone, setUserPhone] = useState<string | undefined>();
  const [userEmail, setUserEmail] = useState<string | undefined>();
  const [userCity, setUserCity] = useState<string | undefined>();
  const [healthScore, setHealthScore] = useState<number | undefined>();
  const [coachName, setCoachName] = useState<string | undefined>();
  const [pkgDetails, setPkgDetails] = useState<{ id: string; name: string; tagline: string; features: string[] } | null>(null);
  const [upgradeOptions, setUpgradeOptions] = useState<Array<{ id: string; name: string; tagline: string; monthlyPrice: number }>>([]);
  const [downgradeOptions, setDowngradeOptions] = useState<Array<{ id: string; name: string; tagline: string; monthlyPrice: number }>>([]);
  const [scheduledSub, setScheduledSub] = useState<Subscription | null>(null);

  useEffect(() => {
    if (!authUser) {
      setSub(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      await activateDueSubscriptions(authUser.id);
      const s = await fetchActiveSubscription(authUser.id);
      setSub(s);
      setLoading(false);
      fetchScheduledSubscription(authUser.id).then(setScheduledSub);
      if (s) {
        // Defer non-critical fetches so the screen paints immediately
        fetchPackageByPlanKey(s.plan_id).then(setPkgDetails);
        fetchUpgradeOptions(s.plan_id).then(setUpgradeOptions);
        fetchDowngradeOptions(s.plan_id).then(setDowngradeOptions);
      }
    })();
    fetchProfile(authUser.id).then((p) => {
      if (p?.name) setUserName(p.name);
      if (p?.phone) setUserPhone(p.phone);
      if (p?.city) setUserCity(p.city);
      if (p?.initial_health_score) setHealthScore(p.initial_health_score);
      if (p?.coach_name) setCoachName(p.coach_name);
      const profileEmail = (p as any)?.email as string | undefined;
      if (profileEmail && !profileEmail.endsWith("@bbd.app")) setUserEmail(profileEmail);
    });
  }, [authUser]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-border">
          <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center"><ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} /></button>
          <h2 className="min-w-0 text-lg font-black text-foreground leading-tight break-words">My Plan</h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!sub) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-border">
          <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center"><ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} /></button>
          <h2 className="min-w-0 text-lg font-black text-foreground leading-tight break-words">My Plan</h2>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          <Package className="w-12 h-12 text-muted-foreground" strokeWidth={1.2} />
          <p className="text-foreground font-bold text-lg leading-tight break-words">No active plan</p>
          <p className="text-muted-foreground text-sm leading-snug break-words">You haven't subscribed to a plan yet.</p>
          <button onClick={() => navigate("/plans")} className="gradient-blue text-primary-foreground font-bold py-3 px-8 rounded-2xl glow-blue mt-2">
            Browse Plans
          </button>
        </div>
      </div>
    );
  }

  const startDate = new Date(sub.started_at);
  const expiryDate = new Date(sub.expires_at);
  const now = new Date();
  const totalDays = Math.ceil((expiryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysUsed = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, totalDays - daysUsed);
  const percentUsed = Math.min(100, Math.round((daysUsed / totalDays) * 100));

  const planDetails = pkgDetails;

  const formatDate = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 border-b border-border">
        <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center"><ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} /></button>
        <h2 className="min-w-0 text-lg font-black text-foreground leading-tight break-words">My Plan</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        <div className="flex flex-col gap-4">
          <div className="liquid-glass rounded-3xl p-5">
            <div className="flex items-start gap-2 mb-3">
              <Package className="w-5 h-5 shrink-0 text-primary" strokeWidth={1.8} />
              <span className="min-w-0 text-primary font-bold text-sm leading-tight break-words">{planDetails?.name ?? sub.plan_name}</span>
            </div>
            <p className="text-foreground font-black text-2xl mb-1 leading-tight break-words">{sub.plan_name}</p>
            <p className="text-muted-foreground text-sm leading-snug break-words">Started: {formatDate(startDate)}</p>
            <div className="mt-4 liquid-glass rounded-xl p-3 flex items-start justify-between gap-2">
              <span className="min-w-0 text-muted-foreground text-xs leading-tight break-words">Expires on</span>
              <span className={`shrink-0 max-w-[58%] text-right font-bold text-sm leading-tight break-words ${daysRemaining <= 14 ? "text-destructive" : "text-primary"}`}>{formatDate(expiryDate)}</span>
            </div>
            <div className="mt-3 w-full rounded-full h-2 bg-border">
              <div className="h-2 rounded-full bg-primary transition-colors" style={{ width: `${percentUsed}%` }} />
            </div>
            <p className="text-muted-foreground text-xs mt-1.5 leading-snug break-words">{percentUsed}% of your plan used — {daysRemaining} days remaining</p>
          </div>

          {scheduledSub && (
            <div className="liquid-glass rounded-2xl p-4 flex items-start gap-3">
              <CalendarClock className="w-4 h-4 text-primary shrink-0 mt-0.5" strokeWidth={1.8} />
              <div className="min-w-0">
                <p className="text-foreground text-sm font-bold leading-snug break-words">
                  {scheduledSub.plan_name} starts {formatDate(new Date(scheduledSub.started_at))}
                </p>
                <p className="text-muted-foreground text-xs mt-0.5 leading-snug break-words">
                  Your current plan stays active until then — nothing changes today.
                </p>
              </div>
            </div>
          )}

          {daysRemaining <= 30 && (
            <div className="liquid-glass rounded-2xl p-4 flex items-center gap-3">
              <Bell className="w-4 h-4 text-destructive flex-shrink-0" strokeWidth={1.8} />
              <p className="text-foreground text-sm font-medium leading-snug break-words">
                Your plan expires in <span className="text-destructive font-bold">{daysRemaining} days</span>. Renew early for best rate.
              </p>
            </div>
          )}

          <button onClick={() => navigate("/plans")} className="w-full gradient-blue text-primary-foreground font-bold py-4 rounded-2xl glow-blue">
            {daysRemaining <= 30 ? "Renew Plan" : "Change Plan"}
          </button>

          <button
            onClick={() => downloadInvoice({ subscription: sub, userName, userEmail, userPhone, userCity, healthScore, coachName })}
            className="w-full liquid-glass text-foreground font-bold py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-accent transition-colors"
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            Download Invoice
          </button>

          {planDetails && (
            <div className="liquid-glass rounded-2xl p-5">
              <p className="text-foreground font-semibold text-sm mb-4 leading-tight break-words">What's Included</p>
              <div className="flex flex-col gap-3">
                {planDetails.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Check className="w-3.5 h-3.5 text-primary" strokeWidth={2} />
                    </div>
                    <span className="min-w-0 text-foreground text-sm leading-snug break-words">{feature}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {upgradeOptions.length > 0 && (
            <div className="liquid-glass rounded-2xl p-5">
              <div className="flex items-start gap-2 mb-4">
                <Crown className="w-4 h-4 shrink-0 text-warning" strokeWidth={1.8} />
                <p className="min-w-0 text-foreground font-semibold text-sm leading-tight break-words">Upgrade Your Plan</p>
              </div>
              {upgradeOptions.map((upgradePlan) => (
                <button
                  key={upgradePlan.id}
                  onClick={() => navigate("/plans")}
                  className="w-full flex items-start justify-between gap-3 py-4 border-b border-border last:border-0"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-foreground text-sm font-bold flex items-start gap-2 leading-tight break-words">
                      {upgradePlan.name}
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-warning" strokeWidth={1.8} />
                    </p>
                    <p className="text-muted-foreground text-xs mt-0.5 leading-snug break-words">{upgradePlan.tagline}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-primary font-bold text-sm leading-tight text-right">₹{upgradePlan.monthlyPrice.toLocaleString("en-IN")}/mo</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                  </div>
                </button>
              ))}
            </div>
          )}

          {downgradeOptions.length > 0 && (
            <div className="liquid-glass rounded-2xl p-5">
              <div className="flex items-start gap-2 mb-1">
                <TrendingDown className="w-4 h-4 shrink-0 text-muted-foreground" strokeWidth={1.8} />
                <p className="min-w-0 text-foreground font-semibold text-sm leading-tight break-words">Move to a Lighter Plan</p>
              </div>
              <p className="text-muted-foreground text-xs mb-3 leading-snug break-words">
                Starts on {formatDate(expiryDate)}, when your current plan ends.
              </p>
              {downgradeOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate("/plans")}
                  className="w-full flex items-start justify-between gap-3 py-4 border-b border-border last:border-0"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-foreground text-sm font-bold leading-tight break-words">{p.name}</p>
                    <p className="text-muted-foreground text-xs mt-0.5 leading-snug break-words">{p.tagline}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-primary font-bold text-sm leading-tight text-right">₹{p.monthlyPrice.toLocaleString("en-IN")}/mo</span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" strokeWidth={1.8} />
                  </div>
                </button>
              ))}
            </div>
          )}


        </div>
      </div>
    </div>
  );
}
