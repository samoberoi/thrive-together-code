import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Footprints, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import bbdoLogo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCommunityImage } from "@/lib/communityService";
import { formatShareDate, renderStepsCardPng, stepsToCalories, stepsToKm } from "@/lib/stepsShareImage";

/**
 * Expanded "steps" panel — big step count, estimated distance & calories,
 * BBDO logo, the date and a share button that pushes the card straight into
 * the community composer. Used both under the Movement ring (today) and under
 * the weekly steps chart (any selected day).
 */
export default function StepsShareCard({
  steps,
  heightCm,
  weightKg,
  date,
}: {
  steps: number;
  heightCm?: number | null;
  weightKg?: number | null;
  /** Day this card represents. Defaults to today. */
  date?: Date;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sharing, setSharing] = useState(false);

  const km = useMemo(() => stepsToKm(steps, heightCm), [steps, heightCm]);
  const calories = useMemo(() => stepsToCalories(steps, heightCm, weightKg), [steps, heightCm, weightKg]);
  const day = date ?? new Date();
  const label = formatShareDate(day);

  const handleShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const blob = await renderStepsCardPng({ steps, km, calories, date: day });
      if (!blob) throw new Error("Could not build the image");
      const file = new File([blob], `steps-${Date.now()}.png`, { type: "image/png" });
      const url = await uploadCommunityImage(user.id, file);
      if (!url) throw new Error("Upload failed");
      const params = new URLSearchParams(location.search);
      params.set("tab", "community");
      params.set("share", "movement_goal");
      params.set("img", url);
      navigate(`${location.pathname}?${params.toString()}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't prepare your steps card");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="mt-2 mb-1 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <img src={bbdoLogo} alt="Bye Bye Diabetes" className="h-9 w-auto object-contain" />
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing || !user}
          aria-label="Share my steps to the community"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-white disabled:opacity-60"
          style={{ backgroundColor: "var(--bbdo-blue)", borderColor: "transparent" }}
        >
          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        </button>
      </div>

      <div className="relative mx-auto mt-1 h-[152px] w-[196px]">
        <svg viewBox="0 0 196 152" className="h-full w-full">
          <path
            d="M20 130 A 80 80 0 1 1 176 130"
            fill="none"
            stroke="var(--bbdo-blue-soft)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <path
            d="M20 130 A 80 80 0 1 1 176 130"
            fill="none"
            stroke="var(--bbdo-blue)"
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray="1000"
            strokeDashoffset={1000 - 385 * Math.max(0.04, Math.min(1, steps / 10000))}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-4">
          <p
            className="text-[13px] font-black uppercase tracking-[0.18em]"
            style={{ color: "var(--bbdo-red)" }}
          >
            Steps
          </p>
          <p
            className="text-[34px] font-black leading-tight tabular-nums"
            style={{ color: "var(--bbdo-blue)" }}
          >
            {Math.round(steps).toLocaleString("en-IN")}
          </p>
          <Footprints className="mt-0.5 h-5 w-5" style={{ color: "var(--bbdo-blue)" }} strokeWidth={2.4} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 text-[13px] font-black">
        <span style={{ color: "var(--bbdo-red)" }}>
          Calories{" "}
          <span className="tabular-nums" style={{ color: "var(--bbdo-blue)" }}>
            {calories.toLocaleString("en-IN")}
          </span>
        </span>
        <span style={{ color: "var(--bbdo-red)" }}>
          Distance{" "}
          <span className="tabular-nums" style={{ color: "var(--bbdo-blue)" }}>
            {km.toFixed(1)} km
          </span>
        </span>
      </div>

      <p className="mt-3 border-t border-border pt-2 text-[12px] font-bold text-muted-foreground">{label}</p>
    </div>
  );
}
