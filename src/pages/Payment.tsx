import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Flame, Lock, Rocket, User, Star, Gift, Ticket } from "lucide-react";
import { getUser } from "@/lib/userStore";
import { useAuth } from "@/contexts/AuthContext";
import { previewPlanChange, type PlanChangePreview } from "@/lib/subscriptionService";
import { supabase } from "@/integrations/supabase/client";
import { getSelectedPlan, CYCLE_LABEL } from "@/lib/packageService";
import { autoAssignCoach, fetchAssignedCoach, coachTypeLabel, type Coach } from "@/lib/coachService";
import { sendWelcomeNotification } from "@/lib/notificationService";
import { validateCoupon, type CouponValidation } from "@/lib/couponService";
import logoImg from "@/assets/logo.png";

declare global {
  interface Window { Razorpay: any }
}

type PaymentUser = { id: string; email?: string | null };

// Domains registered/approved on the Razorpay merchant account.
const APPROVED_CHECKOUT_ORIGIN = "https://bbdo.hyperrevamp.com";
const APPROVED_CHECKOUT_HOSTS = ["bbdo.hyperrevamp.com", "localhost", "127.0.0.1"];

function isApprovedCheckoutOrigin(): boolean {
  const host = window.location.hostname;
  // Native shells run on the approved hostname via Capacitor's server config.
  if (window.location.protocol === "capacitor:" || window.location.protocol === "file:") return true;
  if (host.endsWith(".lovable.app") || host.endsWith(".lovableproject.com")) return true;
  return APPROVED_CHECKOUT_HOSTS.includes(host);
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    const src = "https://checkout.razorpay.com/v1/checkout.js";
    if (document.querySelector(`script[src="${src}"]`)) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function ConfettiPiece({ delay }: { delay: number }) {
  const colors = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--warning))", "hsl(var(--destructive))"];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const left = Math.random() * 100;
  const size = Math.random() * 10 + 6;
  return (
    <motion.div className="absolute top-0 rounded-sm" style={{ left: `${left}%`, backgroundColor: color, width: size, height: size }}
      initial={{ y: -20, opacity: 1, rotate: 0 }} animate={{ y: 700, opacity: [1, 1, 0], rotate: Math.random() * 720 - 360 }}
      transition={{ delay, duration: 2 + Math.random(), ease: "easeIn" }} />
  );
}

