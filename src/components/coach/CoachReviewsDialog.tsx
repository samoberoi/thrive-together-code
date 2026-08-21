import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Star, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Review {
  user_id: string;
  rating: number;
  review: string | null;
  created_at: string;
  name: string | null;
  avatar_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  coachId: string;
  avgRating: number;
  totalRatings: number;
  description?: string;
}

export default function CoachReviewsDialog({ open, onOpenChange, coachId, avgRating, totalRatings, description }: Props) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !coachId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: rows } = await supabase
          .from("coach_ratings" as any)
          .select("user_id, rating, review, created_at")
          .eq("coach_id", coachId)
          .order("created_at", { ascending: false });
        const list = ((rows as any[]) ?? []);
        const ids = Array.from(new Set(list.map((r) => r.user_id)));
        let profileMap = new Map<string, { name: string | null; avatar_url: string | null }>();
        if (ids.length) {
          const { data: profs } = await supabase
            .from("profiles" as any)
            .select("user_id, name, avatar_url")
            .in("user_id", ids);
          ((profs as any[]) ?? []).forEach((p) => profileMap.set(p.user_id, { name: p.name, avatar_url: p.avatar_url }));
        }
        if (cancelled) return;
        setReviews(list.map((r) => ({
          user_id: r.user_id,
          rating: r.rating,
          review: r.review,
          created_at: r.created_at,
          name: profileMap.get(r.user_id)?.name ?? null,
          avatar_url: profileMap.get(r.user_id)?.avatar_url ?? null,
        })));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, coachId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden max-h-[85dvh] flex flex-col">
        <DialogHeader className="px-5 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg font-black">
            <Star className="w-5 h-5 text-warning fill-warning" />
            {avgRating.toFixed(1)}
            <span className="text-muted-foreground text-sm font-medium">
              · {totalRatings} rating{totalRatings === 1 ? "" : "s"}
            </span>
          </DialogTitle>
          <DialogDescription>{description ?? "What your clients have said about you."}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading reviews…
            </div>
          ) : reviews.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-10">
              No ratings yet. Once patients rate you, they'll appear here.
            </div>
          ) : (
            reviews.map((r) => (
              <div key={r.user_id + r.created_at} className="rounded-2xl border border-border bg-card p-3 flex gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                  {r.avatar_url ? (
                    <img src={r.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-primary font-bold text-sm">{(r.name ?? "?")[0].toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground truncate">{r.name ?? "Client"}</p>
                    <span className="ml-auto flex items-center gap-0.5 shrink-0">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < r.rating ? "text-warning fill-warning" : "text-muted-foreground/30"}`}
                        />
                      ))}
                    </span>
                  </div>
                  {r.review && (
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">{r.review}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground/70 mt-1">
                    {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
