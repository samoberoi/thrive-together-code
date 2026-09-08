import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { whatsappCallUrl } from "@/lib/coachAvailability";
import {
  Phone, Mail, MessageCircle, MapPin, Activity, CreditCard, UserCheck,
  HeartPulse, Droplets, Scale, Footprints, ClipboardList, AlertTriangle,
} from "lucide-react";
import {
  isSevereBp, isSevereSugar, isHighBp, isHighSugar, type RiskSnapshot,
} from "@/components/admin/UserRiskFilters";

interface Props {
  userId: string | null;
  onOpenChange: (open: boolean) => void;
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtDateTime = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      })
    : "—";
const inr = (n: number | null | undefined) => (n || n === 0 ? `₹${Math.round(n).toLocaleString("en-IN")}` : "—");

interface LogRow {
  id: string;
  log_type: string;
  logged_at: string;
  weight_kg: number | null;
  steps_count: number | null;
  glucose_morning: number | null;
  glucose_evening: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  notes?: string | null;
}

const LOG_META: Record<string, { label: string; icon: React.ElementType }> = {
  diabetes: { label: "Blood sugar", icon: Droplets },
  bp: { label: "Blood pressure", icon: HeartPulse },
  weight: { label: "Weight", icon: Scale },
  water: { label: "Water", icon: Droplets },
  steps: { label: "Steps", icon: Footprints },
};

function logSummary(l: LogRow): string {
  switch (l.log_type) {
    case "diabetes": {
      const parts = [
        l.glucose_morning ? `Fasting ${l.glucose_morning} mg/dL` : null,
        l.glucose_evening ? `Post-meal ${l.glucose_evening} mg/dL` : null,
      ].filter(Boolean);
      return parts.join(" · ") || "Logged";
    }
    case "bp":
      return l.bp_systolic && l.bp_diastolic ? `${l.bp_systolic}/${l.bp_diastolic} mmHg` : "Logged";
    case "weight":
      return l.weight_kg ? `${l.weight_kg} kg` : "Logged";
    case "water":
      return l.weight_kg ? `${l.weight_kg} glasses` : "Logged";
    case "steps":
      return l.steps_count ? `${Number(l.steps_count).toLocaleString("en-IN")} steps` : "Logged";
    default:
      return "Logged";
  }
}

export default function AdminUserProfileSheet({ userId, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [coachName, setCoachName] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [diet, setDiet] = useState<any>(null);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setSubs([]);
      setCoachName(null);
      setLogs([]);
      setDiet(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: s }, { data: a }, { data: l }, { data: d }] = await Promise.all([
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
        (supabase as any)
          .from("health_logs")
          .select("id, log_type, logged_at, weight_kg, steps_count, glucose_morning, glucose_evening, bp_systolic, bp_diastolic")
          .eq("user_id", userId)
          .order("logged_at", { ascending: false })
          .limit(40),
        (supabase as any).from("user_diet_profiles").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (cancelled) return;
      setProfile(p ?? null);
      setSubs((s as any[]) ?? []);
      setCoachName((a as any)?.coaches?.name ?? null);
      setLogs(((l as any[]) ?? []) as LogRow[]);
      setDiet(d ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const active = subs.find((s) => s.status === "active");

  // 7-day risk picture derived from the same logs we already fetched.
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const recent = logs.filter((l) => new Date(l.logged_at).getTime() >= cutoff);
  const riskSnap: RiskSnapshot = {
    maxGlucose: recent.reduce(
      (m, l) => Math.max(m, Number(l.glucose_morning) || 0, Number(l.glucose_evening) || 0), 0) || null,
    maxSystolic: recent.reduce((m, l) => Math.max(m, Number(l.bp_systolic) || 0), 0) || null,
    maxDiastolic: recent.reduce((m, l) => Math.max(m, Number(l.bp_diastolic) || 0), 0) || null,
    lastLoggedAt: logs[0]?.logged_at ?? null,
  };
  const flags: { label: string; severe: boolean }[] = [];
  if (isSevereSugar(riskSnap)) flags.push({ label: `Severe blood sugar · ${riskSnap.maxGlucose}`, severe: true });
  else if (isHighSugar(riskSnap)) flags.push({ label: `High blood sugar · ${riskSnap.maxGlucose}`, severe: false });
  if (isSevereBp(riskSnap)) flags.push({ label: `Severe BP · ${riskSnap.maxSystolic}/${riskSnap.maxDiastolic}`, severe: true });
  else if (isHighBp(riskSnap)) flags.push({ label: `High BP · ${riskSnap.maxSystolic}/${riskSnap.maxDiastolic}`, severe: false });

  const allergies: string[] = Array.isArray(diet?.allergies) ? diet.allergies : [];

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

            {flags.length > 0 && (
              <div className="space-y-1.5">
                {flags.map((f) => (
                  <div
                    key={f.label}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                      f.severe
                        ? "bg-destructive/10 text-destructive"
                        : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {f.label} <span className="font-normal opacity-70">· last 7 days</span>
                  </div>
                ))}
              </div>
            )}

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
                <Cell label="Health score" value={profile.initial_health_score ? String(profile.initial_health_score) : "—"} />
                <Cell label="Country" value={profile.country || profile.region_code || "—"} />
                <Cell label="Joined" value={fmtDate(profile.created_at)} />
              </div>
            </Section>

            <Section icon={ClipboardList} title="Recent logs">
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {logs.map((l) => {
                    const meta = LOG_META[l.log_type] ?? { label: l.log_type, icon: ClipboardList };
                    const Icon = meta.icon;
                    return (
                      <div key={l.id} className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">
                            {meta.label} · {logSummary(l)}
                          </p>
                          <p className="text-[11px] text-muted-foreground">{fmtDateTime(l.logged_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>

            {(diet?.diet_preference || allergies.length > 0) && (
              <Section title="Diet & allergies">
                <div className="grid grid-cols-2 gap-2">
                  <Cell label="Diet type" value={diet?.diet_preference || "—"} />
                  <Cell label="Allergies" value={allergies.length ? allergies.join(", ") : "None"} />
                </div>
              </Section>
            )}

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

            {profile.lifestyle && typeof profile.lifestyle === "object" && Object.keys(profile.lifestyle).length > 0 && (
              <Section title="Lifestyle">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(profile.lifestyle as Record<string, any>).map(([k, v]) => (
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
