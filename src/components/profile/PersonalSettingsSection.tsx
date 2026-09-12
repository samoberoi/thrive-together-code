import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, UserCog, CircleDashed, Utensils, Bell, Shield, Settings, ClipboardList,
  LifeBuoy, Activity, Heart, Scale, Pill, BellRing, BellOff, Globe, Zap, Plus, Loader2,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppLanguages } from "@/hooks/useAppLanguages";
import { LANGUAGE_LABELS, type Language } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/appVersion";
import EditProfile from "@/components/EditProfile";
import RingManagement from "@/components/RingManagement";
import DietPreferences from "@/components/DietPreferences";
import PrivacySecurityPage from "@/components/PrivacySecurityPage";
import HelpSupport from "@/components/HelpSupport";
import LogTrendChart from "@/components/log-trends/LogTrendChart";
import { EmptyState, LoadingState } from "@/components/shared";
import { fetchHealthLogs, formatLogDate, insertHealthLog, type HealthLog } from "@/lib/healthLogsService";
import { toast } from "sonner";
import {
  playNotificationSound, getMasterVolume, setMasterVolume, getMuted, setMuted,
} from "@/lib/soundEngine";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { registerNativePushWithToast, isNativePushSupported } from "@/lib/nativePush";

type SubPage =
  | null | "editProfile" | "rings" | "diet" | "notifications" | "privacy" | "appSettings" | "logs" | "help";

function Overlay({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div
        className="sticky top-0 z-30 flex items-center gap-3 px-4 pb-3 bg-background/95 backdrop-blur border-b border-border"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="w-11 h-11 shrink-0 rounded-full liquid-glass flex items-center justify-center active:scale-95 transition"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" strokeWidth={2} />
        </button>
        <h2 className="flex-1 min-w-0 text-lg font-black text-foreground leading-tight break-words">{title}</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-5 pb-24">{children}</div>
    </div>
  );
}

