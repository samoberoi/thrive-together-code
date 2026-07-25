import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowRight, TrendingDown } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";

import soniaBishtImg from "@/assets/sonia-bisht.jpg";
import muneeruddinImg from "@/assets/muneeruddin-mohammed.jpg";

// Preload the hero photos the moment this module loads so switching stories
// never shows a white flash while the next image is fetched/decoded.
if (typeof window !== "undefined") {
  [soniaBishtImg, muneeruddinImg].forEach((src) => {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  });
}

const stories = [
  {
    name: "Sonia Bisht", age: 38, city: "Dehradun",
    before: { hba1c: "9.8%", weight: "71 kg", energy: "Low" },
    after: { hba1c: "5.5%", weight: "57 kg", energy: "High" },
    quote: "Post pregnancy diabetes. Medicine-free today.",
    duration: "7 months",
    extraStat: { label: "Meds", before: "2 tabs", after: "0" },
    image: soniaBishtImg,
  },
  {
    name: "Muneeruddin Mohammed", age: 49, city: "Dubai (UAE)",
    before: { hba1c: "8.1%", weight: "80 kg", energy: "Drained" },
    after: { hba1c: "5.7%", weight: "71 kg", energy: "Strong" },
    quote: "Reduced insulin from 120 units to 8 — and got my confidence back.",
    duration: "15 months",
    extraStat: { label: "Insulin", before: "120 u", after: "8 u" },
    image: muneeruddinImg,
  },
];

const EASE = [0.22, 1, 0.36, 1] as const;

function Metric({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-3 px-1 text-center">
      <p className="text-[0.6rem] font-semibold uppercase tracking-[0.15em] text-white/55">{label}</p>
      <span className="text-white text-lg font-black leading-none">{after}</span>
      <div className="flex items-center gap-1">
        <span className="text-white/40 text-[0.65rem] line-through">{before}</span>
        <ArrowRight className="w-2.5 h-2.5 text-primary/70" />
      </div>
    </div>
  );
}

export default function TransformationStory() {
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const story = stories[current];
  const isLast = current === stories.length - 1;

  const handleCta = () => {
    if (isLast) navigate("/authority");
    else setCurrent((c) => c + 1);
  };

  return (
    <div className="phone-container ob-lock relative min-h-dvh overflow-x-hidden bg-black">
      <SoundToggle />

      {/* All photos are mounted so the next one is already decoded — no white flash
          between stories. Only the active slide is visible, and it slides in from
          the right when switching forward. */}
      {stories.map((s, idx) => (
        <motion.img
          key={s.name}
          src={s.image}
          alt={s.name}
          loading="eager"
          decoding="async"
          className="absolute inset-0 w-full h-full object-cover object-center"
          initial={false}
          animate={{
            x: idx === current ? "0%" : idx < current ? "-100%" : "100%",
            opacity: idx === current ? 1 : 0.001,
          }}
          transition={{ x: { duration: 0.5, ease: EASE }, opacity: { duration: 0.28, ease: EASE } }}
          style={{ zIndex: idx === current ? 1 : 0 }}
        />
      ))}
      {/* Legibility gradients — dark on bottom for text, subtle on top for the kicker */}
      <div className="absolute inset-0 z-[2] bg-[linear-gradient(to_top,rgba(0,0,0,0.95)_0%,rgba(0,0,0,0.75)_25%,rgba(0,0,0,0.35)_50%,transparent_70%)]" />
      <div className="absolute inset-0 z-[2] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.75)_0%,rgba(0,0,0,0.3)_15%,transparent_30%)]" />

      <AnimatePresence initial={false} mode="wait">
        <motion.div
          key={current}
          className="absolute inset-0 z-[3]"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.32, ease: EASE }}
        >
          {/* Top — kicker + duration chip */}
          <div className="absolute top-0 left-0 right-0 px-5 pt-[calc(env(safe-area-inset-top)+2.25rem)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">Real Transformation</p>
                <h2 className="text-white text-[22px] leading-[1.1] font-black tracking-[-0.02em] mt-2">
                  Reversal isn't a promise. <span className="text-white/70">It's a pattern.</span>
                </h2>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur-md px-3 py-1.5 shrink-0 mt-1">
                <TrendingDown className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-bold text-white">{story.duration}</span>
              </div>
            </div>
            <p className="text-white/90 text-[12px] font-medium mt-3">
              Story {current + 1} of {stories.length}
            </p>
          </div>

          {/* Bottom content */}
          <div className="absolute inset-x-0 bottom-0 px-5" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + var(--bbdo-native-bottom-guard, 0px) + 18px)" }}>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.08 }}
            >
              <h1 className="text-white text-[28px] leading-[1.05] font-black tracking-[-0.02em]">
                {story.name}
              </h1>
              <p className="text-white/60 text-xs mt-1.5">Age {story.age} · {story.city}</p>

              <div className="grid grid-cols-4 rounded-2xl bg-black/55 backdrop-blur-md ring-1 ring-white/10 mt-5">
                <Metric label="HbA1c" before={story.before.hba1c} after={story.after.hba1c} />
                <Metric label="Weight" before={story.before.weight} after={story.after.weight} />
                {story.extraStat && (
                  <Metric label={story.extraStat.label} before={story.extraStat.before} after={story.extraStat.after} />
                )}
                <Metric label="Energy" before={story.before.energy} after={story.after.energy} />
              </div>

              <p className="text-[15px] italic leading-[1.5] text-white/85 mt-5">
                "{story.quote}"
              </p>

              <div className="flex items-center justify-center gap-2 mt-5">
                {stories.map((_, i) => (
                  <motion.span
                    key={i}
                    className="rounded-full bg-white"
                    animate={{ width: i === current ? 22 : 6, opacity: i === current ? 1 : 0.35 }}
                    transition={{ duration: 0.25, ease: EASE }}
                    style={{ height: 6 }}
                  />
                ))}
              </div>

              <motion.button
                onClick={handleCta}
                whileTap={{ scale: 0.98 }}
                className="ob-cta gradient-blue glow-blue mt-5"
              >
                {isLast ? "I want similar results" : "Next story"}
                <ChevronRight className="h-5 w-5" />
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
