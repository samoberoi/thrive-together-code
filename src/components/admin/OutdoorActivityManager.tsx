import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Calculator, Info, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useConfirm } from "@/components/ConfirmProvider";
import {
  listOutdoorActivities,
  createOutdoorActivity,
  updateOutdoorActivity,
  deleteOutdoorActivity,
  estimateCaloriesLocal,
  getCalorieConfig,
  updateCalorieConfig,
  DEFAULT_CALORIE_CONFIG,
  type OutdoorActivity,
  type CalorieConfig,
} from "@/lib/outdoorActivityService";

const blank = {
  name: "",
  icon: "🏃",
  met: 6,
  distance_based: false,
  avg_speed_kmh: null as number | null,
};

export default function OutdoorActivityManager() {
  const confirm = useConfirm();
  const [items, setItems] = useState<OutdoorActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({ ...blank });
  const [busy, setBusy] = useState(false);
  const [testWeight, setTestWeight] = useState(70);
  const [testMinutes, setTestMinutes] = useState(30);
  const [config, setConfig] = useState<CalorieConfig>(DEFAULT_CALORIE_CONFIG);
  const [savingConfig, setSavingConfig] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, cfg] = await Promise.all([listOutdoorActivities(), getCalorieConfig()]);
      setItems(list);
      setConfig(cfg);
    } catch (e: any) {
      toast({ title: "Could not load activities", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const add = async () => {
    if (!draft.name.trim()) return;
    setBusy(true);
    try {
      const next = items.reduce((m, i) => Math.max(m, i.sort_order), 0) + 1;
      await createOutdoorActivity({
        ...draft,
        name: draft.name.trim(),
        sort_order: next,
        enabled: true,
      });
      setDraft({ ...blank });
      await load();
    } catch (e: any) {
      toast({ title: "Could not add", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const patch = async (item: OutdoorActivity, p: Partial<OutdoorActivity>) => {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...p } : i)));
    try {
      await updateOutdoorActivity(item.id, p as any);
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message, variant: "destructive" });
      void load();
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      await updateCalorieConfig(config);
      toast({ title: "Calorie formula saved" });
    } catch (e: any) {
      toast({ title: "Could not save formula", description: e.message, variant: "destructive" });
    } finally {
      setSavingConfig(false);
    }
  };

  const num = (k: keyof CalorieConfig) => (
    <Input
      type="number"
      step="0.1"
      className="h-9"
      value={String(config[k] ?? "")}
      onChange={(e) => setConfig({ ...config, [k]: Number(e.target.value) } as CalorieConfig)}
    />
  );

  const remove = async (item: OutdoorActivity) => {
    const ok = await confirm({
      title: `Delete "${item.name}"?`,
      description: "It will no longer be available to members.",
      confirmText: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteOutdoorActivity(item.id);
      await load();
    } catch (e: any) {
      toast({ title: "Could not delete", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="font-bold text-foreground">Add an activity</h3>
        <div className="grid gap-3 sm:grid-cols-5">
          <div className="sm:col-span-2">
            <Label className="text-xs">Name</Label>
            <Input
              value={draft.name}
              placeholder="e.g. Kayaking"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Icon</Label>
            <Input value={draft.icon} onChange={(e) => setDraft({ ...draft, icon: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Effort (MET)</Label>
            <Input
              type="number"
              step="0.1"
              value={draft.met}
              onChange={(e) => setDraft({ ...draft, met: Number(e.target.value) })}
            />
          </div>
          <div>
            <Label className="text-xs">Typical speed (km/h)</Label>
            <Input
              type="number"
              step="0.1"
              placeholder="blank = no distance"
              value={draft.avg_speed_kmh ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  avg_speed_kmh: e.target.value === "" ? null : Number(e.target.value),
                  distance_based: e.target.value !== "",
                })
              }
            />
          </div>
        </div>
        <Button onClick={add} disabled={busy || !draft.name.trim()} size="sm">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
          Add activity
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-bold text-foreground">How the calorie number is worked out</h3>
        </div>
        <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
          <p>
            <strong className="text-foreground">MET</strong> (Metabolic Equivalent of Task) is how hard
            an activity is compared with sitting still. Sitting = 1 MET, brisk walking ≈ 4, cycling ≈ 7.5,
            running ≈ 9.8, swimming ≈ 8. It is not minutes — it is intensity.
          </p>
          <p>
            <strong className="text-foreground">Calories = MET × 3.5 × body weight (kg) × minutes ÷ 200.</strong>{" "}
            3.5 is the millilitres of oxygen a person uses per kilogram of body weight each minute at rest,
            and dividing by 200 turns that oxygen use into kilocalories.
          </p>
          <p>
            If the member logs an actual distance, their real pace is compared with the activity's typical
            speed and the MET is scaled up or down in proportion — never below the floor, never above
            MET × the ceiling multiplier. If they log only time, distance is projected from the typical speed.
          </p>
          <p>
            Example: 78 kg member running 4 km in 30 minutes → pace 8 km/h against a typical 9.7 km/h, so
            MET ≈ 8.1 → about 331 kcal.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 pt-1">
          <div>
            <Label className="text-xs">Oxygen constant</Label>
            {num("oxygen_ml_per_kg_min")}
          </div>
          <div>
            <Label className="text-xs">Divisor</Label>
            {num("kcal_divisor")}
          </div>
          <div>
            <Label className="text-xs">Lowest allowed MET</Label>
            {num("met_floor")}
          </div>
          <div>
            <Label className="text-xs">Highest MET multiplier</Label>
            {num("met_ceiling_multiplier")}
          </div>
          <div>
            <Label className="text-xs">Default weight (kg)</Label>
            {num("default_weight_kg")}
          </div>
          <div>
            <Label className="text-xs">Minimum weight (kg)</Label>
            {num("min_weight_kg")}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.pace_scaling_enabled}
              onCheckedChange={(v) => setConfig({ ...config, pace_scaling_enabled: v })}
            />
            <Label className="text-xs">Adjust effort to the member's actual pace</Label>
          </div>
          <Button size="sm" onClick={saveConfig} disabled={savingConfig}>
            {savingConfig ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-1" />
            )}
            Save formula
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-bold text-foreground">Preview</h3>
        </div>
        <div className="flex flex-wrap gap-3">
          <div>
            <Label className="text-xs">Body weight (kg)</Label>
            <Input
              type="number"
              className="w-32"
              value={testWeight}
              onChange={(e) => setTestWeight(Number(e.target.value))}
            />
          </div>
          <div>
            <Label className="text-xs">Minutes</Label>
            <Input
              type="number"
              className="w-32"
              value={testMinutes}
              onChange={(e) => setTestMinutes(Number(e.target.value))}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Every row below shows the result of the settings above for this weight and duration.
        </p>
      </div>

      {loading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {items.map((item) => {
            const est = estimateCaloriesLocal(item, testWeight, testMinutes, null, config);
            return (
              <div key={item.id} className="p-3 flex flex-wrap items-center gap-3">
                <span className="text-lg w-6 text-center">{item.icon}</span>
                <span className="font-semibold text-sm text-foreground min-w-[8rem] flex-1">
                  {item.name}
                </span>

                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-muted-foreground">MET</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20"
                    value={item.met}
                    onChange={(e) => patch(item, { met: Number(e.target.value) })}
                  />
                </div>

                <div className="flex items-center gap-1">
                  <Label className="text-[10px] text-muted-foreground">km/h</Label>
                  <Input
                    type="number"
                    step="0.1"
                    className="h-8 w-20"
                    value={item.avg_speed_kmh ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      patch(item, {
                        avg_speed_kmh: e.target.value === "" ? null : Number(e.target.value),
                        distance_based: e.target.value !== "",
                      })
                    }
                  />
                </div>

                <span className="text-xs font-semibold text-[var(--bbdo-blue)] whitespace-nowrap">
                  ≈ {est.calories} kcal
                  {est.distance_km ? ` · ${est.distance_km} km` : ""}
                </span>

                <Switch
                  checked={item.enabled}
                  onCheckedChange={(v) => patch(item, { enabled: v })}
                />
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remove(item)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            );
          })}
          {!items.length && <div className="p-4 text-sm text-muted-foreground">No activities yet.</div>}
        </div>
      )}
    </div>
  );
}
