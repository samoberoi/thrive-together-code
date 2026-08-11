import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Pill, Timer, Coffee, Moon } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  fetchUserPlan,
  fetchPlanItems,
  fetchTodayTracking,
  fetchSupplements,
  toggleTracking,
  type PlanItem,
  type Supplement,
} from "@/lib/supplementService";
import {
  fetchUserProtocol,
  fetchTrackingForUser,
  upsertTracking,
} from "@/lib/fastingService";
import MealTimePickerSheet from "@/components/fasting/MealTimePickerSheet";


const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const formatTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : "";

/**
 * Coach's own daily check-ins — supplements to take today and FMOD / LMOD
 * fasting logs. Nothing is hard-coded: each block only appears when the coach
 * actually has an active supplement plan / fasting protocol.
 */
export default function CoachSelfCheckins() {
  const { user } = useAuth();
  const [items, setItems] = useState<PlanItem[]>([]);
  const [suppMap, setSuppMap] = useState<Record<string, Supplement>>({});
  const [taken, setTaken] = useState<Record<string, boolean>>({});
  const [hasProtocol, setHasProtocol] = useState(false);
  const [protocolName, setProtocolName] = useState<string>("");
  const [fmodAt, setFmodAt] = useState<string | null>(null);
  const [lmodAt, setLmodAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mealPickerFor, setMealPickerFor] = useState<"fmod" | "lmod" | null>(null);


  const load = useCallback(async () => {
    if (!user) return;
    const date = todayKey();

    try {
      const plan = await fetchUserPlan(user.id);
      if (plan) {
        const [planItems, tracking, supps] = await Promise.all([
          fetchPlanItems(plan.id),
          fetchTodayTracking(user.id, date),
          fetchSupplements(),
        ]);
        setItems(planItems);
        setSuppMap(Object.fromEntries(supps.map((s) => [s.id, s])));
        setTaken(Object.fromEntries(tracking.map((t) => [t.plan_item_id, !!t.taken])));
      } else {
        setItems([]);
        setTaken({});
      }
    } catch { /* ignore */ }

    try {
      const proto = await fetchUserProtocol(user.id);
      setHasProtocol(!!proto);
      setProtocolName(((proto as any)?.protocol?.name as string) ?? "");
      if (proto) {
        const tracks = await fetchTrackingForUser(user.id, 2);
        const t = tracks.find((x: any) => x.date === date) as any;
        setFmodAt(t?.fmod_actual_time ?? null);
        setLmodAt(t?.lmod_actual_time ?? null);
      }
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const h = () => load();
    window.addEventListener("supplement-tracking-saved", h);
    window.addEventListener("fasting-log-saved", h);
    return () => {
      window.removeEventListener("supplement-tracking-saved", h);
      window.removeEventListener("fasting-log-saved", h);
    };
  }, [load]);

  const onToggleSupp = async (item: PlanItem) => {
    if (!user || busy) return;
    const next = !taken[item.id];
    setBusy(true);
    setTaken((prev) => ({ ...prev, [item.id]: next }));
    try {
      await toggleTracking(user.id, item.id, todayKey(), next);
      window.dispatchEvent(new CustomEvent("supplement-tracking-saved"));
    } catch (e: any) {
      setTaken((prev) => ({ ...prev, [item.id]: !next }));
      toast.error(e?.message || "Couldn't save that");
    } finally {
      setBusy(false);
    }
  };

  const logMeal = async (meal: "fmod" | "lmod", iso: string) => {
    if (!user || busy) return;
    if (meal === "lmod" && fmodAt && new Date(iso) <= new Date(fmodAt)) {
      toast.error("Last meal must be after your first meal");
      return;
    }
    setBusy(true);
    try {
      await upsertTracking({
        user_id: user.id,
        date: todayKey(),
        [meal === "fmod" ? "fmod_actual_time" : "lmod_actual_time"]: iso,
      } as any);
      if (meal === "fmod") setFmodAt(iso); else setLmodAt(iso);
      setMealPickerFor(null);
      toast.success(meal === "fmod" ? "First meal logged" : "Last meal logged — fasting begins!");
      window.dispatchEvent(new CustomEvent("fasting-log-saved"));
    } catch (e: any) {
      toast.error(e?.message || "Couldn't log that");
    } finally {
      setBusy(false);
    }
  };


  if (!user) return null;
  if (items.length === 0 && !hasProtocol) return null;

  const takenCount = items.filter((i) => taken[i.id]).length;

  return (
    <motion.div
      className="liquid-glass rounded-3xl p-5 space-y-4"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.08 }}
    >
      <div className="flex items-center gap-2">
        <Check className="w-5 h-5 text-primary" strokeWidth={1.8} />
        <span className="text-foreground font-bold">My check-ins today</span>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Pill className="w-4 h-4 text-warning shrink-0" strokeWidth={1.9} />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Supplements
            </p>
            <span className="ml-auto text-[10px] font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-full">
              {takenCount}/{items.length} taken
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {items.map((item) => {
              const isTaken = !!taken[item.id];
              const supp = suppMap[item.supplement_id];
              return (
                <button
                  key={item.id}
                  onClick={() => onToggleSupp(item)}
                  disabled={busy}
                  className={`flex items-center gap-3 rounded-2xl p-3 text-left transition-colors disabled:opacity-60 ${
                    isTaken ? "bg-success/10" : "bg-muted/60"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${
                      isTaken ? "bg-success border-success" : "border-border bg-background"
                    }`}
                  >
                    {isTaken && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-foreground text-sm font-semibold truncate">
                      {supp?.name ?? "Supplement"}
                    </span>
                    <span className="block text-muted-foreground text-xs truncate">
                      {[item.dosage, item.timing].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasProtocol && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-primary shrink-0" strokeWidth={1.9} />
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Fasting{protocolName ? ` · ${protocolName}` : ""}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMealPickerFor("fmod")}
              disabled={busy || !!fmodAt}
              className={`rounded-2xl p-3 flex items-center gap-2 text-left transition-colors disabled:opacity-100 ${
                fmodAt ? "bg-success/10" : "bg-muted/60"
              }`}
            >
              <Coffee className={`w-4 h-4 shrink-0 ${fmodAt ? "text-success" : "text-muted-foreground"}`} strokeWidth={1.9} />
              <span className="min-w-0">
                <span className="block text-foreground text-xs font-bold">First meal</span>
                <span className="block text-muted-foreground text-[11px] truncate">
                  {fmodAt ? formatTime(fmodAt) : "Tap to log"}
                </span>
              </span>
            </button>
            <button
              onClick={() => setMealPickerFor("lmod")}
              disabled={busy || !!lmodAt}
              className={`rounded-2xl p-3 flex items-center gap-2 text-left transition-colors disabled:opacity-100 ${
                lmodAt ? "bg-success/10" : "bg-muted/60"
              }`}
            >
              <Moon className={`w-4 h-4 shrink-0 ${lmodAt ? "text-success" : "text-muted-foreground"}`} strokeWidth={1.9} />
              <span className="min-w-0">
                <span className="block text-foreground text-xs font-bold">Last meal</span>
                <span className="block text-muted-foreground text-[11px] truncate">
                  {lmodAt ? formatTime(lmodAt) : "Tap to log"}
                </span>
              </span>
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
