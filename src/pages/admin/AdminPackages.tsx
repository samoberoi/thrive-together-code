import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package as PackageIcon, Plus, Trash2, Save, Loader2, Eye, ArrowLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchPackagesWithPricing,
  computePrice,
  CYCLE_LABEL,
  CYCLE_MONTHS,
  type BillingCycle,
  type PackageWithPricing,
} from "@/lib/packageService";
import { logAudit } from "@/lib/auditLog";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";
import { useConfirm } from "@/components/ConfirmProvider";
import PackageRegionPricing from "@/components/admin/PackageRegionPricing";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "half_yearly", "yearly"];

export default function AdminPackages() {
  const confirm = useConfirm();
  const [pkgs, setPkgs] = useState<PackageWithPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setPkgs(await fetchPackagesWithPricing());
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const patchPkg = (id: string, patch: Partial<PackageWithPricing>) =>
    setPkgs((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const patchPricing = (pkgId: string, cycle: BillingCycle, patch: Partial<{ discount_percent: number; enabled: boolean }>) =>
    setPkgs((prev) =>
      prev.map((p) =>
        p.id !== pkgId
          ? p
          : { ...p, pricing: p.pricing.map((r) => (r.billing_cycle === cycle ? { ...r, ...patch } : r)) }
      )
    );

  const toggleEnabled = async (pkg: PackageWithPricing, enabled: boolean) => {
    patchPkg(pkg.id, { enabled });
    const { error } = await (supabase as any).from("packages").update({ enabled }).eq("id", pkg.id);
    if (error) {
      patchPkg(pkg.id, { enabled: !enabled });
      toast.error("Could not update");
    } else {
      toast.success(`${pkg.name} ${enabled ? "enabled" : "disabled"}`);
      logAudit({ module: "Packages", action: enabled ? "enable" : "disable", target_type: "package", target_id: pkg.id, target_label: pkg.name });
    }
  };

  const savePkg = async (pkg: PackageWithPricing) => {
    setSaving(pkg.id);
    const { error: e1 } = await (supabase as any)
      .from("packages")
      .update({
        name: pkg.name,
        tagline: pkg.tagline,
        badge: pkg.badge,
        accent: pkg.accent,
        base_monthly_price: pkg.base_monthly_price,
        features: pkg.features,
        sort_order: pkg.sort_order,
        show_in_onboarding: pkg.show_in_onboarding,
        assigns_coach: pkg.assigns_coach,
      })
      .eq("id", pkg.id);

    let e2: any = null;
    for (const r of pkg.pricing) {
      const { error } = await (supabase as any)
        .from("package_pricing")
        .update({ discount_percent: r.discount_percent, enabled: r.enabled })
        .eq("id", r.id);
      if (error) e2 = error;
    }
    setSaving(null);
    if (e1 || e2) toast.error("Save failed");
    else {
      toast.success(`${pkg.name} saved`);
      logAudit({ module: "Packages", action: "update", target_type: "package", target_id: pkg.id, target_label: pkg.name });
    }
  };

  const addPackage = async () => {
    const key = `pkg_${Date.now()}`;
    const { data, error } = await (supabase as any)
      .from("packages")
      .insert({ plan_key: key, name: "New Package", accent: "basic", base_monthly_price: 999, features: [], sort_order: pkgs.length + 1, enabled: false })
      .select()
      .single();
    if (error || !data) return toast.error("Could not create package");
    await (supabase as any).from("package_pricing").insert(
      CYCLES.map((c) => ({ package_id: data.id, billing_cycle: c, discount_percent: c === "yearly" ? 25 : c === "half_yearly" ? 15 : c === "quarterly" ? 10 : 0 }))
    );
    logAudit({ module: "Packages", action: "create", target_type: "package", target_id: data.id, target_label: data.name });
    await load();
  };

  const removePackage = async (id: string) => {
    if (!(await confirm({ title: "Delete package?", description: "This package will be permanently removed.", destructive: true, confirmText: "Delete" }))) return;
    const target = pkgs.find((p) => p.id === id);
    const { error } = await (supabase as any).from("packages").delete().eq("id", id);
    if (error) return toast.error("Delete failed");
    toast.success("Package deleted");
    logAudit({ module: "Packages", action: "delete", target_type: "package", target_id: id, target_label: target?.name });
    await load();
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const openPkg = pkgs.find((p) => p.id === openId) ?? null;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <AnimatePresence mode="wait" initial={false}>
        {!openPkg ? (
          <motion.div
            key="list"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-black text-foreground">Packages</h1>
                <p className="text-muted-foreground text-sm">Enable, disable, or open a package to configure pricing and inclusions.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ExportCsvButton filename="packages" rows={pkgs as any} />
<ImportCsvButton table="packages" onImported={() => window.location.reload()} />
                <Button onClick={addPackage} className="gap-2">
                  <Plus className="w-4 h-4" /> New
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border divide-y overflow-hidden bg-card">
              {pkgs.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-sm">No packages yet.</div>
              )}
              {pkgs.map((pkg) => (
                <div key={pkg.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <PackageIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{pkg.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      ₹{pkg.base_monthly_price.toLocaleString("en-IN")}/mo base · {pkg.pricing.filter((r) => r.enabled).length} cycles active
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${pkg.enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
                      {pkg.enabled ? "LIVE" : "OFF"}
                    </span>
                    <Switch checked={pkg.enabled} onCheckedChange={(v) => toggleEnabled(pkg, v)} />
                    <Button size="sm" variant="outline" onClick={() => setOpenId(pkg.id)} className="gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                    {!pkg.enabled && (
                      <Button size="icon" variant="ghost" onClick={() => removePackage(pkg.id)} title="Delete">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={`detail-${openPkg.id}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5"
          >
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)} className="gap-1.5">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <div className="flex-1">
                <h1 className="text-xl font-black text-foreground">{openPkg.name}</h1>
                <p className="text-xs text-muted-foreground">Edit details, pricing, and inclusions.</p>
              </div>
              <Button onClick={() => savePkg(openPkg)} disabled={saving === openPkg.id} className="gap-2">
                {saving === openPkg.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </Button>
            </div>

            <div className="liquid-glass rounded-2xl p-5 grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <Input value={openPkg.name} onChange={(e) => patchPkg(openPkg.id, { name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tagline</label>
                <Input value={openPkg.tagline ?? ""} onChange={(e) => patchPkg(openPkg.id, { tagline: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Badge</label>
                <Input value={openPkg.badge ?? ""} onChange={(e) => patchPkg(openPkg.id, { badge: e.target.value })} placeholder="e.g. MOST POPULAR" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Accent</label>
                <select
                  value={openPkg.accent}
                  onChange={(e) => patchPkg(openPkg.id, { accent: e.target.value })}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="basic">Basic (light)</option>
                  <option value="popular">Popular (blue)</option>
                  <option value="premium">Premium (red)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Base monthly price (₹)</label>
                <Input type="number" value={openPkg.base_monthly_price} onChange={(e) => patchPkg(openPkg.id, { base_monthly_price: Number(e.target.value) })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Sort order</label>
                <Input type="number" value={openPkg.sort_order} onChange={(e) => patchPkg(openPkg.id, { sort_order: Number(e.target.value) })} />
              </div>
            </div>


            <div className="liquid-glass rounded-2xl p-5 space-y-3">
              <p className="text-sm font-semibold">Onboarding behaviour</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Show during onboarding</p>
                  <p className="text-xs text-muted-foreground">If off, this package is hidden from the user plan picker.</p>
                </div>
                <Switch checked={openPkg.show_in_onboarding !== false} onCheckedChange={(v) => patchPkg(openPkg.id, { show_in_onboarding: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm">Auto-assign a coach</p>
                  <p className="text-xs text-muted-foreground">If off, buyers of this package are left on their own — no coach is assigned and the welcome screen hides the coach card.</p>
                </div>
                <Switch checked={openPkg.assigns_coach !== false} onCheckedChange={(v) => patchPkg(openPkg.id, { assigns_coach: v })} />
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-5">
              <p className="text-sm font-semibold mb-3">Inclusions <span className="text-xs text-muted-foreground font-normal">(one per line)</span></p>
              <Textarea
                rows={7}
                value={openPkg.features.join("\n")}
                onChange={(e) => patchPkg(openPkg.id, { features: e.target.value.split("\n").map((s) => s.trimEnd()).filter(Boolean) })}
              />
            </div>

            <div className="liquid-glass rounded-2xl p-5">
              <p className="text-sm font-semibold mb-3">Billing cycles & discounts</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CYCLES.map((c) => {
                  const row = openPkg.pricing.find((r) => r.billing_cycle === c);
                  if (!row) return null;
                  const months = CYCLE_MONTHS[c];
                  const { monthly, total } = computePrice(openPkg.base_monthly_price, row.discount_percent, months);
                  return (
                    <div key={c} className="rounded-lg bg-muted/40 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold">{CYCLE_LABEL[c]}</p>
                        <Switch checked={row.enabled} onCheckedChange={(v) => patchPricing(openPkg.id, c, { enabled: v })} />
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={row.discount_percent}
                          onChange={(e) => patchPricing(openPkg.id, c, { discount_percent: Number(e.target.value) })}
                          className="h-8 w-20"
                        />
                        <span className="text-xs text-muted-foreground">% off</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        ₹{monthly.toLocaleString("en-IN")}/mo · Total ₹{total.toLocaleString("en-IN")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <PackageRegionPricing pkg={openPkg} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
