import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Ticket, Plus, Loader2, ArrowLeft, Trash2, Sparkles, Users } from "lucide-react";
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

export default function AdminCoupons() {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState<CouponCampaign[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  // create form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState(10);
  const [isLimited, setIsLimited] = useState(true);
  const [count, setCount] = useState(100);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState("");

  // detail
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [redemptions, setRedemptions] = useState<CouponRedemption[]>([]);
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [genCount, setGenCount] = useState(50);

  const load = async () => {
    setLoading(true);
    setCampaigns(await fetchCampaigns());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const loadDetail = async (id: string) => {
    const [cs, rs] = await Promise.all([fetchCoupons(id), fetchRedemptions(id)]);
    setCoupons(cs);
    setRedemptions(rs);
    setUserLabels(await fetchUserLabels([...new Set(rs.map((r) => r.user_id))]));
  };
  useEffect(() => { if (openId) loadDetail(openId); }, [openId]);

  const resetForm = () => {
    setName(""); setDescription(""); setDiscountType("percent"); setDiscountValue(10);
    setIsLimited(true); setCount(100); setStartDate(todayIso()); setEndDate("");
  };

  const submitCreate = async () => {
    if (!name.trim()) return toast.error("Coupon name is required");
    if (discountValue <= 0) return toast.error("Enter a discount greater than zero");
    if (!isLimited && !endDate) return toast.error("Unlimited coupons need an end date");
    setBusy(true);
    try {
      const camp = await createCampaign({
        name: name.trim(),
        description: description.trim() || null,
        discount_type: discountType,
        discount_value: discountValue,
        is_limited: isLimited,
        start_date: new Date(startDate).toISOString(),
        end_date: endDate ? new Date(`${endDate}T23:59:59`).toISOString() : null,
      });
      if (isLimited) {
        const made = await generateCoupons(camp.id, count);
        toast.success(`${made} coupon codes generated`);
      } else {
        // Unlimited: one shared code with no redemption cap.
        await generateCoupons(camp.id, 1);
        const [c] = await fetchCoupons(camp.id);
        if (c) {
          await (supabase as any).from("coupons").update({ max_redemptions: null }).eq("id", c.id);
        }
        toast.success("Shared unlimited coupon created");
      }
      resetForm();
      setCreating(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not create coupons");
    } finally {
      setBusy(false);
    }
  };

  const removeCampaign = async (c: CouponCampaign) => {
    if (!(await confirm({ title: "Delete coupon campaign?", description: `${c.name} and all its codes will be removed.`, destructive: true, confirmText: "Delete" }))) return;
    try {
      await deleteCampaign(c.id);
      toast.success("Deleted");
      setOpenId(null);
      await load();
    } catch { toast.error("Delete failed"); }
  };

  const toggleActive = async (c: CouponCampaign, active: boolean) => {
    setCampaigns((p) => p.map((x) => (x.id === c.id ? { ...x, active } : x)));
    try { await updateCampaign(c.id, { active }); } catch { toast.error("Could not update"); }
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
    } finally { setBusy(false); }
  };

  if (loading) {
    return <div className="p-6 flex items-center justify-center min-h-[40vh]"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  const open = campaigns.find((c) => c.id === openId) ?? null;

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
              <Button onClick={() => setCreating((v) => !v)} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> New coupon</Button>
            </div>

            <AnimatePresence initial={false}>
              {creating && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                  <div className="liquid-glass rounded-2xl p-5 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">Coupon name</label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Independence Day" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Discount</label>
                        <div className="flex gap-2">
                          <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="flex-1" />
                          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)} className="h-10 rounded-md border bg-background px-2 text-sm">
                            <option value="percent">% off</option>
                            <option value="flat">₹ off</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Description</label>
                      <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Festive offer for new members" />
                    </div>

                    <div className="rounded-lg border p-3 space-y-3">
                      <div>
                        <p className="text-sm font-semibold">Applicable on — duration</p>
                        <p className="text-xs text-muted-foreground">Pick the billing durations this coupon works on. Select none to allow all.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {CYCLES.map((cy) => {
                          const on = cycles.includes(cy.key);
                          return (
                            <button
                              key={cy.key}
                              type="button"
                              onClick={() => setCycles((p) => (on ? p.filter((x) => x !== cy.key) : [...p, cy.key]))}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                            >
                              {cy.label}
                            </button>
                          );
                        })}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Applicable on — packages</p>
                        <p className="text-xs text-muted-foreground">Select none to allow all packages.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {packages.map((p) => {
                          const on = planKeys.includes(p.plan_key);
                          return (
                            <button
                              key={p.plan_key}
                              type="button"
                              onClick={() => setPlanKeys((prev) => (on ? prev.filter((x) => x !== p.plan_key) : [...prev, p.plan_key]))}
                              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground"}`}
                            >
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                      <div>
                        <p className="text-sm font-semibold">Limited number of coupons</p>
                        <p className="text-xs text-muted-foreground">On: generate unique single-use codes. Off: one shared code anyone can use until the end date.</p>
                      </div>
                      <Switch checked={isLimited} onCheckedChange={setIsLimited} />
                    </div>

                    <div className="grid sm:grid-cols-3 gap-3">
                      {isLimited && (
                        <div>
                          <label className="text-xs text-muted-foreground">How many coupons</label>
                          <Input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))} />
                        </div>
                      )}
                      <div>
                        <label className="text-xs text-muted-foreground">Total uses allowed</label>
                        <Input
                          type="number"
                          value={totalLimit}
                          onChange={(e) => setTotalLimit(e.target.value)}
                          placeholder="Leave blank = unlimited"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Blank means unlimited uses during the offer window.</p>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Start date</label>
                        <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">End date {isLimited ? "(optional)" : ""}</label>
                        <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                      </div>
                    </div>


                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => { setCreating(false); resetForm(); }}>Cancel</Button>
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
                      {c.end_date ? ` · ends ${new Date(c.end_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={c.active} onCheckedChange={(v) => toggleActive(c, v)} />
                    <Button size="sm" variant="outline" onClick={() => setOpenId(c.id)}>View</Button>
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
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-foreground truncate">{open.name}</h2>
                <p className="text-xs text-muted-foreground">
                  {open.discount_type === "percent" ? `${open.discount_value}% off` : `₹${open.discount_value} off`} ·{" "}
                  {open.is_limited ? "Single-use codes" : "Shared unlimited code"}
                </p>
              </div>
              <ExportCsvButton filename={`coupons-${open.name.replace(/\s+/g, "-").toLowerCase()}`} rows={coupons as any} />
            </div>

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
              <div className="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {coupons.map((c) => (
                  <div key={c.id} className={`rounded-lg border px-3 py-2 text-xs font-mono ${c.max_redemptions !== null && c.redeemed_count >= c.max_redemptions ? "opacity-50 line-through" : ""}`}>
                    {c.code}
                    <span className="block font-sans text-[10px] text-muted-foreground">
                      used {c.redeemed_count}{c.max_redemptions !== null ? `/${c.max_redemptions}` : ""}
                    </span>
                  </div>
                ))}
                {coupons.length === 0 && <p className="text-xs text-muted-foreground">No codes yet.</p>}
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-sm font-semibold mb-3 flex items-center gap-2"><Users className="w-4 h-4" /> Usage ({redemptions.length})</p>
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
                          <td className="py-1.5 pr-3">{r.plan_key ?? "—"}</td>
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
