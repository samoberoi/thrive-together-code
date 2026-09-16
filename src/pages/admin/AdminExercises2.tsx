import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dumbbell,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Play,
  Search,
  Image as ImageIcon,
  Upload,
  X,
} from "lucide-react";
import {
  uploadExercise2Thumbnail,
  fileToDataUrl,
  youtubeThumbnail,
  extractYoutubeId,
} from "@/lib/exercise2ThumbnailService";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import TaxonomyManager from "@/components/admin/TaxonomyManager";
import { listCategories, type ExerciseCategory } from "@/lib/exerciseService";
import {
  listExercises2,
  listTaxonomy,
  createExercise2,
  updateExercise2,
  deleteExercise2,
  toggleExercise2Enabled,
  emptyExercise2,
  TAXONOMY_TABLES,
  TAXONOMY_LABEL,
  type Exercise2,
  type Exercise2Input,
  type TaxonomyItem,
  type TaxonomyTable,
} from "@/lib/exercise2Service";

type Tab = "library" | "taxonomy";

type Lists = Record<TaxonomyTable, TaxonomyItem[]>;

const EMPTY_LISTS: Lists = {
  workout_types: [],
  exercise_experience_levels: [],
  exercise_target_audiences: [],
  exercise_age_groups: [],
  exercise_equipment: [],
  exercise_muscle_groups: [],
};

const NONE = "__none__";

