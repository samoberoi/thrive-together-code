import { useEffect, useMemo, useState } from "react";
import { Calendar, Sunrise, Apple, Moon, Sparkles, Loader2, Shuffle, Pencil, X, Check, Search, Leaf, Lock } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchPlatingForUser,
  regeneratePlating,
  dayIndexForToday,
  swapPlate,
  updatePlate,
  fetchApprovedFoods,
  fetchCurrentDietPreference,
  fetchTodayLoggedMealSlots,
  normalizeDietPreference,
  type DietPlating,
  type ApprovedFood,
  type LoggedMealSlots,
} from "@/lib/dietPlatingService";
import { useToast } from "@/hooks/use-toast";

const slotIcon: Record<string, any> = { first_meal: Sunrise, mid_bite: Apple, last_meal: Moon };
const slotLabel: Record<string, string> = {
  first_meal: "First Meal",
  mid_bite: "Mid-day Bite",
  last_meal: "Last Meal",
};
const slotOrder = ["first_meal", "mid_bite", "last_meal"];
const emptyLoggedSlots: LoggedMealSlots = { first_meal: false, mid_bite: false, last_meal: false };

const DIET_PREF_LABEL: Record<string, string> = {
  veg: "Veg",
  non_veg: "Non-veg",
  vegan: "Vegan",
  jain: "Jain",
  eggitarian: "Eggetarian",
};

