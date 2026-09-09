import { useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Share2, Loader2, Download, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import bbdoLogo from "@/assets/logo.png";
import { useAuth } from "@/contexts/AuthContext";
import { uploadCommunityImage } from "@/lib/communityService";
import { formatShareDate } from "@/lib/stepsShareImage";
import { isNative } from "@/lib/platform";

export interface TrendShareStat {
  label: string;
  value: string;
}

/**
 * Share/download card for the health-score, weight, glucose and steps trends.
 * Visually matches StepsShareCard so every shared image feels like one family.
 */
export default function MetricTrendShareCard({
  title,
  rangeLabel,
  headlineLabel,
  headlineValue,
  headlineUnit,
  color,
  icon: Icon,
  stats,
  series,
  celebrate,
  caption,
  fileSlug,
}: {
  title: string;
  rangeLabel: string;
  headlineLabel: string;
  headlineValue: string;
  headlineUnit?: string;
  color: string;
  icon: typeof TrendingUp;
  stats: TrendShareStat[];
  series: number[];
  /** true = improving (green), false = needs work, null = neutral */
  celebrate: boolean | null;
  caption: string;
  fileSlug: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const max = Math.max(...series, 1);
  const bars = series.slice(-30);

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
      const fileName = `bbdo-${fileSlug}-${new Date().toISOString().slice(0, 10)}.png`;

      if (isNative()) {
        const b64 = await new Promise<string>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.onerror = () => reject(new Error("read failed"));
          fr.readAsDataURL(blob);
        });
        const { Filesystem, Directory } = await import("@capacitor/filesystem");
        const { Share } = await import("@capacitor/share");
        const res = await Filesystem.writeFile({ path: fileName, data: b64, directory: Directory.Cache });
        await Share.share({ title: `My ${title.toLowerCase()} progress`, files: [res.uri] });
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
      toast.error(e?.message || "Couldn't save your progress card");
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
      const file = new File([blob], `${fileSlug}-${Date.now()}.png`, { type: "image/png" });
      const url = await uploadCommunityImage(user.id, file);
      if (!url) throw new Error("Upload failed");
      const params = new URLSearchParams(location.search);
      params.set("tab", "community");
      params.set("share", "progress");
      params.set("img", url);
      navigate(`${location.pathname}?${params.toString()}`);
    } catch (e: any) {
      toast.error(e?.message || "Couldn't prepare your progress card");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div
      ref={cardRef}
      className="relative mt-3 overflow-hidden rounded-3xl border border-[var(--bbdo-blue)]/12 bg-gradient-to-br from-white via-[#F6F9FE] to-[#E9F1FD] p-4 shadow-[0_16px_40px_-24px_rgba(22,104,214,0.55)]"
    >
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
        <img src={bbdoLogo} alt="Bye Bye Diabetes" className="h-10 w-auto object-contain" />
        <div className="flex items-center gap-2" data-capture="hide">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            aria-label={`Download my ${title.toLowerCase()} card`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--bbdo-blue)]/25 bg-white text-[var(--bbdo-blue)] shadow-sm disabled:opacity-60"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" strokeWidth={2.4} />}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing || !user}
            aria-label={`Share my ${title.toLowerCase()} to the community`}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white shadow-md disabled:opacity-60"
            style={{ backgroundColor: "var(--bbdo-blue)" }}
          >
            {sharing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" strokeWidth={2.4} />}
          </button>
        </div>
      </div>

      {/* Headline */}
      <div className="relative mt-2 flex flex-col items-center text-center">
        <Icon className="h-5 w-5" style={{ color }} strokeWidth={2.2} />
        <p className="mt-1 text-[12px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--bbdo-red)" }}>
          {headlineLabel}
        </p>
        <p className="mt-1 text-[34px] font-black leading-none tabular-nums" style={{ color: "var(--bbdo-blue)" }}>
          {headlineValue}
          {headlineUnit && <span className="ml-1 text-[13px] font-bold text-foreground/50">{headlineUnit}</span>}
        </p>
        <p className="mt-1.5 text-[11px] font-bold text-foreground/60">
          {title} · {rangeLabel}
        </p>
        {celebrate !== null && (
          <p
            className="mt-1 inline-flex items-center gap-1 text-[11px] font-black"
            style={{ color: celebrate ? "#10B981" : "#EF4444" }}
          >
            {celebrate ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {celebrate ? "Moving in the right direction" : "Keep pushing"}
          </p>
        )}
      </div>

      {/* Sparkline */}
      {bars.length > 1 && (
        <div className="mt-3 flex h-16 items-end justify-center gap-[3px] rounded-2xl border border-[var(--bbdo-blue)]/10 bg-white/70 px-3 py-2">
          {bars.map((v, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-[3px]"
              style={{
                height: `${Math.max(6, (v / max) * 48)}px`,
                backgroundColor: color,
                opacity: 0.35 + (0.65 * (i + 1)) / bars.length,
              }}
            />
          ))}
        </div>
      )}

      {/* Stats */}
      <div className={`mt-3 grid gap-2 ${stats.length === 4 ? "grid-cols-4" : "grid-cols-3"}`}>
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--bbdo-blue)]/10 bg-white/70 px-2.5 py-2 text-center">
            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-foreground/55">{s.label}</p>
            <p className="mt-0.5 text-[13px] font-black tabular-nums leading-tight" style={{ color: "var(--bbdo-blue)" }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-center text-[12px] font-semibold leading-snug text-foreground/70">{caption}</p>

      <div className="mt-3 flex items-center justify-center gap-2 border-t border-border/60 pt-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--bbdo-red)" }} />
        <p className="text-[12px] font-bold" style={{ color: "var(--bbdo-blue)" }}>{formatShareDate(new Date())}</p>
      </div>
    </div>
  );
}
