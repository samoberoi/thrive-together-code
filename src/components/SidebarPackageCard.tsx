import { useEffect, useState } from "react";
import { Package, UserCheck, ArrowRight, Flower2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useRbac } from "@/hooks/useRbac";
import { fetchActiveSubscription, type Subscription } from "@/lib/subscriptionService";
import { fetchProfile } from "@/lib/profileService";
import { supabase } from "@/integrations/supabase/client";

interface YogaSummary {
  partner_name: string;
  package_type: string;
  expires_on: string | null;
  starts_on: string | null;
}

export default function SidebarPackageCard() {
  const { user } = useAuth();
  const { packageKey } = useRbac();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [yoga, setYoga] = useState<YogaSummary | null>(null);
  const [upgradeDismissed, setUpgradeDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem("bbdo:hideUpgradeCTA") === "1"; } catch { return false; }
  });

  useEffect(() => {
    if (!user?.id) return;
    fetchActiveSubscription(user.id).then(setSubscription).catch(() => {});
    fetchProfile(user.id).then((p: any) => {
      if (p?.coach_name) setCoachName(p.coach_name);
    }).catch(() => {});
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data: bookings } = await supabase
        .from("yoga_bookings" as any)
        .select("package_type, starts_on, expires_on, status, partner_id")
        .eq("user_id", user.id)
        .not("status", "eq", "cancelled")
        .not("status", "eq", "completed")
        .or(`expires_on.is.null,expires_on.gte.${today}`)
        .order("created_at", { ascending: false })
        .limit(1);
      const row: any = bookings?.[0];
      if (!row) return;
      let partnerName = "Yoga";
      if (row.partner_id) {
        const { data: p } = await supabase
          .from("partner_directory" as any)
          .select("name")
          .eq("id", row.partner_id)
          .maybeSingle();
        if ((p as any)?.name) partnerName = (p as any).name;
      }
      setYoga({
        partner_name: partnerName,
        package_type: row.package_type,
        starts_on: row.starts_on,
        expires_on: row.expires_on,
      });
    })().catch(() => {});
  }, [user?.id]);

  if (!subscription) return null;

  const expiryDate = new Date(subscription.expires_at);
  const startDate = new Date(subscription.started_at);
  const now = new Date();
  const MS_DAY = 1000 * 60 * 60 * 24;
  const totalDays = Math.max(1, Math.round((expiryDate.getTime() - startDate.getTime()) / MS_DAY));
  const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / MS_DAY));
  const daysUsed = Math.max(0, totalDays - daysRemaining);
  const percentUsed = Math.min(100, Math.round((daysUsed / totalDays) * 100));

  return (
    <div className="liquid-glass rounded-2xl p-3 mb-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="text-foreground font-bold text-xs truncate leading-tight">{subscription.plan_name}</p>
            <p className="text-muted-foreground text-[9px] leading-tight">
              Exp {expiryDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="font-black text-sm leading-none text-destructive">{daysRemaining}</p>
          <p className="text-muted-foreground text-[8px] font-medium">days</p>
        </div>
      </div>
      <div className="w-full rounded-full h-1 bg-border mt-2">
        <div className="h-1 rounded-full bg-destructive" style={{ width: `${percentUsed}%` }} />
      </div>
      {coachName && (
        <div className="flex items-center gap-1.5 mt-2">
          <UserCheck className="w-3 h-3 text-primary" strokeWidth={1.8} />
          <span className="text-foreground text-[10px] font-medium truncate">
            Coach: <span className="text-primary font-bold">{coachName}</span>
          </span>
        </div>
      )}
      {packageKey === "foundation" && !upgradeDismissed && (
        <div className="mt-2 pt-2 border-t border-border/60 flex flex-col gap-1.5">
          <a
            href="/plans"
            className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg font-bold text-[10px] text-white shadow-card"
            style={{ background: "var(--bbdo-gradient)" }}
          >
            Upgrade for 1:1 Coaching <ArrowRight className="w-3 h-3" strokeWidth={2.2} />
          </a>
          <button
            onClick={() => {
              try { localStorage.setItem("bbdo:hideUpgradeCTA", "1"); } catch {}
              setUpgradeDismissed(true);
            }}
            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      )}
      {yoga && (() => {
        const exp = yoga.expires_on ? new Date(yoga.expires_on) : null;
        const daysLeft = exp ? Math.max(0, Math.ceil((exp.getTime() - Date.now()) / MS_DAY)) : null;
        const renewSoon = daysLeft !== null && daysLeft <= 7;
        const label = yoga.package_type === "private" ? "Private Yoga" : "Group Yoga";
        return (
          <div className="mt-2 pt-2 border-t border-border/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-6 h-6 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Flower2 className="w-3 h-3 text-primary" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <p className="text-foreground font-bold text-[11px] truncate leading-tight">{label}</p>
                  <p className="text-muted-foreground text-[9px] leading-tight truncate">
                    {yoga.partner_name}{exp ? ` · till ${exp.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}` : ""}
                  </p>
                </div>
              </div>
              {daysLeft !== null && (
                <div className="text-right shrink-0">
                  <p className={`font-black text-xs leading-none ${renewSoon ? "text-destructive" : "text-primary"}`}>{daysLeft}</p>
                  <p className="text-muted-foreground text-[8px] font-medium">days</p>
                </div>
              )}
            </div>
            {renewSoon && (
              <a
                href="/dashboard?tab=yoga"
                className="mt-1.5 inline-flex w-full items-center justify-center gap-1 px-2 py-1 rounded-lg font-bold text-[10px] text-white shadow-card bg-destructive"
              >
                Renew now <ArrowRight className="w-3 h-3" strokeWidth={2.2} />
              </a>
            )}
          </div>
        );
      })()}
    </div>
  );
}
