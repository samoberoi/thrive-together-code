import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dumbbell,
  Play,
  Loader2,
  Sparkles,
  CalendarDays,
  Trash2,
  Shuffle,
  Clock,
  UserRound,
  Pencil,
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  X,
  Timer,
  Repeat,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { youtubeThumbnail } from "@/lib/exercise2ThumbnailService";
import { listTaxonomy, type TaxonomyItem, type TaxonomyTable, type Exercise2 } from "@/lib/exercise2Service";
import WorkoutPlayer from "@/components/workout/WorkoutPlayer";
import {
  listWorkoutPool,
  generateWorkout,
  attachExercises,
  planDurationSeconds,
  itemWorkSeconds,
  savePlan,
  listMyPlans,
  listCoachPlans,
  loadPlanItems,
  deletePlan,
  loadSchedule,
  saveScheduleDay,
  startSession,
  updateSession,
  logExerciseCompletion,
  DURATION_OPTIONS,
  WEEKDAY_LABEL,
  PHASE_LABEL,
  type WorkoutPlan,
  type WorkoutPlanItem,
  type PlayableItem,
  type ScheduleDay,
} from "@/lib/workoutService";

interface Props {
  packageKey: string | null;
}

type Lists = Record<TaxonomyTable, TaxonomyItem[]>;
const EMPTY_LISTS: Lists = {
  workout_types: [],
  exercise_experience_levels: [],
  exercise_target_audiences: [],
  exercise_age_groups: [],
  exercise_equipment: [],
  exercise_muscle_groups: [],
};
const TABLES: TaxonomyTable[] = [
  "workout_types",
  "exercise_experience_levels",
  "exercise_target_audiences",
  "exercise_age_groups",
  "exercise_equipment",
  "exercise_muscle_groups",
];

const ANY = "__any__";

