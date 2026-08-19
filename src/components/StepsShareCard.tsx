import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Footprints, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import bbdoLogoAsset from "@/assets/bbdo-logo.png.asset.json";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCommunityImage } from "@/lib/communityService";
import { formatShareDate, renderStepsCardPng, stepsToCalories, stepsToKm } from "@/lib/stepsShareImage";

/**
 * Expanded "steps today" panel that opens under the Movement ring — big step
 * count, estimated distance & calories, BBDO logo, today's date and a share
 * button that pushes the card straight into the community composer.
 */
export default function StepsShareCard({
  steps,
  heightCm,
  weightKg,
}: {
  steps: number;
  heightCm?: number | null;
  weightKg?: number | null;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sharing, setSharing] = useState(false);

  const km = useMemo(() => stepsToKm(steps, heightCm), [steps, heightCm]);
  const calories = useMemo(() => stepsToCalories(steps, heightCm, weightKg), [steps, heightCm, weightKg]);
  const today = formatShareDate();

  const handleShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const blob = await renderStepsCardPng({ steps, km, calories });
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
    <div className="mt-2 mb-1 rounded-2xl border-2 border-emerald-500/70 bg-card p-4">
      <div className="flex items-start justify-between">
        <img src={(bbdoLogoAsset as any).url} alt="Bye Bye Diabetes" className="h-9 w-auto" />
        <button
          type="button"
          onClick={handleShare}
          disabled={sharing || !user}
          aria-label="Share my steps to the community"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary disabled:opacity-60"
        >
          {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
        </button>
      </div>

      <div className="relative mx-auto mt-1 h-[150px] w-[190px]">
        <svg viewBox="0 0 190 150" className="h-full w-full">
          <path
            d="M18 128 A 78 78 0 1 1 172 128"
            fill="none"
            stroke="#0F1A3D"
            strokeWidth="12"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-3">
          <p className="text-[13px] font-black uppercase tracking-wide" style={{ color: "var(--bbdo-red)" }}>
            Steps
          </p>
          <p className="text-3xl font-black leading-tight text-foreground tabular-nums">
            {Math.round(steps).toLocaleString("en-IN")}
          </p>
          <Footprints className="mt-0.5 h-5 w-5 text-foreground" strokeWidth={2.4} />
        </div>
      </div>

      <div className="flex items-center justify-center gap-5 text-[13px] font-black">
        <span style={{ color: "var(--bbdo-red)" }}>
          Calories <span className="text-foreground tabular-nums">{calories.toLocaleString("en-IN")}</span>
        </span>
        <span style={{ color: "var(--bbdo-red)" }}>
          Distance <span className="text-foreground tabular-nums">{km.toFixed(1)} km</span>
        </span>
      </div>

      <p className="mt-3 border-t border-border pt-2 text-[12px] font-bold text-muted-foreground">{today}</p>
    </div>
  );
}
