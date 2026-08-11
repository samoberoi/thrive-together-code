import { useState } from "react";

/**
 * Standard meal-time picker used everywhere FMOD/LMOD is logged
 * (patient Home, patient Fasting, coach self check-ins).
 *
 * Always lets the person pick the time the meal *actually* happened —
 * never silently stamps "now".
 */
export default function MealTimePickerSheet({
  meal,
  description,
  confirmLabel = "Log meal",
  onConfirm,
  onCancel,
}: {
  meal: "fmod" | "lmod";
  description?: string;
  confirmLabel?: string;
  /** Receives the chosen time as an ISO string (today's date + picked time). */
  onConfirm: (iso: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    const [h, m] = value.split(":").map(Number);
    const d = new Date();
    if (Number.isFinite(h) && Number.isFinite(m)) d.setHours(h, m, 0, 0);
    if (d.getTime() > Date.now()) {
      setError(`${meal === "fmod" ? "First" : "Last"} meal time can't be in the future`);
      return;
    }
    onConfirm(d.toISOString());
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-3"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--nav-h, 0px) + 12px)" }}
      onClick={onCancel}
    >
      <div
        className="bg-background rounded-2xl p-5 w-full max-w-sm shadow-lift max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-foreground mb-1">
          When did you have your {meal === "fmod" ? "first meal" : "last meal"}?
        </h3>
        <p className="text-xs text-muted-foreground mb-4">
          {description ?? "Pick the actual time to log this meal."}
        </p>
        <input
          type="time"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          className="w-full h-12 rounded-xl border border-[var(--bbdo-line)] bg-white px-4 text-base text-foreground focus:outline-none focus:border-[var(--bbdo-blue)] focus:ring-2 focus:ring-[var(--bbdo-blue)]/30"
        />
        {error && <p className="mt-2 text-[11px] font-semibold text-destructive">{error}</p>}
        <div className="mt-4 flex flex-col gap-2">
          <button
            onClick={confirm}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
          >
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="w-full py-2 text-xs text-muted-foreground">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
