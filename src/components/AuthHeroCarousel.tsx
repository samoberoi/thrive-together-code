import { useEffect, useState } from "react";
import supplements from "@/assets/auth-carousel-opt/supplements.webp";
import meditation from "@/assets/auth-carousel-opt/meditation.webp";
import fasting from "@/assets/auth-carousel-opt/fasting.webp";
import activity from "@/assets/auth-carousel-opt/activity.webp";
import morningRitual from "@/assets/auth-carousel-opt/morning-ritual.webp";

const SLIDES = [
  { url: fasting, alt: "Fasting window — lemon water and morning light" },
  { url: activity, alt: "Active walking outdoors" },
  { url: meditation, alt: "Morning meditation and calm" },
  { url: supplements, alt: "Daily supplement support" },
  { url: morningRitual, alt: "Morning ritual — lemon water, coffee and mindful start" },
];

interface Props {
  alt?: string;
  intervalMs?: number;
}

export default function AuthHeroCarousel({ intervalMs = 4200 }: Props) {
  const [i, setI] = useState(0);
  // Only the first slide is on the critical path; the rest are fetched once the
  // browser is idle so the login/OTP screen paints immediately.
  const [warm, setWarm] = useState(false);

  useEffect(() => {
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb: () => void) => window.setTimeout(cb, 800));
    const handle = idle(() => setWarm(true));
    return () => window.clearTimeout(handle as number);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % SLIDES.length), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  return (
    <>
      {SLIDES.map((s, idx) => {
        if (idx > 0 && !warm && idx !== i) return null;
        return (
          <img
            key={idx}
            src={s.url}
            alt={s.alt}
            width={1400}
            height={1050}
            loading={idx === 0 ? "eager" : "lazy"}
            fetchPriority={idx === 0 ? "high" : "low"}
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: idx === i ? 1 : 0, transition: "opacity 700ms ease-in-out", zIndex: idx === i ? 1 : 0 }}
          />
        );
      })}

      <div className="absolute left-1/2 -translate-x-1/2 bottom-3 flex gap-1.5 z-10">
        {SLIDES.map((_, idx) => (
          <span
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-500 ${idx === i ? "w-5 bg-white" : "w-1.5 bg-white/50"}`}
          />
        ))}
      </div>
    </>
  );
}
