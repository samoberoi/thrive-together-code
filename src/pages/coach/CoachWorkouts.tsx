import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dumbbell,
  Plus,
  Play,
  Trash2,
  Loader2,
  Shuffle,
  Search,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
  savePlan,
  listPlansCreatedBy,
  loadPlanItems,
  deletePlan,
  setPlanPublished,
  DURATION_OPTIONS,
  PHASE_LABEL,
  type WorkoutPlan,
  type WorkoutPlanItem,
  type PlayableItem,
  type WorkoutPhase,
} from "@/lib/workoutService";

interface Props {
  coachId: string | null;
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
const TABLES = Object.keys(EMPTY_LISTS) as TaxonomyTable[];
const ANY = "__any__";

export default function CoachWorkouts({ coachId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pool, setPool] = useState<Exercise2[]>([]);
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState(15);
  const [workoutTypeId, setWorkoutTypeId] = useState<string>(ANY);
  const [levelId, setLevelId] = useState<string>(ANY);
  const [items, setItems] = useState<WorkoutPlanItem[]>([]);
  const [publish, setPublish] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<{ title: string; items: PlayableItem[] } | null>(null);

  const levelOrder = useMemo(() => lists.exercise_experience_levels.map((l) => l.id), [lists]);
  const levelSlugById = useMemo(() => {
    const m: Record<string, string> = {};
    lists.exercise_experience_levels.forEach((l) => (m[l.id] = l.slug));
    return m;
  }, [lists]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [poolRows, ...tax] = await Promise.all([listWorkoutPool(), ...TABLES.map((t) => listTaxonomy(t))]);
      const next = { ...EMPTY_LISTS };
      TABLES.forEach((t, i) => (next[t] = tax[i] as TaxonomyItem[]));
      setPool(poolRows);
      setLists(next);
      setPlans(await listPlansCreatedBy(user.id));
    } catch (e: any) {
      toast.error(e.message ?? "Could not load the workout library");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const playable = useMemo(() => attachExercises(items, pool), [items, pool]);

  const reset = () => {
    setEditingId(null);
    setName("");
    setDescription("");
    setDuration(15);
    setWorkoutTypeId(ANY);
    setLevelId(ANY);
    setItems([]);
    setPublish(true);
    setSearch("");
  };

  const openNew = () => {
    reset();
    setOpen(true);
  };

  const openEdit = async (plan: WorkoutPlan) => {
    reset();
    setEditingId(plan.id);
    setName(plan.name);
    setDescription(plan.description ?? "");
    setDuration(plan.duration_minutes);
    setWorkoutTypeId(plan.workout_type_id ?? ANY);
    setLevelId(plan.experience_level_id ?? ANY);
    setPublish(plan.is_published);
    setItems(await loadPlanItems(plan.id));
    setOpen(true);
  };

  const autoFill = () => {
    const generated = generateWorkout(
      pool,
      {
        durationMinutes: duration,
        workoutTypeId: workoutTypeId === ANY ? null : workoutTypeId,
        experienceLevelId: levelId === ANY ? null : levelId,
        experienceOrder: levelOrder,
        seed: Math.floor(Math.random() * 1e9),
      },
      levelSlugById
    );
    if (!generated.length) {
      toast.error("No exercises match those choices yet.");
      return;
    }
    setItems(generated);
  };

  const addExercise = (ex: Exercise2) => {
    setItems((cur) => [
      ...cur,
      {
        exercise_id: ex.id,
        position: cur.length,
        work_seconds: 45,
        rest_seconds: 15,
        phase: (((ex as any).phase ?? "main") as WorkoutPhase),
      },
    ]);
  };

  const move = (i: number, dir: -1 | 1) => {
    setItems((cur) => {
      const j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next.map((it, idx) => ({ ...it, position: idx }));
    });
  };

  const save = async () => {
    if (!user) return;
    if (!name.trim()) {
      toast.error("Give the workout a name");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one exercise");
      return;
    }
    setSaving(true);
    try {
      await savePlan(
        {
          id: editingId ?? undefined,
          name: name.trim(),
          description: description.trim() || null,
          plan_kind: "coach",
          coach_id: coachId,
          duration_minutes: duration,
          workout_type_id: workoutTypeId === ANY ? null : workoutTypeId,
          experience_level_id: levelId === ANY ? null : levelId,
          is_published: publish,
        } as any,
        items,
        user.id
      );
      toast.success(publish ? "Workout published" : "Workout saved as draft");
      setOpen(false);
      reset();
      setPlans(await listPlansCreatedBy(user.id));
    } catch (e: any) {
      toast.error(e.message ?? "Could not save the workout");
    } finally {
      setSaving(false);
    }
  };

  const filteredPool = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pool.filter((e) => (q ? e.name.toLowerCase().includes(q) : true)).slice(0, q ? 40 : 12);
  }, [pool, search]);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl mx-auto pb-24">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-[var(--bbdo-blue)]" />
            Workout Plans
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create a workout, name it, publish it — clients on Intensive Reversal Care see it in
            Exercise 2.0.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> New
        </Button>
      </div>

