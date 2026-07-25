import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Award, Briefcase, Globe2, MapPin, Phone, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAssignedCoach, type Coach } from "@/lib/coachService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preferred: fetch directly by coach id */
  coachId?: string | null;
  /** Fallback: fetch the active coach assigned to this user */
  userId?: string | null;
}

export default function CoachSummaryDialog({ open, onOpenChange, coachId, userId }: Props) {
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        if (coachId) {
          const { data } = await supabase
            .from("coaches" as any)
            .select("id, name, phone, bio, description, specialization, coach_type, years_experience, total_consultations, avg_rating, total_ratings, avatar_url, languages, qualification, city, is_active")
            .eq("id", coachId)
            .maybeSingle();
          if (!cancelled) setCoach((data as any) ?? null);
        } else if (userId) {
          const c = await fetchAssignedCoach(userId);
          if (!cancelled) setCoach(c);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, coachId, userId]);

  const initials = (coach?.name ?? "C").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <div
          className="relative px-6 pt-7 pb-6 text-white"
          style={{ background: "var(--bbdo-gradient)" }}
        >
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="relative flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center overflow-hidden shrink-0 border border-white/30">
              {coach?.avatar_url ? (
                <img src={coach.avatar_url} alt={coach.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-lg font-black">{initials}</span>
              )}
            </div>
            <DialogHeader className="text-left space-y-1 flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/80">Your Coach</p>
              <DialogTitle className="text-xl font-black text-white leading-tight truncate">
                {loading ? "Loading…" : coach?.name ?? "Coach"}
              </DialogTitle>
              <DialogDescription className="text-white/85 text-xs">
                {coach?.specialization ?? coach?.qualification ?? "BBDO Metabolic Health Coach"}
              </DialogDescription>
            </DialogHeader>
          </div>

          {coach && (
            <div className="relative mt-4 flex items-center gap-4 text-[11px] font-semibold text-white/90">
              <span className="flex items-center gap-1"><Star className="w-3.5 h-3.5 fill-white text-white" /> {coach.avg_rating?.toFixed?.(1) ?? "5.0"}</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {coach.total_consultations ?? 0} sessions</span>
              <span className="flex items-center gap-1"><Briefcase className="w-3.5 h-3.5" /> {coach.years_experience ?? 0}y exp</span>
            </div>
          )}
        </div>

        <div className="px-6 py-5 space-y-4">
          {coach?.bio && (
            <p className="text-sm text-foreground/90 leading-relaxed">{coach.bio}</p>
          )}
          {!coach?.bio && coach?.description && (
            <p className="text-sm text-foreground/90 leading-relaxed">{coach.description}</p>
          )}

          <div className="grid grid-cols-1 gap-2.5 text-sm">
            {coach?.qualification && (
              <Row icon={Award} label="Qualification" value={coach.qualification} />
            )}
            {coach?.languages && coach.languages.length > 0 && (
              <Row icon={Globe2} label="Languages" value={coach.languages.join(", ")} />
            )}
            {coach?.city && (
              <Row icon={MapPin} label="City" value={coach.city} />
            )}
            {coach?.working_hours_start && coach?.working_hours_end && (
              <Row icon={Phone} label="Available" value={`${coach.working_hours_start.slice(0,5)} – ${coach.working_hours_end.slice(0,5)}`} />
            )}
          </div>

          {!loading && !coach && (
            <p className="text-sm text-muted-foreground">Coach details are not available yet. Please check back after your first consultation is scheduled.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-foreground" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
