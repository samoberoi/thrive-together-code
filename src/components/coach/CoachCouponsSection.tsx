import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, ChevronDown, Copy, Check, Loader2 } from "lucide-react";
import { fetchMyCoachCoupons, type CoachCoupon } from "@/lib/couponService";
import { useToast } from "@/hooks/use-toast";

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

const prettyCycle = (key: string) =>
  key.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ").replace("Half Yearly", "6 months");

export default function CoachCouponsSection({ delay = 0 }: { delay?: number }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coupons, setCoupons] = useState<CoachCoupon[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetchMyCoachCoupons()
      .then(setCoupons)
      .catch(() => setCoupons([]))
      .finally(() => setLoading(false));
  }, []);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
      toast({ title: "Code copied", description: code });
    } catch {
      toast({ title: "Could not copy", variant: "destructive" });
    }
  };

  const expired = (c: CoachCoupon) => !!c.end_date && new Date(c.end_date).getTime() < Date.now();

  return (
    <motion.div
      className="liquid-glass rounded-3xl overflow-hidden"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 p-5 text-left">
        <Ticket className="w-5 h-5 text-primary" strokeWidth={1.8} />
        <span className="text-foreground font-bold flex-1">My Coupons</span>
        {!loading && coupons.length > 0 && (
          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{coupons.length}</span>
        )}
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-5 pb-5 flex flex-col gap-3">
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
              ) : coupons.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Oops — you don't have any coupons yet. When the team gives you one, it will show up right here.
                </p>
              ) : (
                coupons.map((c) => {
                  const used = c.redeemed_count > 0;
                  const dead = expired(c) || !c.coupon_active || !c.campaign_active;
                  return (
                    <div key={c.coupon_id} className="rounded-2xl border border-border/40 p-4 bg-background/40">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-foreground font-mono font-bold text-base break-all">{c.code}</p>
                          <p className="text-muted-foreground text-xs mt-0.5">{c.campaign_name}</p>
                        </div>
                        <button
                          onClick={() => copy(c.code)}
                          className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg"
                        >
                          {copied === c.code ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === c.code ? "Copied" : "Copy"}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Field label="Discount" value={c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`} />
                        <Field label="Valid from" value={fmtDate(c.start_date)} />
                        <Field label="Valid till" value={c.end_date ? fmtDate(c.end_date) : "No expiry"} />
                        <Field
                          label="Uses"
                          value={`${c.redeemed_count}${c.max_redemptions != null ? ` / ${c.max_redemptions}` : ""}`}
                        />
                        {c.applicable_plan_keys?.length ? <Field label="Packages" value={c.applicable_plan_keys.join(", ")} /> : null}
                        {c.applicable_cycles?.length ? <Field label="Durations" value={c.applicable_cycles.map(prettyCycle).join(", ")} /> : null}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            used ? "bg-success/15 text-success" : dead ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
                          }`}
                        >
                          {used ? "Used" : dead ? "Not available" : "Not used yet"}
                        </span>
                        {used && (
                          <span className="text-xs text-muted-foreground">
                            by {c.used_by ?? "a member"} on {fmtDate(c.used_at)}
                            {c.used_discount_amount ? ` · saved ₹${Number(c.used_discount_amount).toLocaleString("en-IN")}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[10px] font-medium uppercase tracking-wider">{label}</p>
      <p className="text-foreground text-sm font-medium mt-0.5 break-words">{value}</p>
    </div>
  );
}