      {!plans.length && (
        <p className="text-sm text-muted-foreground">
          Nothing created yet. Build your first workout and publish it to your clients.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-foreground truncate">{p.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {p.duration_minutes} min · {p.is_published ? "Published" : "Draft"}
                </p>
              </div>
              <Switch
                checked={p.is_published}
                onCheckedChange={async (v) => {
                  await setPlanPublished(p.id, v);
                  setPlans((cur) => cur.map((x) => (x.id === p.id ? { ...x, is_published: v } : x)));
                }}
              />
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const its = await loadPlanItems(p.id);
                  setPlaying({ title: p.name, items: attachExercises(its, pool) });
                }}
              >
                <Play className="w-4 h-4 mr-1" /> Preview
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEdit(p)}>
                Edit
              </Button>
              <div className="flex-1" />
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                aria-label="Delete workout"
                onClick={async () => {
                  await deletePlan(p.id);
                  setPlans((cur) => cur.filter((x) => x.id !== p.id));
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit workout" : "New workout"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  placeholder="e.g. Coach Megha's Tabata Burn"
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Length</Label>
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
                    <SelectItem value={ANY}>Any</SelectItem>
                    {lists.workout_types.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Level</Label>
                <Select value={levelId} onValueChange={setLevelId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ANY}>Any</SelectItem>
                    {lists.exercise_experience_levels.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 flex items-end">
                <Button variant="outline" className="w-full" onClick={autoFill}>
                  <Shuffle className="w-4 h-4 mr-1" /> Auto-fill
                </Button>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Description (optional)</Label>
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>
                  Drills ({playable.length}) ·{" "}
                  {Math.max(1, Math.round(planDurationSeconds(items) / 60))} min
                </Label>
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {playable.map((it, i) => (
                  <div key={`${it.exercise_id}-${i}`} className="flex items-center gap-2">
                    <div
                      className="w-14 shrink-0 rounded-md overflow-hidden bg-muted border border-border relative"
                      style={{ aspectRatio: "16 / 9" }}
                    >
                      {(it.exercise.image_url || youtubeThumbnail(it.exercise.youtube_url)) && (
                        <img
                          src={it.exercise.image_url || (youtubeThumbnail(it.exercise.youtube_url) as string)}
                          alt=""
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{it.exercise.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {PHASE_LABEL[it.phase]} · {it.work_seconds}s / {it.rest_seconds}s rest
                      </p>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)} aria-label="Move up">
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)} aria-label="Move down">
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Remove drill"
                      onClick={() =>
                        setItems((cur) => cur.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, position: idx })))
                      }
                    >
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
                {!playable.length && (
                  <p className="text-xs text-muted-foreground">
                    Auto-fill a session, or add drills from the library below.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Add from the library</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search exercises…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredPool.map((ex) => (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => addExercise(ex)}
                    className={cn(
                      "px-3 h-8 rounded-md border border-border text-xs font-semibold",
                      "text-muted-foreground hover:text-foreground hover:border-[var(--bbdo-blue)]"
                    )}
                  >
                    + {ex.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Publish to clients</p>
                <p className="text-[11px] text-muted-foreground">
                  Turn off to keep it as a draft only you can see.
                </p>
              </div>
              <Switch checked={publish} onCheckedChange={setPublish} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {playing && (
        <WorkoutPlayer title={playing.title} items={playing.items} onClose={() => setPlaying(null)} />
      )}
    </div>
  );
}
