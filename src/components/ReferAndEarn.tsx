import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Gift, Copy, Share2, Users, Check, ArrowLeft, Loader2, Trophy } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { getOrCreateReferralCode, fetchMyReferrals, shareReferralCode, type Referral } from "@/lib/referralService";
import { toast } from "sonner";

interface ReferAndEarnProps {
  onBack: () => void;
}

export default function ReferAndEarn({ onBack }: ReferAndEarnProps) {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      getOrCreateReferralCode(user.id),
      fetchMyReferrals(user.id),
    ]).then(([c, refs]) => {
      setCode(c);
      setReferrals(refs);
      setLoading(false);
    });
  }, [user]);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("Code copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleShare = async () => {
    if (!code) return;
    const result = await shareReferralCode(code, "");
    if (result === "shared") toast.success("Shared successfully!");
    else if (result === "copied") toast.success("Link copied to clipboard!");
    else toast.error("Failed to share");
  };

  const completedReferrals = referrals.filter((r) => r.status === "completed").length;
  const pendingReferrals = referrals.filter((r) => r.status === "pending").length;
  const rewardsEarned = referrals.reduce((sum, r) => sum + (r.reward_granted ? (r as any).reward_days ?? 0 : 0), 0);

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 bg-background border-b border-border">
        <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} />
        </button>
        <h2 className="min-w-0 text-lg font-black text-foreground leading-tight break-words">Refer & Earn</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Hero Card */}
            <motion.div
              className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/10 border border-primary/20 p-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-primary/10 blur-2xl" />
              <div className="flex items-start gap-3 mb-4">
                <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/20 flex items-center justify-center">
                  <Gift className="w-6 h-6 text-primary" strokeWidth={1.8} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-foreground font-black text-lg leading-tight break-words">Share & Earn</h3>
                  <p className="text-muted-foreground text-xs leading-snug break-words">Up to 2 months free for every friend who joins</p>
                </div>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed mb-5">
                Share your referral code with friends & family. When they become a BBDO member,
                you get free days added to your plan — <span className="text-primary font-bold">2 months</span> for a yearly plan, 1 month for 6 months, 15 days for quarterly and 1 week for monthly.
              </p>

              {/* Referral Code Display */}
              <div className="bg-background/80 backdrop-blur-sm rounded-2xl p-4 flex items-start justify-between gap-3 border border-border">
                <div className="min-w-0">
                  <p className="text-muted-foreground text-[10px] uppercase tracking-widest font-medium mb-1 leading-tight break-words">Your Referral Code</p>
                  <p className="text-foreground font-black text-2xl tracking-[0.12em] leading-tight break-all">{code ?? "—"}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="w-10 h-10 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center transition-colors active:scale-95"
                >
                  {copied ? (
                    <Check className="w-5 h-5 text-green-400" strokeWidth={2} />
                  ) : (
                    <Copy className="w-5 h-5 text-primary" strokeWidth={1.8} />
                  )}
                </button>
              </div>
            </motion.div>

            {/* Share Button */}
            <motion.button
              onClick={handleShare}
              className="w-full gradient-blue text-primary-foreground font-bold py-4 rounded-2xl glow-blue flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              whileTap={{ scale: 0.98 }}
            >
              <Share2 className="w-5 h-5" strokeWidth={1.8} />
              Share Invite Link
            </motion.button>

            {/* Stats Cards */}
            <motion.div
              className="grid grid-cols-3 gap-2 min-[380px]:gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="liquid-glass rounded-2xl p-3 min-w-0 flex flex-col items-center gap-1 text-center">
                <Users className="w-4 h-4 text-primary" strokeWidth={1.8} />
                <p className="text-foreground text-xl font-black leading-tight break-words">{referrals.length}</p>
                <p className="text-muted-foreground text-[10px] font-medium leading-tight break-words">Invited</p>
              </div>
              <div className="liquid-glass rounded-2xl p-3 min-w-0 flex flex-col items-center gap-1 text-center">
                <Check className="w-4 h-4 text-green-400" strokeWidth={2} />
                <p className="text-foreground text-xl font-black leading-tight break-words">{completedReferrals}</p>
                <p className="text-muted-foreground text-[10px] font-medium leading-tight break-words">Joined</p>
              </div>
              <div className="liquid-glass rounded-2xl p-3 min-w-0 flex flex-col items-center gap-1 text-center">
                <Trophy className="w-4 h-4 text-warning" strokeWidth={1.8} />
                <p className="text-foreground text-xl font-black leading-tight break-words">{rewardsEarned}</p>
                <p className="text-muted-foreground text-[10px] font-medium leading-tight break-words">Days Earned</p>
              </div>
            </motion.div>

            {/* How it Works */}
            <motion.div
              className="liquid-glass rounded-2xl p-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <h4 className="text-foreground font-bold text-sm mb-4 leading-tight break-words">How it works</h4>
              <div className="flex flex-col gap-4">
                {[
                  { step: "1", title: "Share your code", desc: "Send your unique code to friends & family" },
                  { step: "2", title: "They sign up", desc: "Your friend joins BBDO using your referral code" },
                  { step: "3", title: "They subscribe", desc: "Once they become a paying member" },
                  { step: "4", title: "You earn!", desc: "Yearly = 2 months free, 6 months = 1 month, quarterly = 15 days, monthly = 1 week" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-primary text-xs font-black">{item.step}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground text-sm font-semibold leading-tight break-words">{item.title}</p>
                      <p className="text-muted-foreground text-xs leading-snug break-words">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Referral History */}
            {referrals.length > 0 && (
              <motion.div
                className="liquid-glass rounded-2xl p-5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <h4 className="text-foreground font-bold text-sm mb-3 leading-tight break-words">Referral History</h4>
                <div className="flex flex-col gap-3">
                  {referrals.map((ref) => (
                    <div key={ref.id} className="flex items-start justify-between gap-2 py-2 border-b border-border last:border-0">
                      <div className="min-w-0 flex items-start gap-2">
                        <div className="w-8 h-8 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
                          <Users className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-foreground text-sm font-medium leading-tight break-words">Referral</p>
                          <p className="text-muted-foreground text-[10px] leading-tight break-words">
                            {new Date(ref.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </div>
                      </div>
                      <span className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full leading-tight ${
                        ref.status === "completed"
                          ? "bg-green-400/20 text-green-400"
                          : "bg-warning/20 text-warning"
                      }`}>
                        {ref.status === "completed" ? "Joined" : "Pending"}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
