import { useEffect, useMemo, useState } from "react";
import { Activity, Loader2, Search, Save, RotateCcw, Footprints } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import CoachPatientIdentity from "@/components/coach/CoachPatientIdentity";
import { toast } from "sonner";
import {
  getMovementConfig,
  listMovementLevels,
  computeRecommendedSteps,
  type MovementConfig,
  type MovementLevel,
} from "@/lib/movementService";

type PatientRow = {
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  phone: string | null;
  age: number | null;
  weight: number | null;
  height: number | null;
  bmi_category: string | null;
  lifestyle: any;
  progress: {
    id?: string;
    current_level: number;
    custom_daily_step_goal: number | null;
    custom_goal_note: string | null;
  } | null;
  autoTarget: number;
  draft: string; // current input for custom goal
  note: string;
  dirty: boolean;
  saving: boolean;
};

export default function CoachMove() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [search, setSearch] = useState("");
  const [cfg, setCfg] = useState<MovementConfig | null>(null);
  const [levels, setLevels] = useState<MovementLevel[]>([]);

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: coach } = await supabase.from("coaches" as any).select("id").eq("user_id", user.id).single();
      if (!coach) { setPatients([]); setLoading(false); return; }

      const { data: assignments } = await supabase
        .from("coach_assignments" as any)
        .select("user_id")
        .eq("coach_id", (coach as any).id)
        .eq("is_active", true);
      const ids = ((assignments as any[]) || []).map((a) => a.user_id);
      if (ids.length === 0) { setPatients([]); setLoading(false); return; }

      const [{ data: profiles }, { data: progressRows }, cfgV, levelsV] = await Promise.all([
        supabase.from("profiles").select("user_id, name, avatar_url, phone, age, weight, height, bmi_category, lifestyle").in("user_id", ids),
        supabase.from("user_movement_progress" as any).select("id, user_id, current_level, custom_daily_step_goal, custom_goal_note").in("user_id", ids),
        getMovementConfig(),
        listMovementLevels(),
      ]);
      setCfg(cfgV);
      setLevels(levelsV);

      const progressMap: Record<string, any> = {};
      for (const p of ((progressRows as any[]) || [])) progressMap[p.user_id] = p;

      const rows: PatientRow[] = ((profiles as any[]) || []).map((p: any) => {
        const pr = progressMap[p.user_id] ?? null;
        const level = pr ? levelsV.find((l) => l.level_number === pr.current_level) : null;
        const rec = cfgV ? computeRecommendedSteps(cfgV, {
          bmiCategory: p.bmi_category,
          activityLevel: p.lifestyle?.activity_level,
          age: p.age,
          weightKg: p.weight,
          heightCm: p.height,
        }) : 5000;
        const levelTarget = level?.target_daily_steps ?? (cfgV?.base_daily_steps ?? 5000);
        const autoTarget = Math.max(500, Math.min(levelTarget, rec));
        return {
          user_id: p.user_id,
          name: p.name,
          avatar_url: p.avatar_url,
          phone: p.phone,
          age: p.age,
          weight: p.weight,
          height: p.height,
          bmi_category: p.bmi_category,
          lifestyle: p.lifestyle,
          progress: pr,
          autoTarget,
          draft: pr?.custom_daily_step_goal ? String(pr.custom_daily_step_goal) : "",
          note: pr?.custom_goal_note ?? "",
          dirty: false,
          saving: false,
        };
      });
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setPatients(rows);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => (p.name || "").toLowerCase().includes(q) || (p.phone || "").toLowerCase().includes(q));
  }, [patients, search]);

  const updateRow = (uid: string, patch: Partial<PatientRow>) =>
    setPatients((rows) => rows.map((r) => (r.user_id === uid ? { ...r, ...patch } : r)));

  const saveRow = async (row: PatientRow) => {
    if (!user) return;
    const val = row.draft.trim();
    const num = val === "" ? null : Number(val);
    if (num !== null && (!Number.isFinite(num) || num < 500 || num > 30000)) {
      toast.error("Steps must be between 500 and 30,000");
      return;
    }
    updateRow(row.user_id, { saving: true });
    try {
      if (row.progress?.id) {
        const { error } = await supabase
          .from("user_movement_progress" as any)
          .update({
            custom_daily_step_goal: num,
            custom_goal_set_by: user.id,
            custom_goal_note: row.note || null,
            custom_goal_updated_at: new Date().toISOString(),
          } as any)
          .eq("id", row.progress.id);
        if (error) throw error;
      } else {
        // Seed a progress row so the override persists
        const { data, error } = await supabase
          .from("user_movement_progress" as any)
          .insert({
            user_id: row.user_id,
            current_level: 1,
            weeks_at_current_level: 0,
            current_streak_weeks: 0,
            longest_streak_weeks: 0,
            total_weeks_completed: 0,
            total_weeks_missed: 0,
            custom_daily_step_goal: num,
            custom_goal_set_by: user.id,
            custom_goal_note: row.note || null,
            custom_goal_updated_at: new Date().toISOString(),
          } as any)
          .select("id, current_level")
          .single();
        if (error) throw error;
        updateRow(row.user_id, {
          progress: { id: (data as any).id, current_level: (data as any).current_level, custom_daily_step_goal: num, custom_goal_note: row.note || null },
        });
      }
      toast.success(num == null ? "Reset to auto target" : `Step goal set to ${num.toLocaleString()}`);
      updateRow(row.user_id, {
        dirty: false,
        saving: false,
        progress: row.progress
          ? { ...row.progress, custom_daily_step_goal: num, custom_goal_note: row.note || null }
          : row.progress,
      });
    } catch (e: any) {
      toast.error(e.message);
      updateRow(row.user_id, { saving: false });
    }
  };

  const resetRow = (row: PatientRow) => {
    updateRow(row.user_id, { draft: "", note: "", dirty: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div>
        <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
          <Activity className="w-6 h-6 text-primary" /> Move
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Review and adjust each patient's daily step goal.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={`Search ${patients.length} patient${patients.length === 1 ? "" : "s"}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11 rounded-2xl"
        />
      </div>

      {patients.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-10 text-center text-muted-foreground">No patients assigned yet.</div>
      ) : filtered.length === 0 ? (
        <div className="liquid-glass rounded-3xl p-8 text-center text-sm text-muted-foreground">No patients match "{search}".</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => {
            const effective = row.progress?.custom_daily_step_goal ?? row.autoTarget;
            const hasCustom = row.progress?.custom_daily_step_goal != null;
            return (
              <div key={row.user_id} className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-3">
                <CoachPatientIdentity
                  name={row.name}
                  phone={row.phone}
                  avatarUrl={row.avatar_url}
                  badges={
                    <div className={`px-3 py-1.5 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${
                      hasCustom ? "bg-amber-500/15 text-amber-500 border border-amber-500/30" : "bg-primary/10 text-primary border border-primary/20"
                    }`}>
                      <Footprints className="w-3.5 h-3.5" />
                      {effective.toLocaleString()} / day
                    </div>
                  }
                />


                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <div className="text-muted-foreground">Auto target</div>
                    <div className="font-bold text-foreground">{row.autoTarget.toLocaleString()} steps</div>
                  </div>
                  <div className="rounded-xl bg-muted/50 px-3 py-2">
                    <div className="text-muted-foreground">Current level</div>
                    <div className="font-bold text-foreground">L{row.progress?.current_level ?? 1}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_auto] gap-2 items-end">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Custom goal (steps)</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      placeholder={`Auto: ${row.autoTarget}`}
                      value={row.draft}
                      onChange={(e) => updateRow(row.user_id, { draft: e.target.value, dirty: true })}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reason (optional)</label>
                    <Input
                      placeholder="e.g. knee pain, doctor's advice"
                      value={row.note}
                      onChange={(e) => updateRow(row.user_id, { note: e.target.value, dirty: true })}
                      className="h-10 rounded-xl"
                    />
                  </div>
                  <div className="flex gap-2">
                    {hasCustom && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-10 rounded-xl"
                        onClick={() => resetRow(row)}
                        disabled={row.saving}
                        title="Reset to auto target"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="h-10 rounded-xl"
                      onClick={() => saveRow(row)}
                      disabled={!row.dirty || row.saving}
                    >
                      {row.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                      Save
                    </Button>
                  </div>
                </div>

                {row.progress?.custom_goal_note && (
                  <p className="text-[11px] text-muted-foreground italic">Note: {row.progress.custom_goal_note}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
