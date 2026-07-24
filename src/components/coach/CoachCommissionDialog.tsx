import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Percent, Users, IndianRupee, Package, Loader2 } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  coachId: string | null;
  commissionPercent: number;
  commissionName: string;
  payoutFrequency: string;
}

interface PackageBreakdown {
  plan_name: string;
  count: number;
  monthly_revenue: number;
}

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export default function CoachCommissionDialog({
  open,
  onClose,
  coachId,
  commissionPercent,
  commissionName,
  payoutFrequency,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PackageBreakdown[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalMonthlyRevenue, setTotalMonthlyRevenue] = useState(0);

  useEffect(() => {
    if (!open || !coachId) return;
    (async () => {
      setLoading(true);
      const { data: assignments } = await supabase
        .from("coach_assignments" as any)
        .select("user_id")
        .eq("coach_id", coachId)
        .eq("is_active", true);
      const ids = ((assignments as any[]) ?? []).map((a) => a.user_id);
      if (ids.length === 0) {
        setRows([]); setTotalUsers(0); setTotalMonthlyRevenue(0); setLoading(false); return;
      }
      const { data: subs } = await supabase
        .from("subscriptions" as any)
        .select("user_id, plan_name, plan_price, duration_months, status")
        .in("user_id", ids)
        .eq("status", "active");

      const byUser = new Map<string, any>();
      ((subs as any[]) ?? []).forEach((s) => {
        // Pick highest-priced active sub per user
        const prev = byUser.get(s.user_id);
        if (!prev || (Number(s.plan_price) || 0) > (Number(prev.plan_price) || 0)) byUser.set(s.user_id, s);
      });

      const grouped = new Map<string, PackageBreakdown>();
      let revenue = 0;
      byUser.forEach((s) => {
        const months = Math.max(1, Number(s.duration_months) || 1);
        const monthly = (Number(s.plan_price) || 0) / months;
        revenue += monthly;
        const key = s.plan_name || "Unnamed plan";
        const g = grouped.get(key) ?? { plan_name: key, count: 0, monthly_revenue: 0 };
        g.count += 1;
        g.monthly_revenue += monthly;
        grouped.set(key, g);
      });

      setRows(Array.from(grouped.values()).sort((a, b) => b.monthly_revenue - a.monthly_revenue));
      setTotalUsers(byUser.size);
      setTotalMonthlyRevenue(revenue);
      setLoading(false);
    })();
  }, [open, coachId]);

  const monthlyCommission = totalMonthlyRevenue * (commissionPercent / 100);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Percent className="w-4 h-4 text-primary" strokeWidth={2} />
            </div>
            Commission this month
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Headline commission */}
            <div className="rounded-2xl p-4 bg-primary/10 border border-primary/20 text-center">
              <p className="text-[10px] font-bold uppercase tracking-wide text-primary">Estimated {payoutFrequency} commission</p>
              <p className="stat-number text-3xl text-primary mt-1">{inr(monthlyCommission)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {commissionName} · {commissionPercent}% of {inr(totalMonthlyRevenue)} monthly revenue
              </p>
            </div>

            {/* Users & revenue */}
            <div className="grid grid-cols-2 gap-2">
              <div className="liquid-glass rounded-2xl p-3 text-center">
                <Users className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="stat-number text-xl text-foreground">{totalUsers}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Paying patients</p>
              </div>
              <div className="liquid-glass rounded-2xl p-3 text-center">
                <IndianRupee className="w-4 h-4 text-primary mx-auto mb-1" />
                <p className="stat-number text-xl text-foreground">{inr(totalMonthlyRevenue)}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Total monthly revenue</p>
              </div>
            </div>

            {/* Package breakdown */}
            <div className="liquid-glass rounded-2xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-primary" />
                <p className="text-foreground font-bold text-xs">Packages</p>
              </div>
              {rows.length === 0 ? (
                <p className="text-[11px] text-muted-foreground text-center py-4">
                  No active paying patients yet
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {rows.map((r) => {
                    const perMonthCoach = r.monthly_revenue * (commissionPercent / 100);
                    return (
                      <div key={r.plan_name} className="flex items-center justify-between text-xs py-1.5 border-b border-border/40 last:border-0">
                        <div className="min-w-0 flex-1">
                          <p className="text-foreground font-semibold truncate">{r.plan_name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {r.count} user{r.count !== 1 ? "s" : ""} · {inr(r.monthly_revenue)}/mo
                          </p>
                        </div>
                        <p className="text-primary font-black text-xs shrink-0 ml-2">{inr(perMonthCoach)}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground text-center leading-snug">
              Revenue is derived from each patient's active subscription, normalized to a monthly amount.
              Actual payout may vary based on eligibility thresholds and refunds.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
