import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Star, FileText, Upload, MessageCircle, ChevronRight, Award, Loader2, Phone, MessageSquareWarning, Clock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchAssignedCoach, fetchMyRating, rateCoach, coachTypeLabel, type Coach } from "@/lib/coachService";
import { getCoachAvailability, whatsappCallUrl } from "@/lib/coachAvailability";
import { useToast } from "@/hooks/use-toast";
import PatientChat from "@/components/chat/PatientChat";
import UpcomingMeetingsCard from "@/components/patient/UpcomingMeetingsCard";
import RecommendationsPanel from "@/components/patient/RecommendationsPanel";
import RequestConsultationDialog from "@/components/patient/RequestConsultationDialog";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState } from "@/components/shared";

const reports = [
  { name: "HbA1c Report", date: "Jun 10, 2025", status: "Normal", statusColor: "text-primary bg-primary/10 border-primary/20" },
  { name: "Lipid Panel", date: "Jun 10, 2025", status: "Review", statusColor: "text-warning bg-warning/10 border-warning/20" },
  { name: "Fasting Glucose", date: "May 20, 2025", status: "Normal", statusColor: "text-primary bg-primary/10 border-primary/20" },
];

function StarRating({ rating, onRate, interactive = false }: { rating: number; onRate?: (r: number) => void; interactive?: boolean }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          disabled={!interactive}
          className={`transition-transform ${interactive ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
          onMouseEnter={() => interactive && setHovered(i)}
          onMouseLeave={() => interactive && setHovered(0)}
          onClick={() => interactive && onRate?.(i)}
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              (hovered || rating) >= i
                ? "text-warning fill-warning"
                : "text-muted-foreground/30"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

export default function Consult() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [myRating, setMyRating] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [review, setReview] = useState("");
  const [showChat, setShowChat] = useState(false);
  const [planId, setPlanId] = useState<string | null>(null);
  const [reqOpen, setReqOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    fetchAssignedCoach(user.id).then(async (c) => {
      if (cancelled) return;
      setCoach(c);
      if (c) {
        const r = await fetchMyRating(user.id, c.id);
        if (cancelled) return;
        if (r) {
          setMyRating(r.rating);
          setReview(r.review ?? "");
        }
      }
      setLoading(false);
    });
    supabase
      .from("subscriptions")
      .select("plan_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setPlanId((data as any)?.plan_id ?? null));
    return () => { cancelled = true; };
  }, [user]);

  // Allow the Home greeting (and other surfaces) to jump straight into the coach chat.
  useEffect(() => {
    const openChat = () => setShowChat(true);
    try {
      if (sessionStorage.getItem("bbdo:openCoachChat") === "1") {
        sessionStorage.removeItem("bbdo:openCoachChat");
        setShowChat(true);
      }
    } catch {}
    window.addEventListener("nav:open-coach-chat", openChat);
    return () => window.removeEventListener("nav:open-coach-chat", openChat);
  }, []);

  const handleRate = async (rating: number) => {
    if (!user || !coach) return;
    setMyRating(rating);
    setSubmittingRating(true);
    const ok = await rateCoach(user.id, coach.id, rating, review || undefined);
    setSubmittingRating(false);
    if (ok) {
      toast({ title: "Rating submitted!", description: `You rated ${coach.name} ${rating} stars` });
      // Refresh coach data for updated avg
      const updated = await fetchAssignedCoach(user.id);
      if (updated) setCoach(updated);
    }
  };

  const handleSubmitReview = async () => {
    if (!user || !coach || !myRating) return;
    setSubmittingRating(true);
    const ok = await rateCoach(user.id, coach.id, myRating, review || undefined);
    setSubmittingRating(false);
    if (ok) {
      toast({ title: "Review updated!" });
      setShowRating(false);
      const updated = await fetchAssignedCoach(user.id);
      if (updated) setCoach(updated);
    }
  };

  if (loading) {
    return <LoadingState variant="page" />;
  }

  // Show chat view
  if (showChat && coach) {
    return <PatientChat coach={coach} onBack={() => setShowChat(false)} />;
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-4 pb-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-black text-foreground">My Coach</h1>
        <p className="text-muted-foreground text-sm">Your personal health team</p>
      </motion.div>

      <UpcomingMeetingsCard />
      <RecommendationsPanel />

      {/* Consultation request removed — patients chat directly with their coach */}


      {/* Coach Card */}
      {coach ? (
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-start gap-4">
            <img
              src={coach.avatar_url || "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=120&h=120&fit=crop&crop=face"}
              alt={coach.name}
              className="w-16 h-16 rounded-2xl object-cover flex-shrink-0"
            />
            <div className="flex-1">
              <h3 className="text-foreground font-black text-base">{coach.name}</h3>
              <p className="text-muted-foreground text-xs mt-0.5">{coach.specialization}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  {coachTypeLabel(coach.coach_type)}
                </span>
              </div>
              {coach.phone && (
                <a
                  href={whatsappCallUrl(coach.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 mt-2 text-primary text-xs font-medium"
                >
                  <Phone className="w-3.5 h-3.5" strokeWidth={1.6} />
                  +91 {coach.phone}
                </a>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  <Star className="w-3.5 h-3.5 text-warning fill-warning" />
                  <span className="text-foreground font-bold">{Number(coach.avg_rating).toFixed(1)}</span>
                  <span>({coach.total_ratings})</span>
                </span>
                <span>•</span>
                <span className="whitespace-nowrap">{coach.bbdo_community_exp} yrs exp</span>
                <span>•</span>
                <span className="whitespace-nowrap">{coach.total_consultations.toLocaleString()} sessions</span>
              </div>
            </div>
          </div>

          {coach.description && (
            <p className="text-muted-foreground text-xs leading-relaxed mt-3 border-t border-border/50 pt-3">
              {coach.description}
            </p>
          )}

          {(() => {
            const av = getCoachAvailability(coach);
            const waMsg = `Hi ${coach.name}, I'm your patient on Bye Bye Diabetes. Can we talk?`;
            return (
              <div className="mt-4">
                <div className={`flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded-xl border ${av.available ? "text-success bg-success/10 border-success/20" : "text-warning bg-warning/10 border-warning/20"}`}>
                  <Clock className="w-3.5 h-3.5" strokeWidth={2} />
                  <span className="font-semibold">
                    {av.available ? "Available now" : "Not currently available"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-foreground/80">Working hours {av.windowLabel}</span>
                </div>
                {!av.available && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Your coach is offline right now (their local time: {av.nowLabel}). Please try again during working hours.
                  </p>
                )}
                <div className="flex gap-3">
                  <a
                    href={av.available && coach.phone ? whatsappCallUrl(coach.phone, waMsg) : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!av.available || !coach.phone}
                    onClick={(e) => {
                      if (!av.available || !coach.phone) {
                        e.preventDefault();
                        toast({
                          title: "Coach unavailable",
                          description: `${coach.name} is available ${av.windowLabel}.`,
                        });
                      }
                    }}
                    className={`flex-1 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 ${
                      av.available && coach.phone
                        ? "gradient-blue text-primary-foreground glow-blue"
                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-70"
                    }`}
                  >
                    <Phone className="w-4 h-4" strokeWidth={1.6} />
                    WhatsApp Call
                  </a>
                  <button
                    onClick={() => setShowChat(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl liquid-glass text-foreground text-sm font-medium"
                  >
                    <MessageCircle className="w-4 h-4 text-primary" strokeWidth={1.6} />
                    Chat
                  </button>
                </div>
              </div>
            );
          })()}
        </motion.div>
      ) : (
        <motion.div className="liquid-glass rounded-3xl p-6 text-center" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }}>
          <Award className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-bold">No Coach Assigned</p>
          <p className="text-muted-foreground text-sm mt-1">A coach will be assigned when you subscribe to a plan</p>
        </motion.div>
      )}

      {/* Rate Your Coach */}
      {coach && (
        <motion.div className="liquid-glass rounded-3xl p-5" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-warning" strokeWidth={1.6} />
              <span className="text-foreground font-bold">Rate Your Coach</span>
            </div>
            {myRating > 0 && !showRating && (
              <button onClick={() => setShowRating(true)} className="text-primary text-xs font-medium">
                Edit Review
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <StarRating rating={myRating} onRate={handleRate} interactive />
            {myRating > 0 && (
              <span className="text-muted-foreground text-xs">
                {myRating === 5 ? "Excellent!" : myRating === 4 ? "Great!" : myRating === 3 ? "Good" : myRating === 2 ? "Fair" : "Poor"}
              </span>
            )}
            {submittingRating && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
          </div>
          {(showRating || (!review && myRating > 0)) && (
            <div className="mt-3">
              <textarea
                className="w-full bg-background/50 border border-border rounded-xl p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/30"
                rows={3}
                placeholder="Share your experience with your coach…"
                value={review}
                onChange={(e) => setReview(e.target.value)}
              />
              <button
                onClick={handleSubmitReview}
                disabled={submittingRating}
                className="mt-2 gradient-blue text-primary-foreground font-bold py-2 px-4 rounded-xl text-sm"
              >
                {submittingRating ? "Saving…" : "Submit Review"}
              </button>
            </div>
          )}
        </motion.div>
      )}

    </div>
  );
}
