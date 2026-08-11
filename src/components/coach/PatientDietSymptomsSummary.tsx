import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Salad, ShieldAlert, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadDietProfile } from "@/lib/dietProfileService";
import { fetchSymptomCatalog, loadUserSymptoms } from "@/lib/symptomsService";

interface Props {
  userId: string;
  /** Bumping this forces a reload (e.g. after the coach saves the profile). */
  refreshKey?: number;
}

const PRETTY: Record<string, string> = {
  veg: "Vegetarian",
  vegan: "Vegan",
  jain: "Jain",
  non_veg: "Non-vegetarian",
  eggitarian: "Eggetarian",
  gluten_free: "Gluten free",
  dairy_free: "Dairy free",
  nut_free: "Nut free",
  soy_free: "Soy free",
  low_sodium: "Low sodium",
  no_sugar: "No added sugar",
};

const pretty = (s: string) =>
  PRETTY[s] || s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function Chips({ items, tone }: { items: string[]; tone: "blue" | "red" | "muted" }) {
  const cls =
    tone === "blue"
      ? "text-[var(--bbdo-blue)] bg-[var(--bbdo-blue)]/10"
      : tone === "red"
      ? "text-destructive bg-destructive/10"
      : "text-foreground bg-muted";
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {items.map((t) => (
        <span key={t} className={`text-[10px] font-bold px-2 py-1 rounded-full ${cls} break-words`}>
          {t}
        </span>
      ))}
    </div>
  );
}

/**
 * Compact, live summary of a patient's diet preferences, allergies and
 * reported symptoms. Auto-refreshes whenever the underlying rows change.
 */
export default function PatientDietSymptomsSummary({ userId, refreshKey }: Props) {
  const [loading, setLoading] = useState(true);
  const [dietPrefs, setDietPrefs] = useState<string[]>([]);
  const [subPrefs, setSubPrefs] = useState<string[]>([]);
  const [allergens, setAllergens] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const load = useCallback(async () => {
    const [diet, sym, catalog] = await Promise.all([
      loadDietProfile(userId),
      loadUserSymptoms(userId),
      fetchSymptomCatalog(),
    ]);

    const prefsArr = ((diet as any)?.diet_preferences as string[] | null) || [];
    const single = diet?.diet_preference ? [diet.diet_preference] : [];
    setDietPrefs(prefsArr.length ? prefsArr : single);
    setSubPrefs(((diet as any)?.sub_preferences as string[] | null) || []);

    const ids = ((diet as any)?.allergen_food_ids as string[] | null) || [];
    if (ids.length) {
      const { data } = await supabase.from("food_items" as any).select("id,name").in("id", ids);
      const names = ((data as any[]) || []).map((f) => f.name as string);
      setAllergens(names.length ? names : ids);
    } else {
      setAllergens([]);
    }

    const labelByKey: Record<string, string> = {};
    Object.values(catalog.optionsByCategory).forEach((opts) =>
      opts.forEach((o) => {
        labelByKey[o.key] = o.label;
      }),
    );
    setSymptoms(sym.symptomKeys.map((k) => labelByKey[k] || pretty(k)));
    setNotes(sym.notes || "");
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  // Live updates when the patient (or coach) edits the profile
  useEffect(() => {
    const channel = supabase
      .channel(`patient-summary-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_diet_profiles", filter: `user_id=eq.${userId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "user_symptoms", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-5"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 }}
    >
      <p className="text-xs font-bold tracking-wider uppercase text-muted-foreground mb-3">
        Diet, allergies &amp; symptoms
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--bbdo-blue)]/10 flex items-center justify-center shrink-0">
              <Salad className="w-4 h-4 text-[var(--bbdo-blue)]" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-foreground leading-tight">Diet</p>
              {dietPrefs.length || subPrefs.length ? (
                <Chips items={[...dietPrefs, ...subPrefs].map(pretty)} tone="blue" />
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">No preference set</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-4 h-4 text-destructive" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-foreground leading-tight">Allergies</p>
              {allergens.length ? (
                <Chips items={allergens} tone="red" />
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">None reported</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center shrink-0">
              <Stethoscope className="w-4 h-4 text-foreground" strokeWidth={2} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-foreground leading-tight">
                Symptoms{symptoms.length ? ` · ${symptoms.length}` : ""}
              </p>
              {symptoms.length ? (
                <Chips items={symptoms} tone="muted" />
              ) : (
                <p className="text-xs text-muted-foreground mt-0.5">None reported</p>
              )}
              {notes && (
                <p className="text-[11px] text-muted-foreground mt-2 leading-snug break-words">{notes}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