export default function Payment() {
  const [step, setStep] = useState<"form" | "success">("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignedCoach, setAssignedCoach] = useState<Coach | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralStatus, setReferralStatus] = useState<"idle" | "applying" | "valid" | "invalid">("idle");
  const [referralMessage, setReferralMessage] = useState<string>("");
  const navigate = useNavigate();
  const { user: authUser, loading: authLoading } = useAuth();
  const storedUser = getUser();
  const name = storedUser.profile.name ?? "Friend";
  const plan = getSelectedPlan();
  const duration = plan?.duration_months ?? 0;
  const changeMode = plan?.change_mode ?? "new";
  const isPlanChange = changeMode === "upgrade" || changeMode === "downgrade";
  const [preview, setPreview] = useState<PlanChangePreview | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [couponStatus, setCouponStatus] = useState<"idle" | "applying" | "valid" | "invalid">("idle");
  const [couponMessage, setCouponMessage] = useState("");
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);

  const baseAmount = preview ? preview.amount_due : (plan?.total_price ?? 0);
  const couponDiscount = coupon?.valid ? Number(coupon.discount_amount ?? 0) : 0;
  const payableAmount = Math.max(baseAmount - couponDiscount, 0);

  const applyCoupon = async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponStatus("applying");
    setCouponMessage("");
    const res = await validateCoupon(code, baseAmount, plan?.plan_key ?? null, plan?.billing_cycle ?? null);
    if (!res.valid) {
      setCoupon(null);
      setCouponStatus("invalid");
      setCouponMessage(res.reason ?? "Invalid coupon code");
      return;
    }
    setCoupon(res);
    setCouponStatus("valid");
    setCouponMessage(`${res.name} applied — you save ₹${Number(res.discount_amount ?? 0).toLocaleString("en-IN")}`);
  };

  useEffect(() => {
    if (!authUser || !plan || !isPlanChange) return;
    let cancelled = false;
    (async () => {
      const p = await previewPlanChange({
        plan_price: plan.total_price,
        duration_months: plan.duration_months,
        mode: changeMode,
      });
      if (!cancelled) setPreview(p);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUser?.id, plan?.plan_key, plan?.total_price, isPlanChange]);

  const coachInitials = (assignedCoach?.name ?? "Coach").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const applyReferral = async () => {
    const code = referralCode.trim();
    if (!code) return;
    setReferralStatus("applying");
    setReferralMessage("");
    try {
      const { data, error } = await supabase.rpc("apply_referral_code" as any, { _code: code });
      if (error) throw error;
      if (data === false || data === null) {
        setReferralStatus("invalid");
        setReferralMessage("Invalid referral code. Please check and try again.");
        return;
      }
      setReferralStatus("valid");
      setReferralMessage("Referral code applied successfully.");
    } catch (e: any) {
      setReferralStatus("invalid");
      setReferralMessage("Invalid referral code. Please check and try again.");
    }
  };

  const resolvePaymentUser = async (): Promise<PaymentUser | null> => {
    if (authUser) return authUser;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session?.user) return sessionData.session.user;

    const phoneFromEmail = (sessionData.session?.user?.email ?? authUser?.email ?? "").endsWith("@bbd.app")
      ? (sessionData.session?.user?.email ?? authUser?.email ?? "").split("@")[0]
      : "";
    const phone = String((getUser().profile as any).phone ?? phoneFromEmail).replace(/\D/g, "");
    if (!phone) return null;

    await supabase.functions.invoke("ensure-phone-user", {
      body: {
        phone,
        country: (getUser().profile as any).country ?? null,
        country_code: (getUser().profile as any).country_code ?? null,
      },
    });

    const { data: signInData } = await supabase.auth.signInWithPassword({
      email: `${phone}@bbd.app`,
      password: `bbd_${phone}_secure`,
    });
    return signInData.user ?? null;
  };

  const finalizePostPayment = async (user: PaymentUser) => {
    if (!plan) return;
    // Coupon redemption and subscription activation happen server-side after
    // Razorpay signature verification, so they are never faked from the client.
    if (plan.assigns_coach !== false) {
      await autoAssignCoach(user.id, plan.plan_key);
      const c = await fetchAssignedCoach(user.id);
      setAssignedCoach(c);
    }
    await supabase
      .from("profiles" as any)
      .update({ onboarding_completed: true } as any)
      .eq("user_id", user.id);
    await sendWelcomeNotification(user.id);
    try {
      await (supabase as any).rpc("seed_onboarding_notifications", { _user_id: user.id });
    } catch {
      // Non-blocking: payment completion must not fail if notification seeding is unavailable.
    }
    setStep("success");
  };

  const handleRazorpayPay = async (user: PaymentUser) => {
    // Razorpay declines any checkout whose originating domain is not registered
    // on the merchant account. Only the approved domains below may open checkout;
    // anything else (e.g. app.byebyediabetes.com) is redirected first.
    if (!isApprovedCheckoutOrigin()) {
      window.location.replace(`${APPROVED_CHECKOUT_ORIGIN}/payment`);
      throw new Error("Redirecting to the secure checkout domain…");
    }

    const ok = await loadRazorpayScript();
    if (!ok) throw new Error("Failed to load Razorpay checkout.");

    const { data, error } = await supabase.functions.invoke("razorpay-create-order", {
      body: {
        plan_key: plan!.plan_key,
        billing_cycle: plan!.billing_cycle,
        mode: changeMode,
        coupon_code: coupon?.valid ? coupon.code : null,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    if (!data?.order_id) throw new Error("Could not create order.");

    await new Promise<void>((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        order_id: data.order_id,
        name: "Bye Bye Diabetes",
        description: data.plan_name || plan!.name,
        image: "https://bbdo.hyperrevamp.com/favicon.ico",
        prefill: { email: user.email ?? undefined },
        theme: { color: "#248CCB" },
        handler: async (resp: any) => {
          try {
            const { data: v, error: vErr } = await supabase.functions.invoke("razorpay-verify-payment", {
              body: resp,
            });
            if (vErr || !v?.verified) {
              reject(new Error("Payment received but verification failed. Contact support."));
              return;
            }
            resolve();
          } catch (e: any) {
            reject(e);
          }
        },
        modal: {
          ondismiss: () => reject(new Error("Payment cancelled.")),
        },
      });
      rzp.on("payment.failed", (resp: any) => {
        reject(new Error(resp?.error?.description || "Payment failed."));
      });
      rzp.open();
    });
  };

  const handlePay = async () => {
    setError(null);

    // Auth may still be hydrating when the user taps quickly after arriving.
    // Fall back to a live session check before erroring out.
    const effectiveUser = await resolvePaymentUser();
    if (!effectiveUser) {
      setError("You're not signed in. Please log in again to complete payment.");
      return;
    }
    if (!plan) {
      setError("Please select a package before completing payment.");
      return;
    }

    setLoading(true);
    try {
      // Every package — new purchase, upgrade, downgrade or renewal — goes
      // through live Razorpay checkout.
      await handleRazorpayPay(effectiveUser);
      await finalizePostPayment(effectiveUser);
    } catch (e: any) {
      console.error("Payment failed", e);
      setError(e?.message ?? "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    if (step === "success") {
      // Newly paid users always see the guided tour for their new package.
      const timer = setTimeout(() => navigate("/tour"), 4000);
      return () => clearTimeout(timer);
    }
  }, [step, navigate]);

  return (
    <div className="phone-container min-h-dvh flex flex-col px-6 pt-14 pb-10 relative overflow-hidden bg-background">
      <AnimatePresence initial={false}>
        {step === "form" ? (
          <motion.div key="form" className="flex flex-col flex-1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
            <div className="mb-8">
              <span className="text-xs font-medium text-primary uppercase tracking-widest">Almost there!</span>
              <h1 className="text-3xl font-black text-foreground mt-1">Start your<br />journey</h1>
            </div>

            <div className="liquid-glass rounded-2xl p-5 mb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Flame className="w-5 h-5 text-primary" strokeWidth={1.8} />
                  </div>
                  <div>
                    <p className="text-foreground font-bold">{plan?.name ?? "No package selected"}</p>
                    <p className="text-muted-foreground text-xs">{plan ? CYCLE_LABEL[plan.billing_cycle] : "Go back and choose a package"}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-primary font-black text-xl">
                    {plan ? `₹${payableAmount.toLocaleString("en-IN")}` : "—"}
                  </p>
                  <p className="text-muted-foreground text-xs">{plan ? `for ${duration} month${duration > 1 ? "s" : ""}` : "Select first"}</p>
                </div>
              </div>
              {preview && (
                <div className="mt-3 pt-3 border-t border-border/50 space-y-1">
                  {preview.credit > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Credit for unused days</span>
                      <span className="text-emerald-600 font-semibold">−₹{preview.credit.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {changeMode === "downgrade" ? "Starts on" : "Active from"}
                    </span>
                    <span className="text-foreground font-semibold">
                      {new Date(preview.starts_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </div>
                  {changeMode === "downgrade" && (
                    <p className="text-[11px] text-muted-foreground pt-1 leading-snug">
                      You keep your current plan and all its benefits until then.
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="liquid-glass rounded-2xl px-4 py-4 mb-8 flex items-center gap-3">
              <Lock className="w-4 h-4 text-primary shrink-0" strokeWidth={1.8} />
              <p className="text-xs text-muted-foreground leading-snug">
                You'll pay securely via Razorpay — UPI, cards, netbanking and wallets are all supported.
              </p>
            </div>


            {/* Referral code */}
            <div className="mb-4">
              <div className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <Gift className="w-4 h-4 text-primary shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  placeholder="Referral code (optional)"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value.toUpperCase());
                    if (referralStatus !== "idle") { setReferralStatus("idle"); setReferralMessage(""); }
                  }}
                  disabled={referralStatus === "valid"}
                  className="flex-1 bg-transparent text-foreground font-medium text-sm outline-none placeholder:text-muted-foreground min-w-0 uppercase disabled:opacity-70"
                />
                {referralStatus === "valid" ? (
                  <span className="text-success text-xs font-semibold flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Applied</span>
                ) : (
                  <button
                    type="button"
                    onClick={applyReferral}
                    disabled={!referralCode.trim() || referralStatus === "applying"}
                    className="text-primary text-xs font-semibold disabled:opacity-40"
                  >
                    {referralStatus === "applying" ? "Applying..." : "Apply"}
                  </button>
                )}
              </div>
              {referralMessage && (
                <p className={`text-xs mt-2 ml-1 ${referralStatus === "valid" ? "text-success" : "text-destructive"}`}>
                  {referralMessage}
                </p>
              )}
            </div>


            {/* Discount coupon */}
            <div className="mb-4">
              <div className="liquid-glass rounded-2xl px-4 py-3 flex items-center gap-3">
                <Ticket className="w-4 h-4 text-primary shrink-0" strokeWidth={1.8} />
                <input
                  type="text"
                  placeholder="Discount coupon (optional)"
                  value={couponCode}
                  onChange={(e) => {
                    setCouponCode(e.target.value.toUpperCase());
                    if (couponStatus !== "idle") { setCouponStatus("idle"); setCouponMessage(""); setCoupon(null); }
                  }}
                  disabled={couponStatus === "valid"}
                  className="flex-1 bg-transparent text-foreground font-medium text-sm outline-none placeholder:text-muted-foreground min-w-0 uppercase disabled:opacity-70"
                />
                {couponStatus === "valid" ? (
                  <button
                    type="button"
                    onClick={() => { setCoupon(null); setCouponStatus("idle"); setCouponMessage(""); setCouponCode(""); }}
                    className="text-xs font-semibold text-muted-foreground"
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={!couponCode.trim() || couponStatus === "applying"}
                    className="text-primary text-xs font-semibold disabled:opacity-40"
                  >
                    {couponStatus === "applying" ? "Checking..." : "Apply"}
                  </button>
                )}
              </div>
              {couponMessage && (
                <p className={`text-xs mt-2 ml-1 ${couponStatus === "valid" ? "text-success" : "text-destructive"}`}>
                  {couponStatus === "valid" && <Check className="w-3.5 h-3.5 inline mr-1" />}{couponMessage}
                </p>
              )}
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-xs mt-2 px-1">
                  <span className="text-muted-foreground line-through">₹{baseAmount.toLocaleString("en-IN")}</span>
                  <span className="text-emerald-600 font-semibold">You pay ₹{payableAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>

            <p className="text-muted-foreground text-xs text-center mb-3 flex items-center justify-center gap-1.5">
              <Lock className="w-3 h-3" strokeWidth={1.8} /> Secured with 256-bit encryption. Cancel anytime.
            </p>

            {error && (
              <div className="mb-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs text-center">
                {error}
              </div>
            )}

            <div className="ob-bottom">
              <motion.button onClick={handlePay} disabled={loading || authLoading || !plan} className="ob-cta gradient-blue glow-blue disabled:opacity-40" whileTap={{ scale: 0.98 }}>
                {loading ? (<><div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</>) : (<><Rocket className="w-5 h-5" strokeWidth={1.8} /> Start My Journey</>)}
              </motion.button>
            </div>

          </motion.div>
        ) : (
          <motion.div key="success" className="flex flex-col flex-1 items-center justify-center text-center" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1]}}>
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {Array.from({ length: 30 }).map((_, i) => (<ConfettiPiece key={i} delay={i * 0.05} />))}
            </div>

            <motion.div className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary/30 shadow-2xl mb-6">
              <img src={logoImg} alt="Bye Bye Diabetes" className="w-full h-full object-cover" />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <h1 className="text-3xl font-black text-foreground mb-2">Welcome to your<br />transformation journey!</h1>
              <p className="text-muted-foreground text-sm mb-6">{name}, your <span className="text-primary font-semibold">{plan?.name}</span> is now live.</p>
            </motion.div>

            {plan?.assigns_coach !== false && assignedCoach && (
              <motion.div className="w-full liquid-glass rounded-2xl p-5 text-left mb-4" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <p className="text-primary text-xs font-semibold uppercase tracking-widest mb-3">Your Assigned Coach</p>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full gradient-blue flex items-center justify-center flex-shrink-0 shadow-lg overflow-hidden">
                    {assignedCoach.avatar_url ? (
                      <img src={assignedCoach.avatar_url} alt={assignedCoach.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-black text-lg">{coachInitials}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-foreground font-black text-base">{assignedCoach.name}</p>
                    <p className="text-muted-foreground text-xs mt-0.5">{coachTypeLabel(assignedCoach.coach_type)}</p>
                    <div className="flex gap-0.5 mt-1 items-center">
                      {[...Array(5)].map((_, i) => (<Star key={i} className="w-3 h-3 fill-amber-400 text-amber-400" strokeWidth={0} />))}
                      <span className="text-muted-foreground text-xs ml-1">{assignedCoach.avg_rating || "5.0"}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">They'll reach out shortly to schedule your onboarding meeting.</p>
                  </div>
                </div>
              </motion.div>
            )}

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} className="flex items-center gap-2 text-muted-foreground text-xs">
              <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /> Taking you to your dashboard...
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
