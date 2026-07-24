import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Leaf, Salad, Drumstick, Sprout, EggFried, Loader2, Sparkles, UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { useDietTypes } from "@/hooks/useDietTypes";
import { loadDietProfile, saveDietProfile } from "@/lib/dietProfileService";
import AllergyAndSubPrefs from "@/components/diet/AllergyAndSubPrefs";

type DietPref = string;

const ICON_FOR_SLUG: Record<string, any> = {
  veg: Salad,
  vegan: Leaf,
  jain: Sprout,
  non_veg: Drumstick,
  eggitarian: EggFried,
};

function normalizePref(p: string | null | undefined): DietPref | null {
  const v = (p || "").toLowerCase().replace(/[-\s]/g, "_");
  if (!v) return null;
  if (v === "vegetarian") return "veg";
  if (v === "nonveg" || v === "non_vegetarian") return "non_veg";
  return v;
}

export default function DietPreferences({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { types: dietTypes } = useDietTypes();
  const OPTIONS = dietTypes.map(dt => ({
    value: dt.slug as DietPref,
    title: dt.label,
    desc: dt.description || "",
    icon: ICON_FOR_SLUG[dt.slug] || UtensilsCrossed,
  }));
  const [prefs, setPrefs] = useState<DietPref[]>([]);
  const [subPreferences, setSubPreferences] = useState<string[]>([]);
  const [allergenFoodIds, setAllergenFoodIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadDietProfile(user.id).then((data) => {
      if (data) {
        const arr = ((data as any).diet_preferences as string[] | null) || [];
        const fromArr = arr.map(normalizePref).filter(Boolean) as DietPref[];
        const single = normalizePref(data.diet_preference);
        const finalPrefs = single && fromArr.length > 0 && !fromArr.includes(single) ? [single] : (fromArr.length ? fromArr : single ? [single] : []);
        setPrefs(finalPrefs);
        setSubPreferences((data as any).sub_preferences ?? []);
        setAllergenFoodIds((data as any).allergen_food_ids ?? []);
      }
      setLoading(false);
    });
  }, [user]);

  const togglePref = (p: DietPref) => {
    setPrefs((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const canonical = prefs[0] || "veg";
    const ok = await saveDietProfile(user.id, {
      diet_preference: canonical,
      diet_preferences: prefs,
      sub_preferences: subPreferences,
      allergen_food_ids: allergenFoodIds,
    });
    setSaving(false);
    if (!ok) {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: prefs.length ? "Your diet preferences are updated." : "We'll show you everything." });
    onBack();
  };

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 bg-background border-b border-border">
        <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[var(--bbdo-blue)] leading-tight break-words">Profile · Diet</p>
          <h2 className="text-lg font-black text-foreground leading-tight break-words">Diet Preferences</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 pb-32">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 mb-3">
              <p className="min-w-0 text-xs font-bold tracking-wider uppercase text-muted-foreground leading-tight break-words">I eat</p>
              <p className="shrink-0 max-w-[62%] text-right text-[10px] text-muted-foreground leading-tight break-words">Pick any combination, or skip</p>
            </div>

            <div className="flex flex-col gap-2">
              {OPTIONS.map((o) => {
                const Icon = o.icon;
                const active = prefs.includes(o.value);
                return (
                  <motion.button
                    key={o.value}
                    onClick={() => togglePref(o.value)}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full text-left rounded-2xl border p-4 flex items-start gap-3 transition-colors ${active ? "border-[var(--bbdo-blue)] bg-[var(--bbdo-blue)]/5" : "border-border bg-card"}`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${active ? "bg-[var(--bbdo-blue)] text-white" : "bg-muted text-foreground"}`}>
                      <Icon className="w-5 h-5" strokeWidth={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-black text-foreground leading-tight break-words">{o.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-snug break-words">{o.desc}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 ${active ? "bg-[var(--bbdo-blue)] border-[var(--bbdo-blue)]" : "border-border"}`}>
                      {active && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <button
              onClick={() => setPrefs([])}
              className={`mt-3 w-full rounded-2xl border-2 border-dashed p-3 flex items-center justify-center gap-2 text-sm font-bold transition-colors ${prefs.length === 0 ? "border-[var(--bbdo-blue)]/50 bg-[var(--bbdo-blue)]/5 text-[var(--bbdo-blue)]" : "border-border text-muted-foreground"}`}
            >
              <Sparkles className="w-4 h-4" strokeWidth={2} />
              Skip — show me everything
            </button>

            <div className="mt-7">
              <AllergyAndSubPrefs
                dietPrefs={prefs}
                subPreferences={subPreferences}
                allergenFoodIds={allergenFoodIds}
                onSubChange={setSubPreferences}
                onAllergensChange={setAllergenFoodIds}
              />
            </div>

            <p className="text-[11px] text-muted-foreground mt-4 leading-relaxed">
              We personalise your food library, plate builder and meal suggestions based on this.
            </p>
          </>
        )}
      </div>

      <div className="fixed bottom-0 inset-x-0 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] bg-background/95 backdrop-blur border-t border-border">
        <button
          onClick={save}
          disabled={saving || loading}
          className="w-full h-12 rounded-2xl bg-[var(--bbdo-red)] text-white font-bold text-sm active:scale-[0.98] transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
}
