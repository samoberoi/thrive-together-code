import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { X, Leaf, Flame, Wheat, Beef, Droplets, Apple } from "lucide-react";
import { type FoodItem, type FoodFilter, getDietBadge, giLabel, giClass, recLabel, recClass, range, portionLabel, scaleCalories, scaleMacro, scaleRange } from "./dietTypes";
import { getFoodImageUrl } from "@/lib/foodImageService";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function FoodItemDetail({
  item, filter, onClose,
}: { item: FoodItem; filter: FoodFilter | null; onClose: () => void }) {
  const diet = getDietBadge(item.diet_type);
  const servingLabel = portionLabel(item);
  const carbs = scaleRange(item.carbs_min, item.carbs_max, item, "g");
  const protein = scaleMacro(item.protein_g, item);
  const fat = scaleMacro(item.fat_g, item);
  const fiber = scaleMacro(item.fiber_g, item);
  const calories = scaleCalories(item.calories_kcal, item);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getFoodImageUrl(item.id).then((u) => { if (alive) setImgUrl(u); });
    return () => { alive = false; };
  }, [item.id]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] bg-background overflow-y-auto"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {/* Hero */}
      <div
        className="relative px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-8 text-white"
        style={{ background: "linear-gradient(135deg, hsl(217 83% 28%), hsl(217 91% 50%))" }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] w-10 h-10 rounded-full bg-white/15 backdrop-blur flex items-center justify-center text-white active:scale-95 transition-transform"
          aria-label="Close"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>

        <div className="max-w-2xl mx-auto flex gap-4 sm:gap-5 items-start pr-12">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={item.name}
              className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-lift shrink-0 border border-white/20"
              loading="lazy"
            />
          ) : (
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/15 backdrop-blur shrink-0 flex items-center justify-center text-3xl font-black text-white/70">
              {item.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
          {filter && (
            <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-white/80 truncate">
              {filter.number_label} · {filter.name}
            </p>
          )}
          <h2 className="text-xl sm:text-2xl font-black mt-1.5 leading-tight break-words">{item.name}</h2>
          {item.alt_name && <p className="text-sm text-white/80 mt-1 break-words">{item.alt_name}</p>}


          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur">
              {diet.title}
            </span>
            {item.gi_band && (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur">
                {giLabel[item.gi_band]}
              </span>
            )}
            <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur">
              {recLabel[item.recommendation]}
            </span>
            {item.is_jain_friendly && (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur">Jain ok</span>
            )}
            {item.is_dairy_free && (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur">Dairy-free</span>
            )}
          </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 space-y-6">
        {/* Serving */}
        <section className="rounded-2xl bg-card border border-border/60 p-5">
          <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground">Suggested portion</p>
          <p className="text-xl font-black text-foreground mt-1">{servingLabel}</p>
          {item.household_measure && (
            <p className="text-sm text-muted-foreground mt-1">{item.household_measure}</p>
          )}
        </section>

        {/* Nutrition grid */}
        <section>
          <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-3">
            Nutrition (per {servingLabel})
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Stat icon={Wheat} label="Carbs" value={carbs} tint="bg-amber-500/10 text-amber-700" />
            <Stat icon={Beef} label="Protein" value={protein != null ? `${protein}g` : "—"} tint="bg-rose-500/10 text-rose-700" />
            <Stat icon={Droplets} label="Fat" value={fat != null ? `${fat}g` : "—"} tint="bg-blue-500/10 text-blue-700" />
            <Stat icon={Leaf} label="Fibre" value={fiber != null ? `${fiber}g` : "—"} tint="bg-emerald-500/10 text-emerald-700" />
            <Stat icon={Flame} label="Calories" value={calories != null ? `${calories} kcal` : "—"} tint="bg-orange-500/10 text-orange-700" />
            <Stat
              icon={Apple}
              label="Glycemic Index"
              value={item.gi_band ? range(item.gi_min, item.gi_max) + (item.gi_min || item.gi_max ? "" : giLabel[item.gi_band]) : "—"}
              tint={item.gi_band ? giClass[item.gi_band] : "bg-muted text-muted-foreground"}
            />
          </div>
        </section>

        {/* Benefits */}
        {item.health_benefits && item.health_benefits.length > 0 && (
          <section>
            <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mb-3">Why it helps</p>
            <ul className="space-y-2">
              {item.health_benefits.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm text-foreground rounded-xl bg-card border border-border/60 px-4 py-3">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--bbdo-blue)] mt-2 shrink-0" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Notes */}
        {item.notes && (
          <section className="rounded-2xl bg-amber-500/5 border border-amber-500/30 p-5">
            <p className="text-[11px] font-bold tracking-wider uppercase text-amber-700">Coach note</p>
            <p className="text-sm text-foreground mt-2 leading-relaxed">{item.notes}</p>
          </section>
        )}

        <div className="h-12" />
      </div>
    </motion.div>
  );
}

function Stat({ icon: Icon, label, value, tint }: { icon: any; label: string; value: string; tint: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-4">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tint}`}>
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <p className="text-[11px] font-bold tracking-wider uppercase text-muted-foreground mt-3">{label}</p>
      <p className="text-base font-black text-foreground mt-0.5 leading-tight">{value}</p>
    </div>
  );
}
