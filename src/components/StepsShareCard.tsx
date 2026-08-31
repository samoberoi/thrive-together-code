import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Share2, Loader2, Download, Flame, MapPin, Footprints } from "lucide-react";
import { toast } from "sonner";
import bbdoLogo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCommunityImage } from "@/lib/communityService";
import {
  formatShareDate,
  stepsHeadline,
  stepsToCalories,
  stepsToKm,
} from "@/lib/stepsShareImage";
import { isNative } from "@/lib/platform";
import { sanitizeDailySteps } from "@/lib/healthStepsMath";

/**
 * Expanded "steps" panel — big step count, estimated distance & calories,
 * BBDO logo, the date, a download button (save to gallery / files for
 * WhatsApp) and a share button that pushes the card straight into the
 * community composer.
 */
export default function StepsShareCard({
  steps: rawSteps,
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
  const steps = sanitizeDailySteps(rawSteps);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const km = useMemo(() => stepsToKm(steps, heightCm), [steps, heightCm]);
  const calories = useMemo(() => stepsToCalories(steps, heightCm, weightKg), [steps, heightCm, weightKg]);
  const day = date ?? new Date();
  const label = formatShareDate(day);
  const headline = stepsHeadline(steps);
  // Zero steps must render a completely empty gauge — no teaser sliver.
  const pct = steps <= 0 ? 0 : Math.max(0.03, Math.min(1, steps / 10000));
  const cardRef = useRef<HTMLDivElement | null>(null);

  /** Snapshot the exact on-screen card so Download & Share are pixel-identical. */
  const captureCard = async (): Promise<Blob | null> => {
    const node = cardRef.current;
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    return await toBlob(node, {
      pixelRatio: 3,
      cacheBust: true,
      backgroundColor: "#ffffff",
      filter: (el) => !(el instanceof HTMLElement && el.dataset?.capture === "hide"),
    });
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await captureCard();
      if (!blob) throw new Error("Could not build the image");
      const fileName = `bbdo-steps-${day.toISOString().slice(0, 10)}.png`;

      if (isNative()) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.onerror = () => reject(new Error("read failed"));
          fr.readAsDataURL(blob);
        });
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const res = await Filesystem.writeFile({
          path: fileName,
          data: b64,
          directory: Directory.Cache,
        });
        await Share.share({ title: "My steps today", files: [res.uri] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast.success("Saved to your downloads");
      }
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save your steps card");
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!user) return;
    setSharing(true);
    try {
      const blob = await captureCard();
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

  const R = 78;
  const CIRC = 2 * Math.PI * R;
  const ARC = CIRC * 0.72; // 260° gauge

  return (
    <div
      ref={cardRef}
      className="relative mt-2 mb-1 overflow-hidden rounded-3xl border border-[var(--bbdo-blue)]/12 bg-gradient-to-br from-white via-[#F6F9FE] to-[#E9F1FD] p-4 shadow-[0_16px_40px_-24px_rgba(22,104,214,0.55)]"
    >
      {/* dotted texture */}
      <div
        className="pointer-events-none absolute right-0 top-0 h-32 w-32 opacity-[0.18]"
        style={{
          backgroundImage: "radial-gradient(circle, var(--bbdo-blue) 1.4px, transparent 1.4px)",
          backgroundSize: "12px 12px",
          maskImage: "radial-gradient(circle at 100% 0%, black, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle at 100% 0%, black, transparent 72%)",
        }}
      />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-2">
          <img src={bbdoLogo} alt="Bye Bye Diabetes" className="h-10 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-2" data-capture="hide">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-label="Download my steps card"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--bbdo-blue)]/25 bg-white text-[var(--bbdo-blue)] shadow-sm disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing || !user}
            aria-label="Share my steps to the community"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md disabled:opacity-60"
            style={{ backgroundColor: "var(--bbdo-blue)" }}
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" strokeWidth={2.4} />}
          </button>
        </div>
      </div>

      {/* Gauge */}
      <div className="relative mx-auto mt-1 h-[196px] w-[210px]">
        <svg viewBox="0 0 210 196" className="h-full w-full">
          <defs>
            <linearGradient id="bbdoStepsArc" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--bbdo-blue)" />
              <stop offset="100%" stopColor="#6FB1F7" />
            </linearGradient>
          </defs>
          <g transform="translate(105,100) rotate(140)">
            <circle
              r={R}
              fill="none"
              stroke="var(--bbdo-blue-soft, #E7F0FD)"
              strokeWidth="14"
              strokeLinecap="round"
              strokeDasharray={`${ARC} ${CIRC}`}
            />
            {pct > 0 && (
              <circle
                r={R}
                fill="none"
                stroke="url(#bbdoStepsArc)"
                strokeWidth="14"
                strokeLinecap="round"
                strokeDasharray={`${ARC * pct} ${CIRC}`}
              />
            )}
          </g>
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <Footprints className="h-5 w-5" style={{ color: "var(--bbdo-blue)" }} strokeWidth={2.2} />
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-[12px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--bbdo-red)" }}>
              Steps
            </p>

          </div>
          <p className="mt-1 text-[30px] font-black leading-none tabular-nums" style={{ color: "var(--bbdo-blue)" }}>
            {Math.round(steps).toLocaleString("en-IN")}
          </p>
          <div className="mt-2 flex items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--bbdo-blue)" }} />
          </div>

          <p className="mt-1.5 text-[11px] font-bold text-foreground/70">{headline.top}</p>
          <p className="text-[11px] font-black" style={{ color: "var(--bbdo-blue)" }}>
            {headline.bottom}
          </p>
        </div>

      </div>

      {/* Stats — calories + distance on one compact row */}
      <div className="mt-1 flex items-stretch rounded-2xl border border-[var(--bbdo-blue)]/10 bg-white/70 px-3 py-2">
        <div className="flex flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bbdo-red)]/10">
            <Flame className="h-4 w-4" style={{ color: "var(--bbdo-red)" }} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/55">Calories</p>
            <p className="text-[17px] font-black tabular-nums" style={{ color: "var(--bbdo-red)" }}>
              {calories.toLocaleString("en-IN")}
              <span className="ml-1 text-[10px] font-bold text-foreground/50">kcal</span>
            </p>
          </div>
        </div>

        <div className="mx-2 w-px shrink-0 self-stretch bg-border/70" />

        <div className="flex flex-1 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bbdo-blue)]/10">
            <MapPin className="h-4 w-4" style={{ color: "var(--bbdo-blue)" }} strokeWidth={2.4} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="text-[10px] font-bold uppercase tracking-wide text-foreground/55">Distance</p>
            <p className="text-[17px] font-black tabular-nums" style={{ color: "var(--bbdo-blue)" }}>
              {km.toFixed(1)}
              <span className="ml-1 text-[10px] font-bold text-foreground/50">km</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quote */}
      <p className="mt-2.5 text-center text-[12px] font-semibold leading-snug text-foreground/70">
        Every step is a step toward{" "}
        <span className="font-black" style={{ color: "var(--bbdo-blue)" }}>
          better metabolic health.
        </span>
      </p>


      <div className="mt-3 flex items-center justify-center gap-2 border-t border-border/60 pt-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--bbdo-red)" }} />
        <p className="text-[12px] font-bold" style={{ color: "var(--bbdo-blue)" }}>{label}</p>
      </div>
    </div>
  );
}
