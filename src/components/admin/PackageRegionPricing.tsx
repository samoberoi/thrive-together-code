import { useEffect, useMemo, useState } from "react";
import { Globe, Loader2, Save, Wand2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  CYCLE_LABEL,
  CYCLE_MONTHS,
  computePrice,
  fetchPricingRegions,
  fetchRegionPricing,
  formatRegionMoney,
  suggestRegionPrice,
  upsertRegionPrice,
  type BillingCycle,
  type PackageRegionPrice,
  type PackageWithPricing,
  type PricingRegion,
} from "@/lib/packageService";

const CYCLES: BillingCycle[] = ["monthly", "quarterly", "half_yearly", "yearly"];

export default function PackageRegionPricing({ pkg }: { pkg: PackageWithPricing }) {
  const [regions, setRegions] = useState<PricingRegion[]>([]);
  const [rows, setRows] = useState<Record<string, PackageRegionPrice>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [rg, pr] = await Promise.all([fetchPricingRegions(), fetchRegionPricing([pkg.id])]);
      if (cancelled) return;
      setRegions(rg);
      setRows(Object.fromEntries(pr.map((r) => [r.region_code, r])));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pkg.id]);

  const enabledCycles = useMemo(
    () => pkg.pricing.filter((p) => p.enabled).sort((a, b) => CYCLE_MONTHS[a.billing_cycle] - CYCLE_MONTHS[b.billing_cycle]),
    [pkg.pricing]
  );

  const priceFor = (region: PricingRegion) =>
    rows[region.code]?.monthly_price ?? suggestRegionPrice(pkg.base_monthly_price, region);

  const setPrice = (code: string, monthly_price: number) =>
    setRows((prev) => ({
      ...prev,
      [code]: { ...(prev[code] ?? ({ id: "", package_id: pkg.id, region_code: code, enabled: true } as PackageRegionPrice)), monthly_price },
    }));

  const setEnabled = (code: string, enabled: boolean) =>
    setRows((prev) => ({
      ...prev,
      [code]: { ...(prev[code] ?? ({ id: "", package_id: pkg.id, region_code: code, monthly_price: 0 } as PackageRegionPrice)), enabled },
    }));

  const recalcAll = () => {
    setRows((prev) => {
      const next = { ...prev };
      for (const r of regions) {
        next[r.code] = {
          ...(next[r.code] ?? ({ id: "", package_id: pkg.id, region_code: r.code, enabled: true } as PackageRegionPrice)),
          monthly_price: suggestRegionPrice(pkg.base_monthly_price, r),
        };
      }
      return next;
    });
    toast.success("Recalculated from the India price (+uplift, rounded)");
  };

  const save = async () => {
    setSaving(true);
    let failed = false;
    for (const r of regions) {
      const row = rows[r.code];
      const { error } = await upsertRegionPrice({
        package_id: pkg.id,
        region_code: r.code,
        monthly_price: row?.monthly_price ?? suggestRegionPrice(pkg.base_monthly_price, r),
        enabled: row?.enabled ?? true,
      });
      if (error) failed = true;
    }
    setSaving(false);
    failed ? toast.error("Some regions could not be saved") : toast.success("Regional pricing saved");
  };

  if (loading) {
    return (
      <div className="liquid-glass rounded-2xl p-5 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading regional pricing…
      </div>
    );
  }

  return (
    <div className="liquid-glass rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-primary" /> International pricing
          </p>
          <p className="text-xs text-muted-foreground">
            India stays at ₹{pkg.base_monthly_price.toLocaleString("en-IN")}/mo. Other regions carry the uplift and use the same billing-cycle discounts.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={recalcAll} className="gap-1.5">
            <Wand2 className="w-3.5 h-3.5" /> Recalculate
          </Button>
          <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save regions
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {regions.map((r) => {
          const monthly = priceFor(r);
          const enabled = rows[r.code]?.enabled ?? true;
          return (
            <div key={r.code} className="rounded-lg bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.currency} · +{r.uplift_percent}% · rounded to {r.round_to}
                  </p>
                </div>
                <Switch checked={enabled} onCheckedChange={(v) => setEnabled(r.code, v)} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-14 shrink-0">{r.symbol.trim()}/mo</span>
                <Input
                  type="number"
                  value={monthly}
                  onChange={(e) => setPrice(r.code, Number(e.target.value))}
                  className="h-8 w-28"
                />
                <span className="text-[11px] text-muted-foreground">
                  suggested {formatRegionMoney(suggestRegionPrice(pkg.base_monthly_price, r), r)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 pt-1">
                {(enabledCycles.length ? enabledCycles : pkg.pricing).map((row) => {
                  const months = CYCLE_MONTHS[row.billing_cycle];
                  const { monthly: m, total } = computePrice(monthly, row.discount_percent, months);
                  return (
                    <p key={row.billing_cycle} className="text-[11px] text-muted-foreground">
                      <span className="text-foreground font-medium">{CYCLE_LABEL[row.billing_cycle]}</span>{" "}
                      {formatRegionMoney(m, r)}/mo · {formatRegionMoney(total, r)}
                    </p>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