/** Personal settings shared by members, coaches and super admins. */
export default function PersonalSettingsSection({ heading = "My Settings" }: { heading?: string }) {
  const { user } = useAuth();
  const { t, lang, setLang } = useLanguage();
  const { languages: enabledLanguages } = useAppLanguages({ onlyEnabled: true });
  const [sub, setSub] = useState<SubPage>(null);

  /* ── Notification preferences ─────────────────────────────────────── */
  const [notifDailyLog, setNotifDailyLog] = useState(true);
  const [notifWeightReminder, setNotifWeightReminder] = useState(true);
  const [notifCommunity, setNotifCommunity] = useState(true);
  const [notifSupplement, setNotifSupplement] = useState(true);
  const [notifAppointment, setNotifAppointment] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [soundVolume, setSoundVolumeState] = useState(() => getMasterVolume());
  const [soundMuted, setSoundMutedState] = useState(() => getMuted());

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences" as any)
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setNotifDailyLog(d.daily_log_reminders);
        setNotifWeightReminder(d.weekly_weight_reminder);
        setNotifSupplement(d.supplement_reminders);
        setNotifAppointment(d.appointment_alerts);
        setNotifCommunity(d.community_updates);
      }
      setPrefsLoaded(true);
    })();
  }, [user]);

  useEffect(() => {
    if (!user || !prefsLoaded) return;
    void supabase.from("notification_preferences" as any).upsert(
      {
        user_id: user.id,
        daily_log_reminders: notifDailyLog,
        weekly_weight_reminder: notifWeightReminder,
        supplement_reminders: notifSupplement,
        appointment_alerts: notifAppointment,
        community_updates: notifCommunity,
      } as any,
      { onConflict: "user_id" },
    );
  }, [notifDailyLog, notifWeightReminder, notifSupplement, notifAppointment, notifCommunity, user, prefsLoaded]);

  /* ── My logs ──────────────────────────────────────────────────────── */
  const [logsTab, setLogsTab] = useState<"diabetes" | "bp" | "weight">("diabetes");
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [glucoseM, setGlucoseM] = useState("");
  const [glucoseE, setGlucoseE] = useState("");
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [weight, setWeight] = useState("");

  useEffect(() => {
    if (sub !== "logs" || !user) return;
    setLogsLoading(true);
    fetchHealthLogs(logsTab, user.id, 365)
      .then((rows) => setLogs(rows))
      .catch(console.error)
      .finally(() => setLogsLoading(false));
  }, [sub, logsTab, user, reloadKey]);

  const saveLog = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const base = { user_id: user.id, logged_at: new Date().toISOString() };
      if (logsTab === "diabetes") {
        const m = glucoseM ? parseFloat(glucoseM) : null;
        const e = glucoseE ? parseFloat(glucoseE) : null;
        if (!m && !e) { toast.error("Enter at least one glucose value"); return; }
        await insertHealthLog({ ...base, log_type: "diabetes", glucose_morning: m, glucose_evening: e } as any);
        setGlucoseM(""); setGlucoseE("");
      } else if (logsTab === "bp") {
        const s = systolic ? parseInt(systolic) : null;
        const d = diastolic ? parseInt(diastolic) : null;
        if (!s || !d) { toast.error("Enter both systolic and diastolic"); return; }
        await insertHealthLog({ ...base, log_type: "bp", bp_systolic: s, bp_diastolic: d } as any);
        setSystolic(""); setDiastolic("");
      } else {
        const w = weight ? parseFloat(weight) : null;
        if (!w) { toast.error("Enter your weight"); return; }
        await insertHealthLog({ ...base, log_type: "weight", weight_kg: w } as any);
        setWeight("");
      }
      toast.success("Reading saved");
      setShowAdd(false);
      setReloadKey((k) => k + 1);
    } catch (err) {
      console.error(err);
      toast.error("Could not save reading. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ── Sub screens ──────────────────────────────────────────────────── */
  if (sub === "editProfile") return <EditProfile onBack={() => setSub(null)} />;
  if (sub === "diet") return <DietPreferences onBack={() => setSub(null)} />;
  if (sub === "privacy") {
    return <PrivacySecurityPage userId={user?.id} userName={user?.email ?? "You"} onBack={() => setSub(null)} />;
  }
  if (sub === "rings") {
    return <Overlay title="Ring Manager" onBack={() => setSub(null)}><RingManagement /></Overlay>;
  }
  if (sub === "help") {
    return <Overlay title="Help & Support" onBack={() => setSub(null)}><HelpSupport /></Overlay>;
  }

  if (sub === "appSettings") {
    const langs = enabledLanguages.length > 0
      ? enabledLanguages.map((l) => l.code as Language).filter((c) => c in LANGUAGE_LABELS)
      : (Object.keys(LANGUAGE_LABELS) as Language[]);
    return (
      <Overlay title={t("appSettings")} onBack={() => setSub(null)}>
        <div className="flex flex-col gap-3">
          <div className="liquid-glass rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center">
                <Globe className="w-4 h-4 text-primary" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <p className="text-foreground font-medium text-sm">{t("language")}</p>
                <p className="text-muted-foreground text-xs">{t("appDisplayLang")}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 min-[420px]:grid-cols-3 gap-2">
              {langs.map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`min-h-10 text-xs px-2 py-2 rounded-xl font-medium transition-colors text-center leading-tight break-words ${
                    lang === l ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {LANGUAGE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
          <div className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center">
                <Zap className="w-4 h-4 text-primary" strokeWidth={1.6} />
              </div>
              <div className="min-w-0">
                <p className="text-foreground font-medium text-sm">{t("appVersion")}</p>
                <p className="text-muted-foreground text-xs">v{APP_VERSION} — {t("upToDate")}</p>
              </div>
            </div>
            <span className="shrink-0 text-primary text-xs font-semibold">{t("latest")}</span>
          </div>
        </div>
      </Overlay>
    );
  }

  if (sub === "notifications") {
    return (
      <Overlay title="Notification Settings" onBack={() => setSub(null)}>
        <div className="flex flex-col gap-3">
          {[
            { label: "Daily Log Reminders", sublabel: "Health logs at 8am and 8pm", value: notifDailyLog, setter: setNotifDailyLog, icon: Activity },
            { label: "Supplement Reminders", sublabel: "Pill reminders based on your timing", value: notifSupplement, setter: setNotifSupplement, icon: Pill },
            { label: "Weekly Weight Reminder", sublabel: "Every Monday morning", value: notifWeightReminder, setter: setNotifWeightReminder, icon: Scale },
            { label: "Appointment Alerts", sublabel: "1 hour before scheduled meetings", value: notifAppointment, setter: setNotifAppointment, icon: BellRing },
            { label: "Community Updates", sublabel: "Likes and comments on your posts", value: notifCommunity, setter: setNotifCommunity, icon: BellOff },
          ].map(({ label, sublabel, value, setter, icon: Icon }) => (
            <div key={label} className="liquid-glass rounded-2xl p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" strokeWidth={1.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-foreground font-medium text-sm leading-tight break-words">{label}</p>
                  <p className="text-muted-foreground text-xs leading-snug break-words">{sublabel}</p>
                </div>
              </div>
              <Switch className="shrink-0 mt-1" checked={value} onCheckedChange={setter} />
            </div>
          ))}

          <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3 mt-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground font-semibold text-sm">Notification Sound</p>
                <p className="text-muted-foreground text-xs">BBDO signature chime plays on new alerts</p>
              </div>
              <Switch checked={!soundMuted} onCheckedChange={(on) => { setMuted(!on); setSoundMutedState(!on); }} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">Volume</span>
              <input
                type="range" min={0} max={1} step={0.05} value={soundVolume}
                onChange={(e) => { const v = parseFloat(e.target.value); setMasterVolume(v); setSoundVolumeState(v); }}
                className="flex-1 accent-primary"
              />
              <span className="text-xs text-foreground w-10 text-right">{Math.round(soundVolume * 100)}%</span>
            </div>
            <button
              onClick={async () => {
                setMuted(false); setSoundMutedState(false);
                const s = await getNotificationSoundSettings();
                playNotificationSound(s.variant);
              }}
              className="rounded-xl liquid-glass py-2.5 text-sm font-semibold text-foreground active:scale-[0.98] transition"
            >
              Play sound
            </button>
          </div>

          {isNativePushSupported() && (
            <button
              onClick={() => user?.id && void registerNativePushWithToast(user.id)}
              className="mt-2 rounded-2xl liquid-glass p-4 flex items-center justify-between gap-3 active:scale-[0.99] transition"
            >
              <div className="min-w-0 text-left">
                <p className="text-foreground font-semibold text-sm">Enable push notifications</p>
                <p className="text-muted-foreground text-xs">Get alerts even when the app is closed</p>
              </div>
              <BellRing className="w-5 h-5 text-primary shrink-0" strokeWidth={1.8} />
            </button>
          )}
        </div>
      </Overlay>
    );
  }

  if (sub === "logs") {
    return (
      <Overlay title="My Health Logs" onBack={() => setSub(null)}>
        <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
          {([
            { type: "diabetes" as const, label: "Glucose", icon: Activity },
            { type: "bp" as const, label: "BP", icon: Heart },
            { type: "weight" as const, label: "Weight", icon: Scale },
          ]).map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => setLogsTab(type)}
              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                logsTab === type ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.8} /> {label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowAdd((v) => !v)}
          className="w-full mb-4 rounded-2xl gradient-blue text-primary-foreground py-3 text-sm font-bold flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" strokeWidth={2.2} /> Add reading
        </button>

        {showAdd && (
          <div className="liquid-glass rounded-2xl p-4 mb-4 flex flex-col gap-3">
            {logsTab === "diabetes" && (
              <div className="grid grid-cols-2 gap-3">
                <input inputMode="decimal" placeholder="Morning mg/dL" value={glucoseM} onChange={(e) => setGlucoseM(e.target.value)} className="bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground" />
                <input inputMode="decimal" placeholder="Evening mg/dL" value={glucoseE} onChange={(e) => setGlucoseE(e.target.value)} className="bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground" />
              </div>
            )}
            {logsTab === "bp" && (
              <div className="grid grid-cols-2 gap-3">
                <input inputMode="numeric" placeholder="Systolic" value={systolic} onChange={(e) => setSystolic(e.target.value)} className="bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground" />
                <input inputMode="numeric" placeholder="Diastolic" value={diastolic} onChange={(e) => setDiastolic(e.target.value)} className="bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground" />
              </div>
            )}
            {logsTab === "weight" && (
              <input inputMode="decimal" placeholder="Weight in kg" value={weight} onChange={(e) => setWeight(e.target.value)} className="bg-background/50 border border-border/40 rounded-xl px-3 py-2.5 text-sm text-foreground" />
            )}
            <button onClick={saveLog} disabled={saving} className="rounded-xl gradient-blue text-primary-foreground py-2.5 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
          </div>
        )}

        {logsLoading ? (
          <LoadingState />
        ) : (
          <div className="flex flex-col gap-3">
            <LogTrendChart kind={logsTab} logs={logs} />
            {logs.length === 0 ? (
              <EmptyState icon={Activity} title="No logs yet" description="Add your first reading above." />
            ) : (
              logs.map((log) => (
                <motion.div key={log.id} className="liquid-glass rounded-2xl p-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <p className="text-foreground text-xs font-bold mb-1">{formatLogDate(log.logged_at)}</p>
                  <p className="text-foreground text-xl font-black">
                    {logsTab === "diabetes"
                      ? `${log.glucose_morning ?? "—"} / ${log.glucose_evening ?? "—"} mg/dL`
                      : logsTab === "bp"
                        ? `${log.bp_systolic ?? "—"}/${log.bp_diastolic ?? "—"} mmHg`
                        : log.weight_kg
                          ? `${log.weight_kg} kg`
                          : "—"}
                  </p>
                </motion.div>
              ))
            )}
          </div>
        )}
      </Overlay>
    );
  }

  /* ── Menu ─────────────────────────────────────────────────────────── */
  const items: { icon: React.ElementType; label: string; sublabel: string; page: Exclude<SubPage, null> }[] = [
    { icon: UserCog, label: "Edit Profile", sublabel: "Personal details & health metrics", page: "editProfile" },
    { icon: CircleDashed, label: "Ring Manager", sublabel: "Choose your rings and tracking days", page: "rings" },
    { icon: Utensils, label: "Diet Preferences", sublabel: "Veg, Vegan, Jain, Non-veg & allergies", page: "diet" },
    { icon: Bell, label: "Notifications", sublabel: "Manage your alerts and sounds", page: "notifications" },
    { icon: Shield, label: "Privacy & Security", sublabel: "Data control and account safety", page: "privacy" },
    { icon: Settings, label: "App Settings", sublabel: "Language and app version", page: "appSettings" },
    { icon: ClipboardList, label: "My Logs", sublabel: "Glucose, BP and weight with trends", page: "logs" },
    { icon: LifeBuoy, label: "Help & Support", sublabel: "FAQs and raise a query", page: "help" },
  ];

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-5"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <p className="text-foreground font-bold mb-3">{heading}</p>
      <div className="flex flex-col gap-2">
        {items.map(({ icon: Icon, label, sublabel, page }) => (
          <button
            key={page}
            onClick={() => setSub(page)}
            className="w-full flex items-center gap-3 rounded-2xl p-3 text-left hover:bg-accent/60 transition-colors"
          >
            <div className="w-9 h-9 shrink-0 rounded-xl liquid-glass flex items-center justify-center">
              <Icon className="w-4 h-4 text-primary" strokeWidth={1.7} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-medium text-sm leading-tight break-words">{label}</p>
              <p className="text-muted-foreground text-xs leading-snug break-words">{sublabel}</p>
            </div>
          </button>
        ))}
      </div>
    </motion.div>
  );
}