function ageGroupFor(age: number | null | undefined, groups: TaxonomyItem[]): string | null {
  if (!age || !groups.length) return null;
  for (const g of groups) {
    const nums = (g.name.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
    if (nums.length >= 2 && age >= nums[0] && age <= nums[1]) return g.id;
    if (nums.length === 1 && /\+|above|over/i.test(g.name) && age >= nums[0]) return g.id;
  }
  return null;
}

function fmtMins(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}

export default function Exercise2({ packageKey }: Props) {
  const { user } = useAuth();
  const isFoundation = !packageKey || packageKey === "foundation" || packageKey === "starter";
  const isIntensive = packageKey === "intensive";

  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Exercise2[]>([]);
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [myPlans, setMyPlans] = useState<WorkoutPlan[]>([]);
  const [coachPlans, setCoachPlans] = useState<WorkoutPlan[]>([]);
  const [coachNames, setCoachNames] = useState<Record<string, string>>({});
  const [schedule, setSchedule] = useState<ScheduleDay[]>([]);
  const [profile, setProfile] = useState<{ age: number | null; gender: string | null }>({
    age: null,
    gender: null,
  });

  const [tab, setTab] = useState<"build" | "week" | "coach">(isFoundation ? "build" : "week");

  // Builder state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [duration, setDuration] = useState(15);
  const [workoutTypeId, setWorkoutTypeId] = useState<string>(ANY);
  const [levelId, setLevelId] = useState<string>(ANY);
  const [muscleIds, setMuscleIds] = useState<string[]>([]);
  const [equipIds, setEquipIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<WorkoutPlanItem[] | null>(null);
  const [planName, setPlanName] = useState("");
  const [planDescription, setPlanDescription] = useState("");
  const [planDays, setPlanDays] = useState<number[]>([]);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Player state
  const [playing, setPlaying] = useState<{ title: string; items: PlayableItem[]; planId?: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [donePositions, setDonePositions] = useState(0);

  const levelOrder = useMemo(
    () => lists.exercise_experience_levels.map((l) => l.id),
    [lists.exercise_experience_levels]
  );
  const levelSlugById = useMemo(() => {
    const m: Record<string, string> = {};
    lists.exercise_experience_levels.forEach((l) => (m[l.id] = l.slug));
    return m;
  }, [lists.exercise_experience_levels]);

  const myAgeGroupId = useMemo(
    () => ageGroupFor(profile.age, lists.exercise_age_groups),
    [profile.age, lists.exercise_age_groups]
  );

  const audienceIds = useMemo(() => {
    const g = (profile.gender || "").toLowerCase();
    return lists.exercise_target_audiences
      .filter((a) => {
        if (a.slug === "everyone") return true;
        if (g.startsWith("f")) return a.slug !== "male";
        if (g.startsWith("m")) return a.slug !== "female";
        return true;
      })
      .map((a) => a.id);
  }, [lists.exercise_target_audiences, profile.gender]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [poolRows, ...tax] = await Promise.all([listWorkoutPool(), ...TABLES.map((t) => listTaxonomy(t))]);
      const nextLists = { ...EMPTY_LISTS };
      TABLES.forEach((t, i) => (nextLists[t] = tax[i] as TaxonomyItem[]));
      setPool(poolRows);
      setLists(nextLists);

      const [mine, coachy, sched, prof] = await Promise.all([
        listMyPlans(user.id),
        listCoachPlans(),
        loadSchedule(user.id),
        (supabase as any).from("profiles").select("age, gender").eq("user_id", user.id).maybeSingle(),
      ]);
      setMyPlans(mine);
      setCoachPlans(coachy);
      setSchedule(sched);
      setProfile({ age: prof?.data?.age ?? null, gender: prof?.data?.gender ?? null });

      const ids = Array.from(new Set(coachy.map((p) => p.coach_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: cs } = await (supabase as any).from("coaches").select("id, name").in("id", ids);
        const map: Record<string, string> = {};
        (cs ?? []).forEach((c: any) => (map[c.id] = c.name));
        setCoachNames(map);
      }

      // Default the experience level to the member's own level where possible.
      const lvl = nextLists.exercise_experience_levels;
      if (lvl.length) {
        const slug = packageKey === "intensive" ? "advanced" : packageKey === "active" ? "intermediate" : "beginner";
        setLevelId(lvl.find((l) => l.slug === slug)?.id ?? lvl[0].id);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Could not load your workouts");
    } finally {
      setLoading(false);
    }
  }, [user, packageKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const buildOptions = (extra?: Partial<Parameters<typeof generateWorkout>[1]>) => ({
    durationMinutes: duration,
    workoutTypeId: workoutTypeId === ANY ? null : workoutTypeId,
    experienceLevelId: levelId === ANY ? null : levelId,
    experienceOrder: levelOrder,
    muscleGroupIds: muscleIds,
    equipmentIds: equipIds,
    ageGroupId: myAgeGroupId,
    targetAudienceIds: audienceIds,
    seed: Math.floor(Math.random() * 1e9),
    ...extra,
  });

  const generate = () => {
    const items = generateWorkout(pool, buildOptions(), levelSlugById);
    if (!items.length) {
      toast.error("Nothing matches those choices yet. Try fewer filters.");
      return;
    }
    setDraft(items);
    if (!planName.trim()) {
      const type = lists.workout_types.find((w) => w.id === workoutTypeId)?.name;
      const focus = lists.exercise_muscle_groups.find((m) => muscleIds.includes(m.id))?.name;
      setPlanName(`${duration} min ${focus ?? type ?? "Full body"}`);
    }
  };

  const draftPlayable = useMemo(() => (draft ? attachExercises(draft, pool) : []), [draft, pool]);
  const draftSeconds = draft ? planDurationSeconds(draft) : 0;

  /* ───────────── draft editing ───────────── */

  const updateItem = (index: number, patch: Partial<WorkoutPlanItem>) =>
    setDraft((d) => (d ? d.map((it, i) => (i === index ? { ...it, ...patch } : it)) : d));

  const removeItem = (index: number) =>
    setDraft((d) => (d ? d.filter((_, i) => i !== index).map((it, i) => ({ ...it, position: i })) : d));

  const moveItem = (index: number, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const to = index + dir;
      if (to < 0 || to >= d.length) return d;
      const next = [...d];
      [next[index], next[to]] = [next[to], next[index]];
      return next.map((it, i) => ({ ...it, position: i }));
    });

  const swapItem = (index: number) =>
    setDraft((d) => {
      if (!d) return d;
      const current = d[index];
      const used = new Set(d.map((i) => i.exercise_id));
      const currentEx = pool.find((e) => e.id === current.exercise_id);
      const options = pool.filter(
        (e) =>
          !used.has(e.id) &&
          ((e as any).phase ?? "main") === current.phase &&
          (!muscleIds.length || e.muscle_group_ids.some((m) => muscleIds.includes(m))) &&
          (!currentEx?.muscle_group_ids.length ||
            e.muscle_group_ids.some((m) => currentEx.muscle_group_ids.includes(m)))
      );
      const pick = options[Math.floor(Math.random() * options.length)];
      if (!pick) {
        toast.error("No other drill fits that slot yet.");
        return d;
      }
      const next = [...d];
      next[index] = { ...current, exercise_id: pick.id };
      toast.success(`Swapped in ${pick.name}`);
      return next;
    });

  const setMode = (index: number, mode: "time" | "reps") =>
    setDraft((current) => {
      if (!current) return current;
      const item = current[index];
      const exercise = pool.find((entry) => entry.id === item.exercise_id);
      return current.map((entry, itemIndex) =>
        itemIndex === index
          ? {
              ...entry,
              mode,
              reps: mode === "reps" ? Math.max(1, entry.reps || 1) : 0,
              work_seconds:
                mode === "reps" && exercise?.duration_seconds
                  ? exercise.duration_seconds
                  : entry.work_seconds,
            }
          : entry
      );
    });

  /* ───────────── play / logging ───────────── */

  const play = async (title: string, items: PlayableItem[], planId?: string) => {
    if (!items.length) return;
    setDonePositions(0);
    setPlaying({ title, items, planId });
    if (user) setSessionId(await startSession(user.id, { id: planId, name: title }));
  };

  const handleExerciseDone = async (item: PlayableItem) => {
    setDonePositions((n) => n + 1);
    if (user) void logExerciseCompletion(user.id, item.exercise.source_exercise_id);
  };

  const closePlayer = async (completed: boolean) => {
    if (sessionId && playing) {
      await updateSession(sessionId, {
        exercises_done: donePositions,
        seconds_done: planDurationSeconds(playing.items),
        completed,
      });
    }
    setSessionId(null);
    setPlaying(null);
    window.dispatchEvent(new CustomEvent("health-log-saved"));
  };

  const swapInPlayer = (index: number) => {
    setPlaying((cur) => {
      if (!cur) return cur;
      const current = cur.items[index];
      const used = new Set(cur.items.map((i) => i.exercise_id));
      const options = pool.filter(
        (e) =>
          !used.has(e.id) &&
          ((e as any).phase ?? "main") === current.phase &&
          (!current.exercise.muscle_group_ids.length ||
            e.muscle_group_ids.some((m) => current.exercise.muscle_group_ids.includes(m)))
      );
      const pick = options[Math.floor(Math.random() * options.length)];
      if (!pick) {
        toast.error("No alternative drill available for this one yet.");
        return cur;
      }
      const items = [...cur.items];
      items[index] = { ...current, exercise_id: pick.id, exercise: pick };
      toast.success(`Swapped in ${pick.name}`);
      return { ...cur, items };
    });
  };

  /* ───────────── builder open / save ───────────── */

  const openNewBuilder = () => {
    setEditingPlanId(null);
    setDraft(null);
    setPlanName("");
    setPlanDescription("");
    setPlanDays([]);
    setBuilderOpen(true);
  };

  const openEditBuilder = async (plan: WorkoutPlan) => {
    try {
      const items = await loadPlanItems(plan.id);
      setEditingPlanId(plan.id);
      setDraft(items);
      setPlanName(plan.name);
      setPlanDescription(plan.description ?? "");
      setPlanDays(schedule.filter((s) => s.plan_id === plan.id && !s.is_rest_day).map((s) => s.weekday));
      setDuration(plan.duration_minutes);
      setWorkoutTypeId(plan.workout_type_id ?? ANY);
      setLevelId(plan.experience_level_id ?? ANY);
      setMuscleIds(plan.muscle_group_ids ?? []);
      setEquipIds(plan.equipment_ids ?? []);
      setBuilderOpen(true);
    } catch (e: any) {
      toast.error(e.message ?? "Could not open that workout");
    }
  };

  const persistDraft = async (): Promise<string | null> => {
    if (!user || !draft?.length) return null;
    const planId = await savePlan(
      {
        id: editingPlanId ?? undefined,
        name: planName.trim() || `${Math.round(draftSeconds / 60)} min workout`,
        description: planDescription.trim() || null,
        plan_kind: "user",
        owner_id: user.id,
        duration_minutes: Math.max(1, Math.round(draftSeconds / 60)),
        workout_type_id: workoutTypeId === ANY ? null : workoutTypeId,
        experience_level_id: levelId === ANY ? null : levelId,
        muscle_group_ids: muscleIds,
        equipment_ids: equipIds,
      },
      draft,
      user.id
    );
    // Day assignments: claim the chosen days, release days this plan no longer owns.
    const previous = schedule.filter((s) => s.plan_id === planId).map((s) => s.weekday);
    for (const day of planDays) await saveScheduleDay(user.id, { weekday: day, plan_id: planId, is_rest_day: false });
    for (const day of previous.filter((d) => !planDays.includes(d)))
      await saveScheduleDay(user.id, { weekday: day, plan_id: null, is_rest_day: false });
    setSchedule(await loadSchedule(user.id));
    setMyPlans(await listMyPlans(user.id));
    return planId;
  };

  const saveDraft = async (thenPlay: boolean) => {
    if (!user || !draft?.length) return;
    setSaving(true);
    try {
      await persistDraft();
      toast.success(editingPlanId ? "Workout updated" : "Workout saved");
      setBuilderOpen(false);
      const items = draftPlayable;
      setDraft(null);
      setEditingPlanId(null);
      if (thenPlay) void play(planName || "My workout", items);
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the workout");
    } finally {
      setSaving(false);
    }
  };

  const openSavedPlan = async (plan: WorkoutPlan) => {
    try {
      const items = await loadPlanItems(plan.id);
      await play(plan.name, attachExercises(items, pool), plan.id);
    } catch (e: any) {
      toast.error(e.message ?? "Could not open that workout");
    }
  };

  const removePlan = async (plan: WorkoutPlan) => {
    await deletePlan(plan.id);
    setMyPlans((p) => p.filter((x) => x.id !== plan.id));
    setSchedule(await loadSchedule(user!.id));
  };

  /* ───────────── weekly plan (paid packages) ───────────── */

  const buildWeek = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const types = lists.workout_types.filter((t) => t.enabled !== false);
      const focusOrder = lists.exercise_muscle_groups;
      const used: string[] = [];
      for (let day = 0; day < 7; day++) {
        const rest = day === 0 || day === 6;
        if (rest) {
          await saveScheduleDay(user.id, { weekday: day, plan_id: null, is_rest_day: true });
          continue;
        }
        const focus = focusOrder.length ? [focusOrder[(day - 1) % focusOrder.length].id] : [];
        const type = types.length ? types[(day - 1) % types.length].id : null;
        const items = generateWorkout(
          pool,
          { ...buildOptions({ muscleGroupIds: focus, workoutTypeId: type, avoidIds: used }) },
          levelSlugById
        );
        if (!items.length) continue;
        used.push(...items.map((i) => i.exercise_id));
        const focusName = focusOrder.length ? focusOrder[(day - 1) % focusOrder.length].name : "Full body";
        const planId = await savePlan(
          {
            name: `${WEEKDAY_LABEL[day]} · ${focusName}`,
            plan_kind: "weekly",
            owner_id: user.id,
            duration_minutes: duration,
            workout_type_id: type,
            experience_level_id: levelId === ANY ? null : levelId,
            muscle_group_ids: focus,
          },
          items,
          user.id
        );
        await saveScheduleDay(user.id, { weekday: day, plan_id: planId, is_rest_day: false });
      }
      setSchedule(await loadSchedule(user.id));
      setMyPlans(await listMyPlans(user.id));
      toast.success("Your week is ready");
    } catch (e: any) {
      toast.error(e.message ?? "Could not build your week");
    } finally {
      setSaving(false);
    }
  };

  const planById = useMemo(() => {
    const m = new Map<string, WorkoutPlan>();
    [...myPlans, ...coachPlans].forEach((p) => m.set(p.id, p));
    return m;
  }, [myPlans, coachPlans]);

  const daysForPlan = useCallback(
    (planId: string) =>
      schedule
        .filter((s) => s.plan_id === planId && !s.is_rest_day)
        .map((s) => s.weekday)
        .sort((a, b) => a - b),
    [schedule]
  );

  const toggleRest = async (weekday: number, rest: boolean) => {
    if (!user) return;
    const day = schedule.find((s) => s.weekday === weekday);
    await saveScheduleDay(user.id, { weekday, plan_id: rest ? null : day?.plan_id ?? null, is_rest_day: rest });
    setSchedule(await loadSchedule(user.id));
  };

  /* ───────────── render ───────────── */

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tabs: { id: typeof tab; label: string }[] = isFoundation
    ? []
    : [
        { id: "week" as const, label: "My Week" },
        ...(isIntensive ? [{ id: "coach" as const, label: "Coach Workouts" }] : []),
        { id: "build" as const, label: "Build a session" },
      ];

  const savedList = (
    <div className="space-y-3">
      {myPlans
        .filter((p) => p.plan_kind === "user")
        .map((p) => (
          <PlanCard
            key={p.id}
            plan={p}
            days={daysForPlan(p.id)}
            onPlay={() => openSavedPlan(p)}
            onEdit={() => openEditBuilder(p)}
            onDelete={() => removePlan(p)}
          />
        ))}
    </div>
  );

  const hasOwnPlans = myPlans.some((p) => p.plan_kind === "user");

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-[var(--bbdo-blue)]" />
            My Workouts
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Press play once and the whole session runs itself.
          </p>
        </div>
        {isFoundation && hasOwnPlans && (
          <Button size="sm" onClick={openNewBuilder}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        )}
      </div>

      {tabs.length > 0 && (
        <div className="flex gap-2 border-b overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "h-10 px-4 -mb-px border-b-2 text-sm font-semibold whitespace-nowrap transition-colors",
                tab === t.id
                  ? "border-[var(--bbdo-blue)] text-[var(--bbdo-blue)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Build / saved workouts ── */}
      {tab === "build" && (
        <div className="space-y-4">
          {!hasOwnPlans ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[var(--bbdo-blue)]/10 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6 text-[var(--bbdo-blue)]" />
              </div>
              <p className="font-black text-foreground mt-3">No workouts yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                Tell us how long you have and what you want to train. We line up the drills and play
                them back to back.
              </p>
              <Button className="mt-4" onClick={openNewBuilder}>
                <Sparkles className="w-4 h-4 mr-1" /> Build my workout
              </Button>
            </div>
          ) : (
            savedList
          )}
        </div>
      )}

      {/* ── Weekly ── */}
      {tab === "week" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v, 10))}>
              <SelectTrigger className="h-9 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DURATION_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} minutes
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={buildWeek} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CalendarDays className="w-4 h-4 mr-1" />}
              {schedule.length ? "Rebuild my week" : "Build my week"}
            </Button>
          </div>

          <div className="space-y-2">
            {WEEKDAY_LABEL.map((label, day) => {
              const entry = schedule.find((s) => s.weekday === day);
              const plan = entry?.plan_id ? planById.get(entry.plan_id) : null;
              const isToday = new Date().getDay() === day;
              return (
                <div
                  key={label}
                  className={cn(
                    "rounded-xl border bg-card p-3 flex items-center gap-3",
                    isToday ? "border-[var(--bbdo-blue)]" : "border-border"
                  )}
                >
                  <div className="w-20 shrink-0">
                    <p className="text-sm font-black text-foreground">{label.slice(0, 3)}</p>
                    {isToday && <p className="text-[10px] font-bold text-[var(--bbdo-blue)]">TODAY</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    {entry?.is_rest_day ? (
                      <p className="text-sm text-muted-foreground">Rest day</p>
                    ) : plan ? (
                      <>
                        <p className="text-sm font-semibold text-foreground truncate">{plan.name}</p>
                        <p className="text-[11px] text-muted-foreground">{plan.duration_minutes} min</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Nothing planned</p>
                    )}
                  </div>
                  {plan && !entry?.is_rest_day && (
                    <Button size="sm" onClick={() => openSavedPlan(plan)}>
                      <Play className="w-4 h-4 mr-1" /> Play
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleRest(day, !entry?.is_rest_day)}
                    className="text-xs"
                  >
                    {entry?.is_rest_day ? "Train" : "Rest"}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Coach workouts ── */}
      {tab === "coach" && (
        <div className="space-y-2">
          {!coachPlans.length && (
            <p className="text-sm text-muted-foreground">
              No coach workouts published yet. They'll appear here the moment your coach publishes one.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {coachPlans.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-card p-3">
                <p className="font-bold text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                  <UserRound className="w-3 h-3" />
                  {p.coach_id ? coachNames[p.coach_id] ?? "Your coach" : "BBDO care team"}
                  <span>·</span>
                  <Clock className="w-3 h-3" />
                  {p.duration_minutes} min
                </p>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>
                )}
                <Button size="sm" className="mt-2" onClick={() => openSavedPlan(p)}>
                  <Play className="w-4 h-4 mr-1" /> Play
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Builder dialog ── */}
      <Dialog
        open={builderOpen}
        onOpenChange={(o) => {
          setBuilderOpen(o);
          if (!o) {
            setDraft(null);
            setEditingPlanId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[88svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPlanId ? "Edit my workout" : "Build my workout"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>How long?</Label>
                <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v, 10))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_OPTIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} minutes
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Workout type</Label>
                <Select value={workoutTypeId} onValueChange={setWorkoutTypeId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Anything</SelectItem>
                    {lists.workout_types.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Your level</Label>
                <Select value={levelId} onValueChange={setLevelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any level</SelectItem>
                    {lists.exercise_experience_levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Body part / focus (optional)</Label>
              <ChipRow
                options={lists.exercise_muscle_groups}
                selected={muscleIds}
                onToggle={(id) =>
                  setMuscleIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Equipment you have (optional)</Label>
              <ChipRow
                options={lists.exercise_equipment}
                selected={equipIds}
                onToggle={(id) =>
                  setEquipIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
                }
              />
            </div>

            <Button variant="outline" className="w-full" onClick={generate}>
              <Shuffle className="w-4 h-4 mr-1" /> {draft ? "Shuffle again" : "Generate workout"}
            </Button>

            {draft && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-foreground">
                    {draft.length} drills · {fmtMins(draftSeconds)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Tap a drill to change it</p>
                </div>

                <div className="space-y-2 max-h-[48vh] overflow-y-auto pr-1">
                  {draft.map((it, i) => {
                    const ex = pool.find((e) => e.id === it.exercise_id);
                    if (!ex) return null;
                    const thumb = ex.image_url || youtubeThumbnail(ex.youtube_url);
                    const reps = it.mode === "reps";
                    return (
                      <div key={`${it.exercise_id}-${i}`} className="rounded-xl border border-border bg-card p-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-16 shrink-0 rounded-md overflow-hidden bg-muted border border-border relative"
                            style={{ aspectRatio: "16 / 9" }}
                          >
                            {thumb && (
                              <img
                                src={thumb as string}
                                alt=""
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover"
                              />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-foreground truncate">{ex.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {PHASE_LABEL[it.phase]} ·{" "}
                              {reps ? `${it.reps} reps` : `${it.work_seconds}s`} · {it.rest_seconds}s rest
                            </p>
                          </div>
                          <div className="flex flex-col">
                            <button
                              className="p-1 text-muted-foreground hover:text-foreground"
                              onClick={() => moveItem(i, -1)}
                              aria-label="Move up"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="p-1 text-muted-foreground hover:text-foreground"
                              onClick={() => moveItem(i, 1)}
                              aria-label="Move down"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <button
                            className="p-1.5 text-muted-foreground hover:text-destructive"
                            onClick={() => removeItem(i)}
                            aria-label="Remove drill"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <div className="flex rounded-md border border-border overflow-hidden">
                            <button
                              onClick={() => setMode(i, "time")}
                              className={cn(
                                "px-2 h-7 text-[11px] font-semibold flex items-center gap-1",
                                !reps ? "bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)]" : "text-muted-foreground"
                              )}
                            >
                              <Timer className="w-3 h-3" /> Timed
                            </button>
                            <button
                              onClick={() => setMode(i, "reps")}
                              className={cn(
                                "px-2 h-7 text-[11px] font-semibold flex items-center gap-1 border-l border-border",
                                reps ? "bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)]" : "text-muted-foreground"
                              )}
                            >
                              <Repeat className="w-3 h-3" /> Reps
                            </button>
                          </div>

                          {reps && (
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateItem(i, { reps: Math.max(1, (it.reps ?? 1) - 1) })}
                                aria-label="Fewer reps"
                              >
                                <Minus className="w-3 h-3" />
                              </Button>
                              <span className="w-10 text-center text-sm font-black tabular-nums">{it.reps}</span>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-7 w-7"
                                onClick={() => updateItem(i, { reps: Math.min(100, (it.reps ?? 0) + 1) })}
                                aria-label="More reps"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <span className="text-[11px] text-muted-foreground ml-1">
                                {it.reps} full video {it.reps === 1 ? "play" : "plays"} · ≈ {itemWorkSeconds(it)}s
                              </span>
                            </div>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px] ml-auto"
                            onClick={() => swapItem(i)}
                          >
                            <Shuffle className="w-3 h-3 mr-1" /> Swap
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-1.5">
                  <Label>Workout name</Label>
                  <Input
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="Monday chest"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Textarea
                    value={planDescription}
                    onChange={(e) => setPlanDescription(e.target.value)}
                    placeholder="Push day — chest and shoulders, light on the knees."
                    rows={2}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Do this on (optional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAY_LABEL.map((label, day) => {
                      const on = planDays.includes(day);
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() =>
                            setPlanDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]))
                          }
                          className={cn(
                            "px-3 h-8 rounded-md border text-xs font-semibold transition-colors",
                            on
                              ? "border-[var(--bbdo-blue)] bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)]"
                              : "border-border text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {label.slice(0, 3)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {draft && (
              <Button variant="outline" onClick={() => void saveDraft(false)} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null} Save
              </Button>
            )}
            <Button disabled={!draft || saving} onClick={() => void saveDraft(true)}>
              <Play className="w-4 h-4 mr-1" /> Save &amp; start
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {playing && (
        <WorkoutPlayer
          title={playing.title}
          items={playing.items}
          onExerciseDone={handleExerciseDone}
          onSwap={swapInPlayer}
          onFinish={() => void closePlayer(true)}
          onClose={() => void closePlayer(false)}
        />
      )}
    </div>
  );
}

function ChipRow({
  options,
  selected,
  onToggle,
}: {
  options: TaxonomyItem[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = selected.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            className={cn(
              "px-3 h-8 rounded-md border text-xs font-semibold transition-colors",
              on
                ? "border-[var(--bbdo-blue)] bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)]"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {o.name}
          </button>
        );
      })}
      {!options.length && <span className="text-xs text-muted-foreground">No options yet.</span>}
    </div>
  );
}

function PlanCard({
  plan,
  days,
  onPlay,
  onEdit,
  onDelete,
}: {
  plan: WorkoutPlan;
  days: number[];
  onPlay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-black text-foreground truncate">{plan.name}</p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-3 h-3" /> {plan.duration_minutes} min
          </p>
          {plan.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{plan.description}</p>
          )}
          {days.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {days.map((d) => (
                <span
                  key={d}
                  className="px-2 py-0.5 rounded bg-[var(--bbdo-blue)]/10 text-[var(--bbdo-blue)] text-[10px] font-black uppercase"
                >
                  {WEEKDAY_LABEL[d].slice(0, 3)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-4">
        <Button size="sm" className="font-bold" onClick={onPlay}>
          <Play className="w-4 h-4 mr-1.5" /> Play
        </Button>
        <Button size="sm" variant="outline" className="text-xs" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9 ml-auto text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={onDelete}
          aria-label="Delete workout"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
