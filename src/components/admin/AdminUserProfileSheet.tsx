import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { whatsappCallUrl } from "@/lib/coachAvailability";
import { Phone, Mail, MessageCircle, MapPin, Activity, CreditCard, UserCheck } from "lucide-react";

interface Props {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const inr = (n: number | null | undefined) => (n || n === 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

export default function AdminUserProfileSheet({ userId, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [coachName, setCoachName] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setSubs([]);
      setCoachName(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: s }, { data: a }] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("*")
          .eq("user_id", userId)
          .order("started_at", { ascending: false }),
        (supabase as any)
          .from("coach_assignments")
          .select("coach_id, is_active, coaches(name)")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      setProfile(p ?? null);
      setSubs((s as any[]) ?? []);
      setCoachName((a as any)?.coaches?.name ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const active = subs.find((s) => s.status === "active");

  return (
    <Sheet open={!!userId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{profile?.name || (loading ? "Loading…" : "User profile")}</SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="py-16 flex justify-center">
            <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && !profile && userId && (
          <p className="py-12 text-center text-sm text-muted-foreground">No profile found for this user.</p>
        )}

        {!loading && profile && (
          <div className="mt-4 space-y-5 pb-8">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {profile.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {profile.phone}
                </span>
              )}
              {profile.email && !String(profile.email).endsWith("@bbd.app") && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {profile.email}
                </span>
              )}
              {(profile.city || profile.state) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {[profile.city, profile.state].filter(Boolean).join(", ")}
                </span>
              )}
              {profile.phone && (
                <a
                  href={whatsappCallUrl(profile.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-white text-[11px] font-semibold"
                  style={{ background: "#25D366" }}
                >
                  <MessageCircle className="w-3 h-3" /> WhatsApp
                </a>
              )}
            </div>

            <Section icon={CreditCard} title="Subscription">
              {active ? (
                <div className="grid grid-cols-2 gap-2">
                  <Cell label="Plan" value={active.plan_name || active.plan_id} />
                  <Cell label="Amount" value={inr(active.plan_price)} />
                  <Cell label="Started" value={fmtDate(active.started_at)} />
                  <Cell label="Expires" value={fmtDate(active.expires_at)} />
                  <Cell label="Duration" value={`${active.duration_months || 1} mo`} />
                  <Cell label="Status" value={active.status} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No active subscription.</p>
              )}
              {subs.length > 1 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">History</p>
                  {subs.map((s) => (
                    <p key={s.id} className="text-xs text-muted-foreground">
                      {s.plan_name} · {fmtDate(s.started_at)} → {fmtDate(s.expires_at)} · {s.status} · {inr(s.plan_price)}
                    </p>
                  ))}
                </div>
              )}
            </Section>

            <Section icon={UserCheck} title="Coach">
              <p className="text-sm">{coachName || profile.coach_name || "Unassigned"}</p>
            </Section>

            <Section icon={Activity} title="Health snapshot">
              <div className="grid grid-cols-2 gap-2">
                <Cell label="Age" value={profile.age ? `${profile.age} yrs` : "—"} />
                <Cell label="Gender" value={profile.gender || "—"} />
                <Cell label="Height" value={profile.height ? `${profile.height} cm` : "—"} />
                <Cell label="Weight" value={profile.weight ? `${profile.weight} kg` : "—"} />
                <Cell label="BMI" value={profile.bmi ? Number(profile.bmi).toFixed(1) : "—"} />
                <Cell label="BMI Category" value={profile.bmi_category || "—"} />
                <Cell label="Waist" value={profile.waist ? `${profile.waist} cm` : "—"} />
                <Cell label="Joined" value={fmtDate(profile.created_at)} />
              </div>
            </Section>

            {Array.isArray(profile.goals) && profile.goals.length > 0 && (
              <Section title="Goals">
                <div className="flex flex-wrap gap-1.5">
                  {(profile.goals as string[]).map((g, i) => (
                    <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      {g}
                    </span>
                  ))}
                </div>
              </Section>
            )}

            {profile.clinical && typeof profile.clinical === "object" && Object.keys(profile.clinical).length > 0 && (
              <Section title="Clinical data">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(profile.clinical as Record<string, any>).map(([k, v]) => (
                    <Cell key={k} label={k.replace(/_/g, " ")} value={String(v)} />
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon?: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border p-3 space-y-2">
      <p className="text-xs font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {title}
      </p>
      {children}
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-muted/40 p-2.5">
      <p className="text-[11px] text-muted-foreground capitalize">{label}</p>
      <p className="text-sm text-foreground font-medium break-words">{value}</p>
    </div>
  );
}
