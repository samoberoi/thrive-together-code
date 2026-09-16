import { supabase } from "@/integrations/supabase/client";

// The Exercise 2.0 tables are newer than the generated database types,
// so we go through an untyped client handle for them.
const db = supabase as any;

export type TaxonomyTable =
  | "workout_types"
  | "exercise_experience_levels"
  | "exercise_target_audiences"
  | "exercise_age_groups"
  | "exercise_equipment"
  | "exercise_muscle_groups";

export interface TaxonomyItem {
  id: string;
  slug: string;
  name: string;
  sort_order: number;
  enabled: boolean;
}

export const TAXONOMY_LABEL: Record<TaxonomyTable, string> = {
  workout_types: "Workout Type",
  exercise_experience_levels: "Experience Level",
  exercise_target_audiences: "Target Audience",
  exercise_age_groups: "Age Group",
  exercise_equipment: "Equipment",
  exercise_muscle_groups: "Muscle Group",
};

export const TAXONOMY_TABLES: TaxonomyTable[] = [
  "workout_types",
  "exercise_experience_levels",
  "exercise_target_audiences",
  "exercise_age_groups",
  "exercise_equipment",
  "exercise_muscle_groups",
];

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

export async function listTaxonomy(table: TaxonomyTable): Promise<TaxonomyItem[]> {
  const { data, error } = await db.from(table).select("*").order("sort_order").order("name");
  if (error) throw error;
  return (data ?? []) as TaxonomyItem[];
}

export async function createTaxonomyItem(
  table: TaxonomyTable,
  name: string,
  sortOrder: number
): Promise<TaxonomyItem> {
  const { data, error } = await db
    .from(table)
    .insert({ name: name.trim(), slug: slugify(name), sort_order: sortOrder })
    .select("*")
    .single();
  if (error) throw error;
  return data as TaxonomyItem;
}

export async function updateTaxonomyItem(
  table: TaxonomyTable,
  id: string,
  patch: Partial<Pick<TaxonomyItem, "name" | "sort_order" | "enabled">>
): Promise<void> {
  const { error } = await db
    .from(table)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTaxonomyItem(table: TaxonomyTable, id: string): Promise<void> {
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) throw error;
}

export interface Exercise2 {
  id: string;
  name: string;
  category_id: string | null;
  workout_type_id: string | null;
  experience_level_id: string | null;
  target_audience_id: string | null;
  tier: number;
  plan_key: string;
  reps_duration: string;
  sets: string;
  youtube_url: string;
  image_url: string | null;
  icon: string | null;
  instructions: string | null;
  benefits: string | null;
  cautions: string | null;
  knee_pain_substitute: string | null;
  sort_order: number;
  enabled: boolean;
  source_exercise_id: string | null;
  age_group_ids: string[];
  equipment_ids: string[];
  muscle_group_ids: string[];
}

export type Exercise2Input = Omit<Exercise2, "id" | "source_exercise_id">;

const LINKS: { table: string; col: string; field: keyof Exercise2 }[] = [
  { table: "exercises_v2_age_groups", col: "age_group_id", field: "age_group_ids" },
  { table: "exercises_v2_equipment", col: "equipment_id", field: "equipment_ids" },
  { table: "exercises_v2_muscle_groups", col: "muscle_group_id", field: "muscle_group_ids" },
];

export async function listExercises2(): Promise<Exercise2[]> {
  const { data, error } = await db
    .from("exercises_v2")
    .select("*")
    .order("sort_order")
    .order("name");
  if (error) throw error;
  const rows = (data ?? []) as Exercise2[];
  const byId = new Map<string, Exercise2>();
  rows.forEach((r) => {
    r.age_group_ids = [];
    r.equipment_ids = [];
    r.muscle_group_ids = [];
    byId.set(r.id, r);
  });

  await Promise.all(
    LINKS.map(async (l) => {
      const { data: links, error: linkErr } = await db.from(l.table).select("*");
      if (linkErr) throw linkErr;
      (links ?? []).forEach((row: any) => {
        const ex = byId.get(row.exercise_id);
        if (ex) (ex[l.field] as string[]).push(row[l.col]);
      });
    })
  );

  return rows;
}

async function saveLinks(exerciseId: string, input: Exercise2Input) {
  await Promise.all(
    LINKS.map(async (l) => {
      const ids = (input[l.field] as string[]) ?? [];
      const { error: delErr } = await db.from(l.table).delete().eq("exercise_id", exerciseId);
      if (delErr) throw delErr;
      if (!ids.length) return;
      const { error: insErr } = await db
        .from(l.table)
        .insert(ids.map((id) => ({ exercise_id: exerciseId, [l.col]: id })));
      if (insErr) throw insErr;
    })
  );
}

function scalarPayload(input: Exercise2Input) {
  const { age_group_ids, equipment_ids, muscle_group_ids, ...rest } = input;
  return rest;
}

export async function createExercise2(input: Exercise2Input): Promise<string> {
  const { data, error } = await db
    .from("exercises_v2")
    .insert(scalarPayload(input))
    .select("id")
    .single();
  if (error) throw error;
  await saveLinks(data.id, input);
  return data.id as string;
}

export async function updateExercise2(id: string, input: Exercise2Input): Promise<void> {
  const { error } = await db
    .from("exercises_v2")
    .update({ ...scalarPayload(input), updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
  await saveLinks(id, input);
}

export async function deleteExercise2(id: string): Promise<void> {
  const { error } = await db.from("exercises_v2").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleExercise2Enabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await db.from("exercises_v2").update({ enabled }).eq("id", id);
  if (error) throw error;
}

export function emptyExercise2(): Exercise2Input {
  return {
    name: "",
    category_id: null,
    workout_type_id: null,
    experience_level_id: null,
    target_audience_id: null,
    tier: 1,
    plan_key: "foundation",
    reps_duration: "",
    sets: "",
    youtube_url: "",
    image_url: null,
    icon: "🏋️",
    instructions: "",
    benefits: "",
    cautions: "",
    knee_pain_substitute: "",
    sort_order: 0,
    enabled: true,
  };
}