export default function DietPlatingCalendar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [platings, setPlatings] = useState<DietPlating[]>([]);
  const [activeDay, setActiveDay] = useState(0);
  const [loading, setLoading] = useState(true);
  const [regening, setRegening] = useState(false);
  const [diet, setDiet] = useState<string>("veg");
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<DietPlating | null>(null);
  const [foods, setFoods] = useState<ApprovedFood[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [foodSearch, setFoodSearch] = useState("");
  const [savingPicker, setSavingPicker] = useState(false);
  const [loggedSlots, setLoggedSlots] = useState<LoggedMealSlots>(emptyLoggedSlots);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let [list, pref, slots] = await Promise.all([
      fetchPlatingForUser(user.id),
      fetchCurrentDietPreference(user.id),
      fetchTodayLoggedMealSlots(user.id),
    ]);
    const normalizedPref = normalizeDietPreference(pref);
    // Auto-regenerate if plates are stale relative to current diet preference,
    // or if the stored plate diet doesn't match (e.g. user updated preference
    // after plates were originally generated).
    const today = new Date().toISOString().slice(0, 10);
    const latestStart = list[0]?.plan_start_date;
    const storedDiet = list[0]?.plate_data?.diet
      ? normalizeDietPreference(list[0].plate_data.diet)
      : null;
    const planVersion = Number(list[0]?.plate_data?.v ?? 1);
    const stale =
      list.length === 0 ||
      !latestStart ||
      planVersion < 2 ||
      latestStart < today && !storedDiet ||
      (storedDiet && storedDiet !== normalizedPref);
    if (stale) {
      try {
        await regeneratePlating(user.id, normalizedPref);
        list = await fetchPlatingForUser(user.id);
      } catch {
        /* ignore, fall back to whatever plates exist */
      }
    }
    setPlatings(list);
    setDiet(normalizedPref);
    setLoggedSlots(slots);
    if (list.length) setActiveDay(dayIndexForToday(list[0].plan_start_date));
    setLoading(false);
  };

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  const planStart = platings[0]?.plan_start_date;
  const dayPlates = useMemo(() => {
    if (!planStart) return [];
    return platings
      .filter((p) => p.plan_start_date === planStart && p.day_index === activeDay)
      .sort((a, b) => slotOrder.indexOf(a.meal_slot) - slotOrder.indexOf(b.meal_slot));
  }, [platings, planStart, activeDay]);

  const totalCal = dayPlates.reduce((s, p) => s + (p.calories ?? 0), 0);

  const regenerateForDiet = async (nextDiet: string, force = false) => {
    if (!user) return;
    const normalized = normalizeDietPreference(nextDiet);
    if (!force && normalized === diet) return;
    try {
      setRegening(true);
      setDiet(normalized);
      setFoods([]);
      await regeneratePlating(user.id, normalized);
      toast({ title: "Plates updated", description: `Preference: ${DIET_PREF_LABEL[normalized] ?? normalized}` });
      await load();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setRegening(false);
    }
  };

  const regen = () => user && regenerateForDiet(diet, true);

  const doSwap = async (plate: DietPlating) => {
    if (isPlateLogged(plate)) return;
    try {
      setSwappingId(plate.id);
      const previousTitle = String((plate.plate_data as any)?.title ?? "");
      const newData = await swapPlate(plate.id);
      setPlatings((prev) => prev.map((p) => (p.id === plate.id ? { ...p, plate_data: newData, calories: p.calories } : p)));
      const nextTitle = String((newData as any)?.title ?? "");
      toast({
        title: nextTitle && nextTitle !== previousTitle ? "Meal changed" : "Meal refreshed",
        description: nextTitle || undefined,
      });
    } catch (e: any) {
      toast({ title: "Swap failed", description: e.message, variant: "destructive" });
    } finally {
      setSwappingId(null);
    }
  };

  const openPicker = async (plate: DietPlating) => {
    if (isPlateLogged(plate)) return;
    setPickerFor(plate);
    setPicked(((plate.plate_data as any)?.items as string[]) ?? []);
    setFoodSearch("");
    const list = await fetchApprovedFoods(diet);
    setFoods(list);
  };

  const isToday = Boolean(planStart) && activeDay === dayIndexForToday(planStart ?? "");
  const isPlateLogged = (plate: DietPlating) =>
    isToday && Boolean(loggedSlots[plate.meal_slot as keyof LoggedMealSlots]);

  const togglePick = (name: string) => {
    setPicked((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : prev.length >= 6 ? prev : [...prev, name],
    );
  };

  const savePicker = async () => {
    if (!pickerFor || picked.length === 0) return;
    try {
      setSavingPicker(true);
      const newData = { title: picked.join(" + "), items: picked };
      await updatePlate(pickerFor.id, newData);
      setPlatings((prev) => prev.map((p) => (p.id === pickerFor.id ? { ...p, plate_data: newData } : p)));
      setPickerFor(null);
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSavingPicker(false);
    }
  };

  const filteredFoods = useMemo(() => {
    const q = foodSearch.trim().toLowerCase();
    const list = q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods;
    const groups: Record<string, ApprovedFood[]> = {};
    list.forEach((f) => {
      (groups[f.filter_name] ||= []).push(f);
    });
    return groups;
  }, [foods, foodSearch]);


  if (loading)
    return (
      <div className="liquid-glass rounded-3xl p-5 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );

  if (platings.length === 0) {
    return (
      <div className="liquid-glass rounded-3xl p-5 text-center">
        <Calendar className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-foreground font-bold text-sm">No 30-day plan yet</p>
        <p className="text-muted-foreground text-xs mt-1">
          Your auto-generated plate plan appears once your plan is active.
        </p>
        <button
          onClick={regen}
          disabled={regening}
          className="mt-3 gradient-blue text-primary-foreground rounded-xl px-4 py-2 text-xs font-bold inline-flex items-center gap-1.5"
        >
          {regening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Generate plan
        </button>
      </div>
    );
  }

  if (!planStart) return null;

  return (
    <div className="liquid-glass rounded-3xl p-4 sm:p-5 space-y-4 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-foreground font-bold flex items-center gap-2 no-break">
            <Calendar className="w-4 h-4 text-primary" /> Your 30-Day Plate Plan
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed no-break">
            Three eats a day — first meal, one mid-day bite, last meal. Tap Shuffle to swap any one.
          </p>
        </div>
        <button
          onClick={regen}
          disabled={regening}
          className="text-[10px] font-bold uppercase text-primary px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20"
        >
          {regening ? "…" : "Regenerate"}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[11.5px] font-bold bg-primary/10 text-primary border border-primary/30">
          <Leaf className="w-3.5 h-3.5" />
          Your preference: {DIET_PREF_LABEL[diet] ?? "Veg"}
        </span>
        <span className="text-[10.5px] text-muted-foreground">
          Change it in Profile → Settings.
        </span>
      </div>

      {/* Day strip */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1">
        {Array.from({ length: 30 }).map((_, i) => {
          const active = i === activeDay;
          const today = i === dayIndexForToday(planStart);
          return (
            <button
              key={i}
              onClick={() => setActiveDay(i)}
              className={`shrink-0 w-9 h-12 rounded-xl text-[10px] font-bold flex flex-col items-center justify-center transition-colors ${
                active ? "gradient-blue text-primary-foreground glow-blue" : "bg-muted/40 text-muted-foreground hover:bg-muted"
              }`}
            >
              <span className="text-[8px] opacity-70">Day</span>
              <span className="text-sm">{i + 1}</span>
              {today && !active && <span className="w-1 h-1 rounded-full bg-primary mt-0.5" />}
            </button>
          );
        })}
      </div>

      {/* Plates */}
      <div className="space-y-3">
        {dayPlates.map((p) => {
          const Icon = slotIcon[p.meal_slot] ?? Sunrise;
          const t = (p.plate_data as any)?.title ?? "Plate";
          const items: string[] = (p.plate_data as any)?.items ?? [];
          const swapping = swappingId === p.id;
          const logged = isPlateLogged(p);
          return (
            <div
              key={p.id}
              className={`rounded-2xl p-3.5 transition-colors ${
                logged ? "bg-muted/70 border border-border/80 opacity-75" : "bg-muted/40"
              }`}
            >
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${logged ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                  <Icon className="w-4 h-4" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide leading-tight no-break">
                      {slotLabel[p.meal_slot] ?? p.meal_slot}
                    </p>
                    {logged && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-background/80 border border-border px-2 py-0.5 text-[9px] font-bold text-muted-foreground shrink-0">
                        <Lock className="w-2.5 h-2.5" /> Logged
                      </span>
                    )}
                  </div>
                  <p className="text-foreground text-[15px] font-semibold leading-snug no-break line-clamp-2">{t}</p>
                  {p.calories && <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{p.calories} kcal</p>}
                </div>

                <div className="grid gap-1.5 justify-items-end shrink-0">
                  <button
                    onClick={() => doSwap(p)}
                    disabled={swapping || logged}
                    className="no-pill h-8 min-w-[86px] justify-center text-[11px] font-bold text-primary px-2.5 rounded-full bg-primary/10 hover:bg-primary/20 inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {swapping ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shuffle className="w-3 h-3" />}
                    Shuffle
                  </button>
                  <button
                    onClick={() => openPicker(p)}
                    disabled={logged}
                    className="no-pill h-8 min-w-[86px] justify-center text-[11px] font-bold text-foreground px-2.5 rounded-full bg-background/80 border border-border hover:bg-muted inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Pencil className="w-3 h-3" /> Choose
                  </button>
                </div>
              </div>
              {items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pl-[52px] max-[380px]:pl-0">
                  {items.map((it, i) => (
                    <span
                      key={i}
                      className="text-[11px] leading-tight px-2.5 py-1 rounded-full bg-background border border-border text-foreground no-break"
                    >
                      {it}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-right">
        Day total: <span className="text-foreground font-bold">{totalCal} kcal</span>
      </p>

      {/* Choose foods sheet */}
      {pickerFor && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="w-full max-w-md h-[92svh] sm:h-auto sm:max-h-[85svh] liquid-glass rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 p-5 pb-3 space-y-3 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                    {slotLabel[pickerFor.meal_slot]}
                  </p>
                  <p className="text-foreground font-bold mt-1">Pick your foods</p>
                  <p className="text-[11px] text-muted-foreground">Choose 2–6 items · approved only</p>
                </div>
                <button
                  onClick={() => setPickerFor(null)}
                  className="w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={foodSearch}
                  onChange={(e) => setFoodSearch(e.target.value)}
                  placeholder="Search foods…"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted/40 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>

              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
                  {picked.map((n) => (
                    <button
                      key={n}
                      onClick={() => togglePick(n)}
                      className="text-[11px] font-semibold text-primary-foreground bg-primary rounded-full px-2.5 py-1 inline-flex items-center gap-1"
                    >
                      {n} <X className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3 space-y-3">
              {Object.entries(filteredFoods).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No foods match.</p>
              )}
              {Object.entries(filteredFoods).map(([group, list]) => (
                <div key={group}>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">{group}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((f) => {
                      const on = picked.includes(f.name);
                      return (
                        <button
                          key={f.id}
                          onClick={() => togglePick(f.name)}
                          className={`text-[11px] font-semibold rounded-full px-2.5 py-1 inline-flex items-center gap-1 transition-colors ${
                            on
                              ? "bg-primary text-primary-foreground"
                              : "bg-background border border-border text-foreground hover:bg-muted"
                          }`}
                        >
                          {on && <Check className="w-3 h-3" />}
                          {f.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="shrink-0 border-t border-border/60 bg-background/80 px-5 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] grid grid-cols-[0.8fr_1.2fr] gap-2">
              <button
                onClick={() => setPickerFor(null)}
                className="rounded-xl px-4 py-3 text-sm font-bold text-foreground bg-muted hover:bg-muted/70"
              >
                Cancel
              </button>
              <button
                onClick={savePicker}
                disabled={picked.length < 1 || savingPicker}
                className="gradient-blue text-primary-foreground rounded-xl px-4 py-3 text-sm font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {savingPicker ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save meal ({picked.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
