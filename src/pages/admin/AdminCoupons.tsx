import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, Plus, Loader2, ArrowLeft, Trash2, Sparkles, Users, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmProvider";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import {
  fetchCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  generateCoupons,
  fetchCoupons,
  fetchRedemptions,
  fetchUserLabels,
  type CouponCampaign,
  type Coupon,
  type CouponRedemption,
  type DiscountType,
} from "@/lib/couponService";

const todayIso = () => new Date().toISOString().slice(0, 10);
const toDateInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");
const prettyCycle = (key: string) =>
  key
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .replace("Half Yearly", "6 months");
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

type PackageRow = { plan_key: string; name: string };

type FormState = {
  name: string;
  description: string;
  discount_type: DiscountType;
  discount_value: number;
  is_limited: boolean;
  count: number;
  start_date: string;
  end_date: string;
  cycles: string[];
  planKeys: string[];
  totalLimit: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  description: "",
  discount_type: "percent",
  discount_value: 10,
  is_limited: true,
  count: 100,
  start_date: todayIso(),
  end_date: "",
  cycles: [],
  planKeys: [],
  totalLimit: "",
  active: true,
});

const formFromCampaign = (c: CouponCampaign): FormState => ({
  name: c.name,
  description: c.description ?? "",
  discount_type: c.discount_type,
  discount_value: Number(c.discount_value),
  is_limited: c.is_limited,
  count: c.coupon_count || 0,
  start_date: toDateInput(c.start_date),
  end_date: toDateInput(c.end_date),
  cycles: c.applicable_cycles ?? [],
  planKeys: c.applicable_plan_keys ?? [],
  totalLimit: c.total_redemption_limit != null ? String(c.total_redemption_limit) : "",
  active: c.active,
});

