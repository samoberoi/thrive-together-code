import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Plus, Trash2, Gauge } from "lucide-react";

type Band = {
  id: string;
  slug: string;
  grade: number;
  min_points: number;
  max_points: number;
  kicker: string;
  headline: string;
  headline_highlight: string | null;
  accent: string;
  closing_line: string | null;
  cta_label: string;
  sort_order: number;
  is_active: boolean;
};

type Card = {
  id: string;
  band_id: string;
  title: string;
  description: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
};

type Rule = {
  id: string;
  question_key: string;
  question_label: string;
  answer_key: string | null;
  answer_label: string;
  match_type: "equals" | "range";
  min_value: number | null;
  max_value: number | null;
  points: number;
  sort_order: number;
  is_active: boolean;
};

const input = "w-full h-9 px-2 rounded-lg border bg-background text-sm";

export default function AdminOnboardingGrades() {
  const [bands, setBands] = useState<Band[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [b, c, r] = await Promise.all([
      (supabase as any).from("onboarding_grade_bands").select("*").order("grade", { ascending: false }),
      (supabase as any).from("onboarding_grade_band_cards").select("*").order("sort_order"),
      (supabase as any).from("onboarding_grade_rules").select("*").order("sort_order"),
    ]);
    if (b.error || c.error || r.error) {
      toast.error(b.error?.message || c.error?.message || r.error?.message);
      return;
    }
    setBands(b.data ?? []);
    setCards(c.data ?? []);
    setRules(r.data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const groupedRules = useMemo(() => {
    const map = new Map<string, Rule[]>();
    rules.forEach((r) => {
      const arr = map.get(r.question_key) ?? [];
      arr.push(r);
      map.set(r.question_key, arr);
    });
    return Array.from(map.entries());
  }, [rules]);

  const patchBand = (id: string, patch: Partial<Band>) =>
    setBands((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const patchCard = (id: string, patch: Partial<Card>) =>
    setCards((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const patchRule = (id: string, patch: Partial<Rule>) =>
    setRules((rows) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const b of bands) {
        const { error } = await (supabase as any).from("onboarding_grade_bands").update({
          grade: b.grade, min_points: b.min_points, max_points: b.max_points, kicker: b.kicker,
          headline: b.headline, headline_highlight: b.headline_highlight, accent: b.accent,
          closing_line: b.closing_line, cta_label: b.cta_label, is_active: b.is_active,
        }).eq("id", b.id);
        if (error) throw error;
      }
      for (const c of cards) {
        const { error } = await (supabase as any).from("onboarding_grade_band_cards").update({
          title: c.title, description: c.description, icon: c.icon,
          sort_order: c.sort_order, is_active: c.is_active,
        }).eq("id", c.id);
        if (error) throw error;
      }
      for (const r of rules) {
        const { error } = await (supabase as any).from("onboarding_grade_rules").update({
          question_label: r.question_label, answer_key: r.answer_key, answer_label: r.answer_label,
          match_type: r.match_type, min_value: r.min_value, max_value: r.max_value,
          points: r.points, sort_order: r.sort_order, is_active: r.is_active,
        }).eq("id", r.id);
        if (error) throw error;
      }
      toast.success("Onboarding grading saved");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const addCard = async (bandId: string) => {
    const { error } = await (supabase as any).from("onboarding_grade_band_cards").insert({
      band_id: bandId, title: "New card", description: "Describe what's happening.", icon: "Sparkles",
      sort_order: (cards.filter((c) => c.band_id === bandId).length || 0) + 1,
    });
    if (error) return toast.error(error.message);
    load();
  };

  const addRule = async (questionKey: string, questionLabel: string) => {
    const { error } = await (supabase as any).from("onboarding_grade_rules").insert({
      question_key: questionKey, question_label: questionLabel,
      answer_key: "new_answer", answer_label: "New answer", match_type: "equals", points: 0,
      sort_order: (rules[rules.length - 1]?.sort_order ?? 0) + 1,
    });
    if (error) return toast.error(error.message);
    load();
  };

  const removeRow = async (table: string, id: string) => {
    if (!confirm("Delete this row?")) return;
    const { error } = await (supabase as any).from(table).delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="w-5 h-5 text-[var(--bbdo-blue)]" />
          <h2 className="text-lg font-black">Onboarding Grading</h2>
        </div>
        <button onClick={saveAll} disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg bg-[var(--bbdo-blue)] text-white text-sm font-semibold disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save all"}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">
        Points are scored from the first 5 onboarding steps. The total decides which "Understanding your body" screen the user sees.
        For multi-select goals, only the highest-scoring selection counts.
      </p>

      {/* Bands */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">Severity bands & copy</h3>
        {bands.map((b) => (
          <div key={b.id} className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold border capitalize">{b.slug}</span>
              <span className="text-xs text-muted-foreground">Grade {b.grade}</span>
              <label className="ml-auto flex items-center gap-1 text-xs">
                <input type="checkbox" checked={b.is_active} onChange={(e) => patchBand(b.id, { is_active: e.target.checked })} /> Active
              </label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <label className="text-xs text-muted-foreground">Min points
                <input className={input} type="number" value={b.min_points} onChange={(e) => patchBand(b.id, { min_points: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-muted-foreground">Max points
                <input className={input} type="number" value={b.max_points} onChange={(e) => patchBand(b.id, { max_points: Number(e.target.value) })} />
              </label>
              <label className="text-xs text-muted-foreground">Accent
                <select className={input} value={b.accent} onChange={(e) => patchBand(b.id, { accent: e.target.value })}>
                  <option value="red">Red</option>
                  <option value="amber">Amber</option>
                  <option value="green">Green</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground">CTA label
                <input className={input} value={b.cta_label} onChange={(e) => patchBand(b.id, { cta_label: e.target.value })} />
              </label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <label className="text-xs text-muted-foreground">Kicker
                <input className={input} value={b.kicker} onChange={(e) => patchBand(b.id, { kicker: e.target.value })} />
              </label>
              <label className="text-xs text-muted-foreground">Headline
                <input className={input} value={b.headline} onChange={(e) => patchBand(b.id, { headline: e.target.value })} />
              </label>
              <label className="text-xs text-muted-foreground">Highlighted words
                <input className={input} value={b.headline_highlight ?? ""} onChange={(e) => patchBand(b.id, { headline_highlight: e.target.value })} />
              </label>
            </div>
            <label className="text-xs text-muted-foreground block">Closing line
              <input className={input} value={b.closing_line ?? ""} onChange={(e) => patchBand(b.id, { closing_line: e.target.value })} />
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase text-muted-foreground">Insight cards</p>
                <button onClick={() => addCard(b.id)} className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Add card
                </button>
              </div>
              {cards.filter((c) => c.band_id === b.id).map((c) => (
                <div key={c.id} className="grid grid-cols-12 gap-2 items-start">
                  <input className={`${input} col-span-12 sm:col-span-3`} value={c.title} onChange={(e) => patchCard(c.id, { title: e.target.value })} placeholder="Title" />
                  <input className={`${input} col-span-12 sm:col-span-6`} value={c.description} onChange={(e) => patchCard(c.id, { description: e.target.value })} placeholder="Description" />
                  <input className={`${input} col-span-6 sm:col-span-2`} value={c.icon} onChange={(e) => patchCard(c.id, { icon: e.target.value })} placeholder="Lucide icon" />
                  <button onClick={() => removeRow("onboarding_grade_band_cards", c.id)} className="col-span-6 sm:col-span-1 h-9 rounded-lg border text-destructive flex items-center justify-center">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Rules */}
      <section className="space-y-4">
        <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">Answer points</h3>
        {groupedRules.map(([key, list]) => (
          <div key={key} className="rounded-2xl border p-4 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-bold">{list[0].question_label}</p>
                <p className="text-xs text-muted-foreground font-mono">{key}</p>
              </div>
              <button onClick={() => addRule(key, list[0].question_label)} className="inline-flex items-center gap-1 h-8 px-2 rounded-lg border text-xs font-semibold">
                <Plus className="w-3.5 h-3.5" /> Add answer
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-1">Answer</th>
                    <th className="text-left p-1">Match</th>
                    <th className="text-left p-1">Value / Range</th>
                    <th className="text-left p-1">Points</th>
                    <th className="text-left p-1">Active</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="p-1 min-w-[160px]">
                        <input className={input} value={r.answer_label} onChange={(e) => patchRule(r.id, { answer_label: e.target.value })} />
                      </td>
                      <td className="p-1">
                        <select className={input} value={r.match_type} onChange={(e) => patchRule(r.id, { match_type: e.target.value as Rule["match_type"] })}>
                          <option value="equals">Exact</option>
                          <option value="range">Range</option>
                        </select>
                      </td>
                      <td className="p-1 min-w-[180px]">
                        {r.match_type === "equals" ? (
                          <input className={input} value={r.answer_key ?? ""} onChange={(e) => patchRule(r.id, { answer_key: e.target.value })} placeholder="answer key" />
                        ) : (
                          <div className="flex gap-1">
                            <input className={input} type="number" value={r.min_value ?? ""} onChange={(e) => patchRule(r.id, { min_value: e.target.value === "" ? null : Number(e.target.value) })} placeholder="min" />
                            <input className={input} type="number" value={r.max_value ?? ""} onChange={(e) => patchRule(r.id, { max_value: e.target.value === "" ? null : Number(e.target.value) })} placeholder="max" />
                          </div>
                        )}
                      </td>
                      <td className="p-1 w-24">
                        <input className={input} type="number" value={r.points} onChange={(e) => patchRule(r.id, { points: Number(e.target.value) })} />
                      </td>
                      <td className="p-1 text-center">
                        <input type="checkbox" checked={r.is_active} onChange={(e) => patchRule(r.id, { is_active: e.target.checked })} />
                      </td>
                      <td className="p-1">
                        <button onClick={() => removeRow("onboarding_grade_rules", r.id)} className="h-9 w-9 rounded-lg border text-destructive flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