function Chips({
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

export default function AdminExercises2() {
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("library");
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Exercise2[]>([]);
  const [lists, setLists] = useState<Lists>(EMPTY_LISTS);
  const [categories, setCategories] = useState<ExerciseCategory[]>([]);

  const [search, setSearch] = useState("");
  const [fWorkout, setFWorkout] = useState<string>("all");
  const [fLevel, setFLevel] = useState<string>("all");
  const [fAudience, setFAudience] = useState<string>("all");
  const [fAge, setFAge] = useState<string>("all");
  const [fEquip, setFEquip] = useState<string>("all");
  const [fMuscle, setFMuscle] = useState<string>("all");

  const [editing, setEditing] = useState<Exercise2 | null>(null);
  const [form, setForm] = useState<Exercise2Input | null>(null);
  const [saving, setSaving] = useState(false);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ex, cats, ...tax] = await Promise.all([
        listExercises2(),
        listCategories(),
        ...TAXONOMY_TABLES.map((t) => listTaxonomy(t)),
      ]);
      setRows(ex);
      setCategories(cats);
      const next = { ...EMPTY_LISTS };
      TAXONOMY_TABLES.forEach((t, i) => {
        next[t] = tax[i] as TaxonomyItem[];
      });
      setLists(next);
    } catch (e: any) {
      toast({ title: "Could not load Exercise 2.0", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const nameOf = (table: TaxonomyTable, id: string | null) =>
    lists[table].find((i) => i.id === id)?.name ?? null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q && !r.name.toLowerCase().includes(q)) return false;
      if (fWorkout !== "all" && r.workout_type_id !== fWorkout) return false;
      if (fLevel !== "all" && r.experience_level_id !== fLevel) return false;
      if (fAudience !== "all" && r.target_audience_id !== fAudience) return false;
      if (fAge !== "all" && !r.age_group_ids.includes(fAge)) return false;
      if (fEquip !== "all" && !r.equipment_ids.includes(fEquip)) return false;
      if (fMuscle !== "all" && !r.muscle_group_ids.includes(fMuscle)) return false;
      return true;
    });
  }, [rows, search, fWorkout, fLevel, fAudience, fAge, fEquip, fMuscle]);

  const resetThumbState = () => {
    setThumbFile(null);
    setThumbPreview(null);
  };

  const openNew = () => {
    resetThumbState();
    setEditing(null);
    setForm(emptyExercise2());
  };

  const openEdit = (r: Exercise2) => {
    resetThumbState();
    setEditing(r);
    const { id, source_exercise_id, ...rest } = r;
    setForm({ ...rest });
  };

  const onSelectThumbFile = async (f: File) => {
    if (!f.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload an image.", variant: "destructive" });
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please keep it under 5MB.", variant: "destructive" });
      return;
    }
    setThumbFile(f);
    setThumbPreview(await fileToDataUrl(f));
  };

  const save = async () => {
    if (!form) return;
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let payload = form;
      if (thumbFile) {
        setThumbUploading(true);
        try {
          const url = await uploadExercise2Thumbnail(editing?.id ?? "new", thumbFile);
          payload = { ...form, image_url: url };
        } finally {
          setThumbUploading(false);
        }
      }
      if (editing) await updateExercise2(editing.id, payload);
      else await createExercise2(payload);
      resetThumbState();
      setForm(null);
      setEditing(null);
      await load();
      toast({ title: editing ? "Exercise updated" : "Exercise added" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (r: Exercise2) => {
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      description: "This only affects Exercise 2.0. The original Exercise library is untouched.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteExercise2(r.id);
      await load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  const toggleIn = (field: "age_group_ids" | "equipment_ids" | "muscle_group_ids", id: string) => {
    setForm((f) =>
      f
        ? {
            ...f,
            [field]: f[field].includes(id) ? f[field].filter((x) => x !== id) : [...f[field], id],
          }
        : f
    );
  };

  const filterSelect = (
    value: string,
    onChange: (v: string) => void,
    table: TaxonomyTable
  ) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[150px] text-xs">
        <SelectValue placeholder={TAXONOMY_LABEL[table]} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All {TAXONOMY_LABEL[table].toLowerCase()}s</SelectItem>
        {lists[table].map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const singleSelect = (
    label: TaxonomyTable,
    value: string | null,
    onChange: (v: string | null) => void
  ) => (
    <div className="space-y-1.5">
      <Label>{TAXONOMY_LABEL[label]}</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Not set" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>Not set</SelectItem>
          {lists[label].map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-[var(--bbdo-blue)]" />
            Exercise 2.0
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Tagged exercise library. Separate from the original Exercise section.
          </p>
        </div>
        {tab === "library" && (
          <Button onClick={openNew} size="sm">
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        )}
      </div>

      <div className="tabs-scroll flex gap-2 border-b">
        {(["library", "taxonomy"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "h-10 px-4 -mb-px border-b-2 text-sm font-semibold capitalize transition-colors",
              tab === t
                ? "border-[var(--bbdo-blue)] text-[var(--bbdo-blue)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "library" ? "Library" : "Dropdowns"}
          </button>
        ))}
      </div>

      {tab === "taxonomy" && (
        <div className="grid gap-4 md:grid-cols-2">
          {TAXONOMY_TABLES.map((t) => (
            <TaxonomyManager key={t} table={t} />
          ))}
        </div>
      )}

      {tab === "library" && (
        <>
          <div className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Search exercises…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {filterSelect(fWorkout, setFWorkout, "workout_types")}
              {filterSelect(fLevel, setFLevel, "exercise_experience_levels")}
              {filterSelect(fAudience, setFAudience, "exercise_target_audiences")}
              {filterSelect(fAge, setFAge, "exercise_age_groups")}
              {filterSelect(fEquip, setFEquip, "exercise_equipment")}
              {filterSelect(fMuscle, setFMuscle, "exercise_muscle_groups")}
            </div>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {filtered.length} of {rows.length} exercises
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {filtered.map((r) => (
                  <div key={r.id} className="rounded-lg border border-border bg-card shadow-sm p-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="relative w-24 shrink-0 rounded-md overflow-hidden bg-muted border border-border"
                        style={{ aspectRatio: "16 / 9" }}
                      >
                        {r.image_url || youtubeThumbnail(r.youtube_url) ? (
                          <img
                            src={r.image_url || (youtubeThumbnail(r.youtube_url) as string)}
                            alt={r.name}
                            loading="lazy"
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate">
                          {r.icon} {r.name}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {[
                            nameOf("workout_types", r.workout_type_id),
                            nameOf("exercise_experience_levels", r.experience_level_id),
                            nameOf("exercise_target_audiences", r.target_audience_id),
                          ]
                            .filter(Boolean)
                            .map((label) => (
                              <span
                                key={label as string}
                                className="px-2 py-0.5 rounded bg-muted text-[11px] font-semibold text-foreground"
                              >
                                {label}
                              </span>
                            ))}
                          {r.muscle_group_ids.map((id) => (
                            <span
                              key={id}
                              className="px-2 py-0.5 rounded bg-[var(--bbdo-blue)]/10 text-[11px] font-semibold text-[var(--bbdo-blue)]"
                            >
                              {nameOf("exercise_muscle_groups", id)}
                            </span>
                          ))}
                        </div>
                        {(r.age_group_ids.length > 0 || r.equipment_ids.length > 0) && (
                          <p className="text-[11px] text-muted-foreground mt-2">
                            {r.age_group_ids.map((id) => nameOf("exercise_age_groups", id)).join(", ")}
                            {r.age_group_ids.length > 0 && r.equipment_ids.length > 0 ? " · " : ""}
                            {r.equipment_ids.map((id) => nameOf("exercise_equipment", id)).join(", ")}
                          </p>
                        )}
                      </div>
                      <Switch
                        checked={r.enabled}
                        onCheckedChange={async (v) => {
                          await toggleExercise2Enabled(r.id, v);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: v } : x)));
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      {r.youtube_url && (
                        <a
                          href={r.youtube_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 h-8"
                        >
                          <Play className="w-3.5 h-3.5" /> Video
                        </a>
                      )}
                      <div className="flex-1" />
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(r)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(r)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit exercise" : "New exercise"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                {singleSelect("workout_types", form.workout_type_id, (v) =>
                  setForm({ ...form, workout_type_id: v })
                )}
                {singleSelect("exercise_experience_levels", form.experience_level_id, (v) =>
                  setForm({ ...form, experience_level_id: v })
                )}
                {singleSelect("exercise_target_audiences", form.target_audience_id, (v) =>
                  setForm({ ...form, target_audience_id: v })
                )}
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <Select
                    value={form.category_id ?? NONE}
                    onValueChange={(v) => setForm({ ...form, category_id: v === NONE ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Not set</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Reps / duration</Label>
                  <Input
                    value={form.reps_duration}
                    onChange={(e) => setForm({ ...form, reps_duration: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sets</Label>
                  <Input value={form.sets} onChange={(e) => setForm({ ...form, sets: e.target.value })} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>YouTube link</Label>
                  <Input
                    value={form.youtube_url}
                    placeholder="https://www.youtube.com/watch?v=…"
                    onChange={(e) => setForm({ ...form, youtube_url: e.target.value })}
                  />
                  {form.youtube_url && !extractYoutubeId(form.youtube_url) && (
                    <p className="text-[11px] text-destructive">
                      This does not look like a YouTube link.
                    </p>
                  )}
                  {form.youtube_url && extractYoutubeId(form.youtube_url) && (
                    <a
                      href={form.youtube_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-[var(--bbdo-blue)] font-semibold"
                    >
                      <Play className="w-3 h-3" /> Preview video
                    </a>
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Thumbnail</Label>
                  <div className="flex items-start gap-3">
                    <div
                      className="relative w-40 shrink-0 rounded-xl overflow-hidden bg-muted border border-border"
                      style={{ aspectRatio: "16 / 9" }}
                    >
                      {thumbPreview || form.image_url || youtubeThumbnail(form.youtube_url) ? (
                        <img
                          src={
                            thumbPreview ||
                            form.image_url ||
                            (youtubeThumbnail(form.youtube_url) as string)
                          }
                          alt="Thumbnail preview"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                          <ImageIcon className="w-6 h-6" />
                        </div>
                      )}
                      {thumbUploading && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Loader2 className="w-5 h-5 text-white animate-spin" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <input
                        ref={thumbInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void onSelectThumbFile(f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => thumbInputRef.current?.click()}
                      >
                        <Upload className="w-4 h-4 mr-1" />
                        {thumbPreview || form.image_url ? "Replace thumbnail" : "Upload thumbnail"}
                      </Button>
                      {(thumbPreview || form.image_url) && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            resetThumbState();
                            setForm({ ...form, image_url: null });
                          }}
                        >
                          <X className="w-4 h-4 mr-1" /> Remove
                        </Button>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        JPG, PNG or WEBP · up to 5MB · 16:9. Stored separately from the original
                        Exercise library.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Age groups</Label>
                <Chips
                  options={lists.exercise_age_groups}
                  selected={form.age_group_ids}
                  onToggle={(id) => toggleIn("age_group_ids", id)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Equipment</Label>
                <Chips
                  options={lists.exercise_equipment}
                  selected={form.equipment_ids}
                  onToggle={(id) => toggleIn("equipment_ids", id)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Muscle groups</Label>
                <Chips
                  options={lists.exercise_muscle_groups}
                  selected={form.muscle_group_ids}
                  onToggle={(id) => toggleIn("muscle_group_ids", id)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Instructions</Label>
                <Textarea
                  rows={3}
                  value={form.instructions ?? ""}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Benefits</Label>
                <Textarea
                  rows={2}
                  value={form.benefits ?? ""}
                  onChange={(e) => setForm({ ...form, benefits: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cautions</Label>
                <Textarea
                  rows={2}
                  value={form.cautions ?? ""}
                  onChange={(e) => setForm({ ...form, cautions: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