function Chips({
  items,
  selected,
  onToggle,
}: {
  items: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => {
        const on = selected.includes(it.key);
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onToggle(it.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"
            }`}
          >
            {on ? "✓ " : ""}
            {it.label}
          </button>
        );
      })}
      {items.length === 0 && <span className="text-xs text-muted-foreground">Nothing configured yet.</span>}
    </div>
  );
}

function CouponForm({
  value,
  onChange,
  cycles,
  packages,
  mode,
}: {
  value: FormState;
  onChange: (patch: Partial<FormState>) => void;
  cycles: { key: string; label: string }[];
  packages: PackageRow[];
  mode: "create" | "edit";
}) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Coupon name</label>
          <Input value={value.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="Independence Day" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Discount</label>
          <div className="flex gap-2">
            <Input
              type="number"
              value={value.discount_value}
              onChange={(e) => onChange({ discount_value: Number(e.target.value) })}
              className="flex-1"
            />
            <select
              value={value.discount_type}
              onChange={(e) => onChange({ discount_type: e.target.value as DiscountType })}
              className="h-10 rounded-md border bg-background px-2 text-sm"
            >
              <option value="percent">% off</option>
              <option value="flat">₹ off</option>
            </select>
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Description</label>
        <Textarea
          rows={2}
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Festive offer for new members"
        />
      </div>

      <div className="rounded-lg border p-3 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold">Applicable on — duration</p>
            <p className="text-xs text-muted-foreground">Tick the billing durations. None ticked = valid on all durations.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange({ cycles: cycles.map((c) => c.key) })}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ cycles: [] })}>
              Clear
            </Button>
          </div>
        </div>
        <Chips
          items={cycles}
          selected={value.cycles}
          onToggle={(k) => onChange({ cycles: value.cycles.includes(k) ? value.cycles.filter((x) => x !== k) : [...value.cycles, k] })}
        />

        <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
          <div>
            <p className="text-sm font-semibold">Applicable on — packages</p>
            <p className="text-xs text-muted-foreground">None ticked = valid on all packages.</p>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange({ planKeys: packages.map((p) => p.plan_key) })}>
              Select all
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange({ planKeys: [] })}>
              Clear
            </Button>
          </div>
        </div>
        <Chips
          items={packages.map((p) => ({ key: p.plan_key, label: p.name }))}
          selected={value.planKeys}
          onToggle={(k) =>
            onChange({ planKeys: value.planKeys.includes(k) ? value.planKeys.filter((x) => x !== k) : [...value.planKeys, k] })
          }
        />
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
        <div>
          <p className="text-sm font-semibold">Limited number of coupons</p>
          <p className="text-xs text-muted-foreground">
            On: generate unique single-use codes. Off: one shared code anyone can use until the end date.
          </p>
        </div>
        <Switch
          checked={value.is_limited}
          disabled={mode === "edit"}
          onCheckedChange={(v) => onChange({ is_limited: v })}
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {mode === "create" && value.is_limited && (
          <div>
            <label className="text-xs text-muted-foreground">How many coupons</label>
            <Input type="number" value={value.count} onChange={(e) => onChange({ count: Number(e.target.value) })} />
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground">Total uses allowed</label>
          <Input
            type="number"
            value={value.totalLimit}
            onChange={(e) => onChange({ totalLimit: e.target.value })}
            placeholder="Leave blank = unlimited"
          />
          <p className="text-[10px] text-muted-foreground mt-1">Blank means unlimited uses during the offer window.</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Start date</label>
          <Input type="date" value={value.start_date} onChange={(e) => onChange({ start_date: e.target.value })} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">End date {value.is_limited ? "(optional)" : ""}</label>
          <Input type="date" value={value.end_date} onChange={(e) => onChange({ end_date: e.target.value })} />
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
        <div>
          <p className="text-sm font-semibold">Active</p>
          <p className="text-xs text-muted-foreground">Turn off to stop the coupon working immediately.</p>
        </div>
        <Switch checked={value.active} onCheckedChange={(v) => onChange({ active: v })} />
      </div>
    </div>
  );
}

export default function AdminCoupons() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<FormState>(emptyForm());
  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [cycleOptions, setCycleOptions] = useState<{ key: string; label: string }[]>([]);

  // detail
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [genCount, setGenCount] = useState(50);
  const [codeEditId, setCodeEditId] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState("");

  const load = async () => {
    setLoading(true);
    setCampaigns(await fetchCampaigns());
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: pkgs }, { data: pricing }] = await Promise.all([
        (supabase as any).from("packages").select("plan_key, name").eq("enabled", true).order("sort_order"),
        (supabase as any).from("package_pricing").select("billing_cycle"),
      ]);
      setPackages((pkgs ?? []).filter((p: any) => p.plan_key !== "onboarding_test"));
      const order = ["monthly", "quarterly", "half_yearly", "yearly"];
      const uniq = [...new Set((pricing ?? []).map((r: any) => r.billing_cycle as string))].sort(
        (a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99),
      );
      setCycleOptions(uniq.map((k) => ({ key: k, label: prettyCycle(k) })));
    })();
  }, []);

  const loadDetail = async (id: string) => {
    const [cs, rs] = await Promise.all([fetchCoupons(id), fetchRedemptions(id)]);
    setCoupons(cs);
    setRedemptions(rs);
    setUserLabels(await fetchUserLabels([...new Set(rs.map((r) => r.user_id))]));
  };
  useEffect(() => {
    if (openId) loadDetail(openId);
  }, [openId]);

  const open = useMemo(() => campaigns.find((c) => c.id === openId) ?? null, [campaigns, openId]);

  const submitCreate = async () => {
    if (!form.name.trim()) return toast.error("Coupon name is required");
    if (form.discount_value <= 0) return toast.error("Enter a discount greater than zero");
    if (!form.is_limited && !form.end_date) return toast.error("Unlimited coupons need an end date");
    setBusy(true);
    try {
      const camp = await createCampaign({
        name: form.name.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        is_limited: form.is_limited,
        start_date: new Date(form.start_date).toISOString(),
        end_date: form.end_date ? new Date(`${form.end_date}T23:59:59`).toISOString() : null,
        applicable_cycles: form.cycles,
        applicable_plan_keys: form.planKeys,
        total_redemption_limit: form.totalLimit.trim() ? Number(form.totalLimit) : null,
      });
      if (!form.active) await updateCampaign(camp.id, { active: false });
      if (form.is_limited) {
        const made = await generateCoupons(camp.id, form.count);
        toast.success(`${made} coupon codes generated`);
      } else {
        await generateCoupons(camp.id, 1);
        const [c] = await fetchCoupons(camp.id);
        if (c) await (supabase as any).from("coupons").update({ max_redemptions: null }).eq("id", c.id);
        toast.success("Shared unlimited coupon created");
      }
      setForm(emptyForm());
      setCreating(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create coupons");
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = async () => {
    if (!open) return;
    if (!form.name.trim()) return toast.error("Coupon name is required");
    if (form.discount_value <= 0) return toast.error("Enter a discount greater than zero");
    setBusy(true);
    try {
      await updateCampaign(open.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        discount_type: form.discount_type,
        discount_value: form.discount_value,
        start_date: new Date(form.start_date).toISOString(),
        end_date: form.end_date ? new Date(`${form.end_date}T23:59:59`).toISOString() : null,
        applicable_cycles: form.cycles.length ? form.cycles : null,
        applicable_plan_keys: form.planKeys.length ? form.planKeys : null,
        total_redemption_limit: form.totalLimit.trim() ? Number(form.totalLimit) : null,
        active: form.active,
      } as Partial<CouponCampaign>);
      toast.success("Coupon updated");
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update coupon");
    } finally {
      setBusy(false);
    }
  };

  const removeCampaign = async (c: CouponCampaign) => {
    if (
      !(await confirm({
        title: "Delete coupon campaign?",
        description: `${c.name} and all its codes will be removed.`,
        destructive: true,
        confirmText: "Delete",
      }))
    )
      return;
    try {
      await deleteCampaign(c.id);
      toast.success("Deleted");
      setOpenId(null);
      await load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const toggleActive = async (c: CouponCampaign, active: boolean) => {
    setCampaigns((p) => p.map((x) => (x.id === c.id ? { ...x, active } : x)));
    try {
      await updateCampaign(c.id, { active });
    } catch {
      toast.error("Could not update");
    }
  };

  const addMore = async () => {
    if (!openId) return;
    setBusy(true);
    try {
      const made = await generateCoupons(openId, genCount);
      toast.success(`${made} more coupons generated`);
      await loadDetail(openId);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate");
    } finally {
      setBusy(false);
    }
  };

  const saveCode = async (c: Coupon) => {
    const code = codeDraft.trim().toUpperCase();
    if (!code) return toast.error("Code cannot be empty");
    const { error } = await (supabase as any).from("coupons").update({ code }).eq("id", c.id);
    if (error) return toast.error(error.message.includes("duplicate") ? "That code already exists" : "Could not rename code");
    setCodeEditId(null);
    if (openId) await loadDetail(openId);
    toast.success("Code updated");
  };

  const toggleCode = async (c: Coupon, active: boolean) => {
    setCoupons((p) => p.map((x) => (x.id === c.id ? { ...x, active } : x)));
    const { error } = await (supabase as any).from("coupons").update({ active }).eq("id", c.id);
    if (error) toast.error("Could not update code");
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const planName = (key: string) => packages.find((p) => p.plan_key === key)?.name ?? key;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <AnimatePresence mode="wait" initial={false}>
        {!open ? (
          <motion.div key="list" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-black text-foreground">Coupon Manager</h2>
                <p className="text-muted-foreground text-sm">Create discount coupons, generate codes in bulk and track who used them.</p>
              </div>
              <Button
                onClick={() => {
                  setForm(emptyForm());
                  setCreating((v) => !v);
                }}
                className="gap-2 shrink-0"
              >
                <Plus className="w-4 h-4" /> New coupon
              </Button>
            </div>

            <AnimatePresence initial={false}>
              {creating && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="liquid-glass rounded-2xl p-5 space-y-4">
                    <CouponForm value={form} onChange={patch} cycles={cycleOptions} packages={packages} mode="create" />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => { setCreating(false); setForm(emptyForm()); }}>Cancel</Button>
                      <Button onClick={submitCreate} disabled={busy} className="gap-2">
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Create coupons
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="rounded-2xl border divide-y overflow-hidden bg-card">
              {campaigns.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">No coupons yet.</div>}
              {campaigns.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Ticket className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.discount_type === "percent" ? `${c.discount_value}% off` : `₹${c.discount_value} off`} ·{" "}
                      {c.is_limited ? `${c.coupon_count} codes` : "Unlimited"}
                      {c.total_redemption_limit ? ` · max ${c.total_redemption_limit} uses` : ""}
                      {c.end_date ? ` · ends ${new Date(c.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.applicable_cycles?.length ? c.applicable_cycles.map(prettyCycle).join(", ") : "All durations"}
                      {" · "}
                      {c.applicable_plan_keys?.length ? c.applicable_plan_keys.map(planName).join(", ") : "All packages"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c, v)} />
                    <Button size="sm" variant="outline" onClick={() => { setEditing(false); setOpenId(c.id); }}>View</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => { setForm(formFromCampaign(c)); setEditing(true); setOpenId(c.id); }}
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => removeCampaign(c)} title="Delete">
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key={`d-${open.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="space-y-5">
            <div className="flex items-center gap-3 flex-wrap">
              <Button variant="ghost" size="sm" onClick={() => { setOpenId(null); setEditing(false); }} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-foreground truncate">{open.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {open.discount_type === "percent" ? `${open.discount_value}% off` : `₹${open.discount_value} off`} ·{" "}
                  {open.is_limited ? "Single-use codes" : "Shared unlimited code"}
                </p>
              </div>
              {!editing && (
                <Button size="sm" className="gap-1.5" onClick={() => { setForm(formFromCampaign(open)); setEditing(true); }}>
                  <Pencil className="w-3.5 h-3.5" /> Edit coupon
                </Button>
              )}
              <ExportCsvButton filename={`coupons-${open.name.replace(/\s+/g, "-").toLowerCase()}`} rows={coupons as any} />
            </div>

            {editing ? (
              <div className="liquid-glass rounded-2xl p-5 space-y-4">
                <CouponForm value={form} onChange={patch} cycles={cycleOptions} packages={packages} mode="edit" />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  <Button onClick={submitEdit} disabled={busy} className="gap-2">
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save changes
                  </Button>
                </div>
              </div>
            ) : (
              <div className="liquid-glass rounded-2xl p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  ["Status", open.active ? "Active" : "Paused"],
                  ["Discount", open.discount_type === "percent" ? `${open.discount_value}% off` : `₹${open.discount_value} off`],
                  ["Start date", fmtDate(open.start_date)],
                  ["End date", fmtDate(open.end_date)],
                  ["Type", open.is_limited ? `Limited · ${open.coupon_count} codes` : "Shared unlimited code"],
                  ["Total uses allowed", open.total_redemption_limit != null ? String(open.total_redemption_limit) : "Unlimited"],
                  ["Times used", String(redemptions.length)],
                  ["Applicable durations", open.applicable_cycles?.length ? open.applicable_cycles.map(prettyCycle).join(", ") : "All durations"],
                  ["Applicable packages", open.applicable_plan_keys?.length ? open.applicable_plan_keys.map(planName).join(", ") : "All packages"],
                  ["Description", open.description || "—"],
                  ["Created", fmtDate(open.created_at)],
                ].map(([label, val]) => (
                  <div key={label as string}>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-sm font-semibold text-foreground break-words">{val}</p>
                  </div>
                ))}
              </div>
            )}

            {open.is_limited && (
              <div className="liquid-glass rounded-2xl p-4 flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Generate more coupons</label>
                  <Input type="number" value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} className="w-32" />
                </div>
                <Button onClick={addMore} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate
                </Button>
              </div>
            )}

            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-sm font-semibold mb-3">Codes ({coupons.length})</p>
              <div className="max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {coupons.map((c) => (
                  <div key={c.id} className={`rounded-lg border px-3 py-2 text-xs ${!c.active ? "opacity-50" : ""}`}>
                    {codeEditId === c.id ? (
                      <div className="flex items-center gap-1.5">
                        <Input value={codeDraft} onChange={(e) => setCodeDraft(e.target.value.toUpperCase())} className="h-8 font-mono text-xs" />
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => saveCode(c)}><Check className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setCodeEditId(null)}><X className="w-4 h-4" /></Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-mono flex-1 truncate">{c.code}</span>
                        <Switch checked={c.active} onCheckedChange={(v) => toggleCode(c, v)} />
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setCodeEditId(c.id); setCodeDraft(c.code); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                    <span className="block font-sans text-[10px] text-muted-foreground mt-1">
                      used {c.redeemed_count}
                      {c.max_redemptions !== null ? `/${c.max_redemptions}` : ""}
                    </span>
                  </div>
                ))}
                {coupons.length === 0 && <p className="text-xs text-muted-foreground">No codes yet.</p>}
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" /> Usage ({redemptions.length})
              </p>
              {redemptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">No one has used this coupon yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="text-left">
                        <th className="py-1 pr-3">User</th>
                        <th className="py-1 pr-3">Code</th>
                        <th className="py-1 pr-3">Plan</th>
                        <th className="py-1 pr-3">Discount</th>
                        <th className="py-1 pr-3">Paid</th>
                        <th className="py-1">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {redemptions.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="py-1.5 pr-3 font-medium">{userLabels[r.user_id] ?? r.user_id.slice(0, 8)}</td>
                          <td className="py-1.5 pr-3 font-mono">{r.code}</td>
                          <td className="py-1.5 pr-3">{r.plan_key ? planName(r.plan_key) : "—"}</td>
                          <td className="py-1.5 pr-3 text-emerald-600">₹{Number(r.discount_amount ?? 0).toLocaleString("en-IN")}</td>
                          <td className="py-1.5 pr-3">₹{Number(r.final_amount ?? 0).toLocaleString("en-IN")}</td>
                          <td className="py-1.5">{new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
