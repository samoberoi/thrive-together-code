import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ArrowRight, TrendingDown } from "lucide-react";
import SoundToggle from "@/components/SoundToggle";
import { HeroCard } from "@/components/ui/HeroCard";

import soniaImg from "@/assets/sonia-ba.jpg";
import muneerImg from "@/assets/muneeruddin-ba.jpg";
import jagadishImg from "@/assets/jagadish-ba.jpg";
import pravinImg from "@/assets/pravin-ba.jpg";
import swatiImg from "@/assets/swati-ba.jpg";


interface Story {
  name: string;
  age: number;
  city: string;
  duration?: string;
  image: string;
  quote: string;
  metrics: { label: string; before: string; after: string }[];
}

const stories: Story[] = [
  {
    name: "Sonia Bisht",
    age: 38,
    city: "Dehradun (INDIA)",
    duration: "7 months",
    image: soniaImg,
    quote: "Post pregnancy diabetes. Medicine-free today.",
    metrics: [
      { label: "HbA1c", before: "9.8%", after: "5.5%" },
      { label: "Weight", before: "71 kg", after: "57 kg" },
      { label: "Meds", before: "2 tabs", after: "0" },
      { label: "Energy", before: "Low", after: "High" },
    ],
  },
  {
    name: "Muneeruddin Mohammed",
    age: 49,
    city: "Dubai (UAE)",
    duration: "15 months",
    image: muneerImg,
    quote: "Reduced insulin from 120 units to 8 — and got my confidence back.",
    metrics: [
      { label: "HbA1c", before: "8.1%", after: "5.7%" },
      { label: "Weight", before: "80 kg", after: "71 kg" },
      { label: "Insulin", before: "120 u", after: "8 u" },
      { label: "Energy", before: "Drained", after: "Strong" },
    ],
  },
  {
    name: "Jagadish Garewal",
    age: 61,
    city: "Ludhiana (INDIA)",
    image: jagadishImg,
    quote:
      "A diabetic for 26 years, if I could do this at this age, anyone can. Hats off to Col. Gautam Guha and his platform BBDO.",
    metrics: [
      { label: "HbA1c", before: "8.2%", after: "5.2%" },
      { label: "Weight", before: "81 kg", after: "63 kg" },
      { label: "Meds", before: "8 meds", after: "0" },
      { label: "Strength", before: "Low", after: "High" },
    ],
  },
  {
    name: "Pravin Kumar",
    age: 49,
    city: "Meerut (INDIA)",
    image: pravinImg,
    quote:
      "Happy to have reversed my dyslipidemia and NASH — feel in better state of mind and body. Confidence is back.",
    metrics: [
      { label: "HbA1c", before: "9.0%", after: "5.6%" },
      { label: "Weight", before: "121 kg", after: "90 kg" },
      { label: "Meds", before: "4 meds", after: "0" },
      { label: "Strength", before: "Low", after: "High" },
    ],
  },
  {
    name: "Dr Swati Apsingkar",
    age: 47,
    city: "Pune (INDIA)",
    image: swatiImg,
    quote:
      "Happy to regain control of my health. My hypertensive medicine has also been discontinued.",
    metrics: [
      { label: "HbA1c", before: "7.4%", after: "5.4%" },
      { label: "Weight", before: "67 kg", after: "55 kg" },
      { label: "Meds", before: "5 meds", after: "0" },
      { label: "Energy", before: "Low", after: "High" },
    ],
  },
];

// Preload every collage so switching stories never shows a blank frame.
if (typeof window !== "undefined") {
  stories.forEach((s) => {
    const img = new Image();
    img.decoding = "async";
    img.src = s.image;
  });
}

const EASE = [0.22, 1, 0.36, 1] as const;

function Metric({ label, before, after }: { label: string; before: string; after: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2.5 px-1 text-center">
      <p className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-bbdo-inksoft">{label}</p>
      <span className="text-bbdo-blue text-base font-black leading-none">{after}</span>
      <div className="flex items-center gap-1">
        <span className="text-bbdo-inksoft text-[0.62rem] line-through opacity-70">{before}</span>
        <ArrowRight className="w-2.5 h-2.5 text-bbdo-blue/70" />
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
    <div className="phone-container ob-lock relative min-h-dvh overflow-x-hidden flex flex-col">
      <SoundToggle />

      {/* Header */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+2rem)] shrink-0">
        <HeroCard variant="navy" className="pb-6">
          <p className="bbdo-eyebrow text-white mb-2">Real Transformation</p>
          <h1 className="text-white text-[22px] leading-[1.1] font-extrabold tracking-tight">
            Reversal isn't a promise.{" "}
            <span className="text-white/70">It's a pattern.</span>
          </h1>
          <p className="text-white/65 text-[11px] font-medium mt-2">
            Story {current + 1} of {stories.length}
          </p>
        </HeroCard>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-4">
        <AnimatePresence initial={false} mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="flex flex-col"
          >
            {/* Before / After collage — identical frame for every story */}
            <div className="relative w-full aspect-[5/4] rounded-2xl overflow-hidden bbdo-surface-card bg-bbdo-ink/5">
              <img
                src={story.image}
                alt={`${story.name} before and after transformation`}
                loading="eager"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <span className="absolute top-2 left-2 rounded-full bg-bbdo-ink/85 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                Before
              </span>
              <span className="absolute top-2 right-2 rounded-full bg-bbdo-blue px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white">
                After
              </span>
            </div>

            <h2 className="text-bbdo-ink text-[20px] leading-[1.15] font-extrabold tracking-tight mt-4">
              {story.name}
            </h2>
            <p className="text-bbdo-inksoft text-xs mt-1">Age {story.age} · {story.city}</p>

            <div className="grid grid-cols-4 rounded-2xl sub-card sub-card-tight mt-3 p-0">
              {story.metrics.map((m) => (
                <Metric key={m.label} {...m} />
              ))}
            </div>

            <p className="text-[13px] italic leading-[1.5] text-bbdo-inksoft mt-3 pb-2">
              "{story.quote}"
            </p>
          </motion.div>
        </AnimatePresence>
      </div>


      {/* Footer */}
      <div
        className="px-5 shrink-0 bg-background pt-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + var(--bbdo-native-bottom-guard, 0px) + 18px)" }}
      >

        <div className="flex items-center justify-center gap-2 mt-4">
          {stories.map((_, i) => (
            <motion.button
              key={i}
              onClick={() => setCurrent(i)}
              className="rounded-full bg-bbdo-ink shrink-0 p-0 border-0 block"
              animate={{ width: i === current ? 22 : 6, opacity: i === current ? 1 : 0.25 }}
              transition={{ duration: 0.25, ease: EASE }}
              style={{ height: 6, minHeight: 6, minWidth: 6 }}
              aria-label={`Story ${i + 1}`}
            />
          ))}
        </div>

        <motion.button onClick={handleCta} whileTap={{ scale: 0.98 }} className="ob-cta gradient-blue mt-4">
          {isLast ? "I want similar results" : "Next story"}
          <ChevronRight className="h-5 w-5" />
        </motion.button>
      </div>
    </div>
  );
}
