import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyBookings } from "@/lib/yogaBookingService";
import YogaChat from "@/components/chat/YogaChat";
import { LoadingState, EmptyState } from "@/components/shared";

interface InstructorRow {
  partner_id: string;
  name: string | null;
  avatar_url: string | null;
  headline: string | null;
}

/**
 * Messages tab — foundation-package users chat with their yoga instructor(s) only.
 * Foundation users have no coach, so this surface intentionally excludes coach chats.
 */
export default function Messages() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [instructors, setInstructors] = useState<InstructorRow[]>([]);
  const [active, setActive] = useState<InstructorRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const bookings = await fetchMyBookings();
      const activeBookings = bookings.filter(
        (b) => b.status !== "cancelled" && b.status !== "completed",
      );
      const partnerIds = Array.from(new Set(activeBookings.map((b) => b.partner_id)));
      if (partnerIds.length === 0) {
        if (!cancelled) {
          setInstructors([]);
          setLoading(false);
        }
        return;
      }
      const { data } = await supabase
        .from("partner_directory" as any)
        .select("id, name, avatar_url, headline")
        .in("id", partnerIds);
      const rows: InstructorRow[] = ((data as any) ?? []).map((p: any) => ({
        partner_id: p.id,
        name: p.name,
        avatar_url: p.avatar_url,
        headline: p.headline,
      }));
      if (!cancelled) {
        setInstructors(rows);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (active && user) {
    return (
      <div className="pt-4 pb-6">
        <YogaChat
          role="subscriber"
          subscriberId={user.id}
          partnerId={active.partner_id}
          partnerName={active.name}
          partnerAvatar={active.avatar_url}
          onBack={() => setActive(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pt-4 pb-6 px-5">
      <div>
        <p className="text-[11px] tracking-[0.18em] uppercase font-bold text-primary">Messages</p>
        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground mt-1">
          Your instructor
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Message your yoga instructor directly about schedule, form or questions.
        </p>
      </div>

      {loading ? (
        <LoadingState variant="card" label="Loading your instructor…" />
      ) : instructors.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title="No instructor yet"
          description="Once you opt in to a yoga class, you'll be able to message your instructor here."
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {instructors.map((i) => (
            <button
              key={i.partner_id}
              onClick={() => setActive(i)}
              className="flex items-center gap-3 rounded-2xl p-4 liquid-glass text-left hover:-translate-y-px transition"
            >
              <div className="w-11 h-11 rounded-full overflow-hidden bg-primary/10 ring-1 ring-border shrink-0 flex items-center justify-center">
                {i.avatar_url ? (
                  <img loading="lazy" decoding="async" src={i.avatar_url} alt={i.name ?? "Instructor"} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-black text-sm">
                    {(i.name ?? "I").trim().charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-foreground truncate">{i.name ?? "Instructor"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {i.headline ?? "Yoga instructor"}
                </p>
              </div>
              <MessageCircle className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
