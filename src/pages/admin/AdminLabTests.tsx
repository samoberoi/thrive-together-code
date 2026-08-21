import { useEffect, useMemo, useState } from "react";
import { Search, FlaskConical, Loader2, ShieldAlert, ListChecks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LabTestParametersDialog } from "@/components/lab/LabTestParametersDialog";
import { applyMarkup, effectiveMarkup, setLabTestMarkup, useLabTestMarkup } from "@/lib/labTestMarkup";
import { toast } from "sonner";
import { logAudit } from "@/lib/auditLog";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";

type LabTest = {
  id: string;
  product_code: string;
  product_name: string;
  product_type: string;
  rate: number | null;
  offer_rate: number | null;
  fasting_required: boolean | null;
  fasting_hours: number | null;
  parameters_count: number | null;
  is_active: boolean;
  coach_assignable: boolean;
  markup_pct: number | null;
};

type FilterTab = "all" | "active" | "inactive" | "coach";

type Confirm =
  | null
  | {
      kind: "single-disable";
      test: LabTest;
    }
  | {
      kind: "bulk-disable";
      tests: LabTest[];
      protected: LabTest[];
    };

type BulkDisableResult = {
  disabled_count: number;
  protected_count: number;
  protected_codes: string[] | null;
};

type BulkEnableResult = {
  enabled_count: number;
};

export default function AdminLabTests() {
  const [tests, setTests] = useState<LabTest[]>([]);
  const [inUseCodes, setInUseCodes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [paramsTest, setParamsTest] = useState<LabTest | null>(null);
  const markupPct = useLabTestMarkup();
  const [markupDraft, setMarkupDraft] = useState<string>("");
  const [savingMarkup, setSavingMarkup] = useState(false);
  const [rowMarkupDraft, setRowMarkupDraft] = useState<Record<string, string>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);

  async function saveRowMarkup(test: LabTest) {
    const raw = (rowMarkupDraft[test.id] ?? "").trim();
    const pct = raw === "" ? null : Number(raw);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0)) {
      toast.error("Enter a valid percentage (or leave empty to use global)");
      return;
    }
    setSavingRow(test.id);
    const { error } = await supabase
      .from("thyrocare_tests")
      .update({ markup_pct: pct } as any)
      .eq("id", test.id);
    setSavingRow(null);
    if (error) { toast.error(error.message); return; }
    setTests(prev => prev.map(t => t.id === test.id ? { ...t, markup_pct: pct } : t));
    setRowMarkupDraft(prev => { const n = { ...prev }; delete n[test.id]; return n; });
    logAudit({ module: "Lab Tests", action: "update", target_type: "lab_test_markup", target_id: test.id, target_label: test.product_name, metadata: { markup_pct: pct } });
    toast.success(pct === null ? "Using global markup" : `Markup set to ${pct}%`);
  }

  useEffect(() => {
    setMarkupDraft(String(markupPct));
  }, [markupPct]);

  async function handleSaveMarkup() {
    const n = Number(markupDraft);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Enter a valid percentage (0 or more)");
      return;
    }
    setSavingMarkup(true);
    try {
      await setLabTestMarkup(n);
      toast.success(`Markup set to ${Math.round(n)}%`);
    } catch (e: any) {
      toast.error(e.message || "Failed to save markup");
    } finally {
      setSavingMarkup(false);
    }
  }




  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const [allRows, inUse] = await Promise.all([
      fetchAllTests(),
      fetchInUseAll(),
    ]);
    setTests(allRows);
    setInUseCodes(inUse);
    setLoading(false);
  }

  async function fetchAllTests(): Promise<LabTest[]> {
    const pageSize = 1000;
    const all: LabTest[] = [];
    let from = 0;
    // Loop until a page returns fewer rows than the page size
    // (covers catalogs of any size beyond PostgREST's default cap)
    while (true) {
      const { data, error } = await supabase
        .from("thyrocare_tests")
        .select("id,product_code,product_name,product_type,rate,offer_rate,fasting_required,fasting_hours,parameters_count,is_active,coach_assignable,markup_pct")
        .order("product_name", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) {
        toast.error("Failed to load lab tests");
        break;
      }
      const rows = (data ?? []) as LabTest[];
      all.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function fetchInUseAll(): Promise<Set<string>> {
    const codes = new Set<string>();
    const [{ data: recs }, { data: orders }] = await Promise.all([
      supabase.from("thyrocare_recommendations").select("product_codes"),
      supabase.from("thyrocare_orders").select("product_codes,status"),
    ]);
    (recs ?? []).forEach((r: any) => (r.product_codes ?? []).forEach((c: string) => codes.add(c)));
    (orders ?? []).forEach((o: any) => {
      if (["cancelled", "failed"].includes(o.status ?? "")) return;
      (o.product_codes ?? []).forEach((c: string) => codes.add(c));
    });
    return codes;
  }

  const productTypes = useMemo(
    () => Array.from(new Set(tests.map((t) => t.product_type).filter(Boolean))).sort(),
    [tests],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tests.filter((t) => {
      if (tab === "active" && !t.is_active) return false;
      if (tab === "inactive" && t.is_active) return false;
      if (tab === "coach" && !t.coach_assignable) return false;
      if (typeFilter !== "all" && t.product_type !== typeFilter) return false;
      if (!q) return true;
      return (
        t.product_name?.toLowerCase().includes(q) ||
        t.product_code?.toLowerCase().includes(q)
      );
    });
  }, [tests, query, tab, typeFilter]);

  const counts = useMemo(
    () => ({
      total: tests.length,
      active: tests.filter((t) => t.is_active).length,
      coach: tests.filter((t) => t.coach_assignable).length,
    }),
    [tests],
  );

  const isInUse = (t: LabTest) => inUseCodes.has(t.product_code);

  const selectedTests = useMemo(
    () => tests.filter((t) => selected.has(t.id)),
    [tests, selected],
  );

  const selectedActive = useMemo(
    () => selectedTests.filter((t) => t.is_active),
    [selectedTests],
  );

  const selectedInactive = useMemo(
    () => selectedTests.filter((t) => !t.is_active),
    [selectedTests],
  );

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    const allSelected = filtered.every((t) => selected.has(t.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filtered.forEach((t) => next.delete(t.id));
      else filtered.forEach((t) => next.add(t.id));
      return next;
    });
  }

  async function applyUpdate(ids: string[], field: "is_active" | "coach_assignable", value: boolean) {
    setBusy(true);
    const payload = field === "is_active" ? { is_active: value } : { coach_assignable: value };
    const { error } = await supabase.from("thyrocare_tests").update(payload).in("id", ids);
    setBusy(false);
    if (error) {
      toast.error(error.message ?? "Update failed");
      return;
    }
    setTests((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, [field]: value } : t)));
    logAudit({
      module: "Lab Tests",
      action: field === "is_active" ? (value ? "enable" : "disable") : "update",
      target_type: "lab_test_bulk",
      metadata: { count: ids.length, field, value, ids },
    });
    toast.success(
      field === "is_active"
        ? `${ids.length} test${ids.length > 1 ? "s" : ""} ${value ? "enabled" : "disabled"}`
        : `${ids.length} test${ids.length > 1 ? "s" : ""} ${value ? "marked coach-assignable" : "removed from coach pool"}`,
    );
  }

  async function handleRowToggle(test: LabTest, field: "is_active" | "coach_assignable", value: boolean) {
    if (field === "is_active" && !value && isInUse(test)) {
      toast.error("Cannot disable: assigned to one or more users by a coach");
      return;
    }
    if (field === "is_active" && !value) {
      setConfirm({ kind: "single-disable", test });
      return;
    }
    await applyUpdate([test.id], field, value);
  }

  function openBulkDisable() {
    const chosen = selectedActive;
    if (chosen.length === 0) {
      toast.info("Selected tests are already disabled. Use Enable selected.");
      return;
    }
    const blocked = chosen.filter((t) => isInUse(t));
    const allowed = chosen.filter((t) => !isInUse(t));
    setConfirm({ kind: "bulk-disable", tests: allowed, protected: blocked });
  }

  async function openBulkEnable() {
    if (selectedInactive.length === 0) {
      toast.info("Selected tests are already active");
      return;
    }
    await bulkEnableTests(selectedInactive);
  }

  async function confirmDisable() {
    if (!confirm) return;
    if (confirm.kind === "single-disable") {
      await bulkDisableTests([confirm.test]);
    } else {
      const candidates = [...confirm.tests, ...confirm.protected];
      if (candidates.length > 0) {
        await bulkDisableTests(candidates);
        setSelected(new Set());
      }
    }
    setConfirm(null);
  }

  async function bulkDisableTests(candidates: LabTest[]) {
    setBusy(true);
    const { data, error } = await supabase.rpc("bulk_disable_lab_tests" as never, {
      _test_ids: candidates.map((t) => t.id),
    } as never);
    setBusy(false);

    if (error) {
      toast.error(error.message ?? "Bulk disable failed");
      return;
    }

    const rows = (data ?? []) as BulkDisableResult[];
    const result = rows[0];
    const protectedCodes = new Set(result?.protected_codes ?? []);
    const disabledIds = candidates.filter((t) => !protectedCodes.has(t.product_code)).map((t) => t.id);

    if (disabledIds.length > 0) {
      setTests((prev) =>
        prev.map((t) =>
          disabledIds.includes(t.id) ? { ...t, is_active: false, coach_assignable: false } : t,
        ),
      );
    }

    const disabledCount = result?.disabled_count ?? disabledIds.length;
    const protectedCount = result?.protected_count ?? protectedCodes.size;
    if (disabledCount > 0) toast.success(`${disabledCount} test${disabledCount > 1 ? "s" : ""} disabled`);
    if (protectedCount > 0) toast.info(`${protectedCount} assigned test${protectedCount > 1 ? "s were" : " was"} skipped`);
  }

  async function bulkEnableTests(candidates: LabTest[]) {
    setBusy(true);
    const { data, error } = await supabase.rpc("bulk_enable_lab_tests" as never, {
      _test_ids: candidates.map((t) => t.id),
    } as never);
    setBusy(false);

    if (error) {
      toast.error(error.message ?? "Bulk enable failed");
      return;
    }

    const rows = (data ?? []) as BulkEnableResult[];
    const enabledCount = rows[0]?.enabled_count ?? candidates.length;
    const enabledIds = candidates.map((t) => t.id);

    if (enabledIds.length > 0) {
      setTests((prev) =>
        prev.map((t) => (enabledIds.includes(t.id) ? { ...t, is_active: true } : t)),
      );
      setSelected((prev) => {
        const next = new Set(prev);
        enabledIds.forEach((id) => next.delete(id));
        return next;
      });
    }

    toast.success(`${enabledCount} test${enabledCount > 1 ? "s" : ""} enabled`);
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start justify-between gap-3 w-full lg:w-auto">
          <div>
            <h2 className="text-2xl font-black text-foreground flex items-center gap-2">
              <FlaskConical className="w-6 h-6 text-primary" /> Lab Test Repository
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Full Thyrocare catalog. Enable/disable tests, bulk-manage and choose which ones coaches can assign.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const t = toast.loading("Syncing Thyrocare catalog…");
                try {
                  const { data, error } = await supabase.functions.invoke("thyrocare-api", { body: { action: "sync_catalog" } });
                  if (error) throw error;
                  if ((data as any)?.error) throw new Error((data as any).error);
                  toast.success(`Synced ${(data as any)?.count ?? 0} tests`, { id: t });
                  await load();
                } catch (e: any) {
                  toast.error(e.message || "Sync failed", { id: t });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Sync from Thyrocare
            </Button>
            <ExportCsvButton filename="lab-tests" rows={filtered as any} />
<ImportCsvButton table="thyrocare_tests" onImported={() => window.location.reload()} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Catalog", value: counts.total },
            { label: "Active", value: counts.active },
            { label: "Coach-assignable", value: counts.coach },
          ].map((s) => (
            <div key={s.label} className="liquid-glass rounded-2xl px-4 py-3 min-w-[110px]">
              <div className="inline-flex rounded-full px-2 py-1 text-[10px] font-semibold text-primary bg-primary/10">
                {s.label}
              </div>
              <p className="mt-3 text-2xl font-black text-foreground">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="liquid-glass rounded-2xl p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-bold text-foreground">Default client-facing markup</div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Applied on top of Thyrocare's rate when a test has no per-test override.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={markupDraft}
              onChange={(e) => setMarkupDraft(e.target.value)}
              className="w-28 pr-7 text-right font-bold"
              disabled={savingMarkup}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
          </div>
          <Button
            onClick={handleSaveMarkup}
            disabled={savingMarkup || markupDraft === String(markupPct)}
            size="sm"
          >
            {savingMarkup ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>


      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or code…"
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {(["all", "active", "inactive", "coach"] as FilterTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 rounded-xl px-4 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : t === "active" ? "Active" : t === "inactive" ? "Inactive" : "Coach-assignable"}
            </button>
          ))}
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
        >
          <option value="all">All types</option>
          {productTypes.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            {selectedInactive.length > 0 && (
              <Button variant="default" size="sm" disabled={busy} onClick={openBulkEnable}>
                Enable selected
              </Button>
            )}
            {selectedActive.length > 0 && (
              <Button variant="destructive" size="sm" disabled={busy} onClick={openBulkDisable}>
                Disable selected
              </Button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading lab tests…
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0 z-10">
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3 w-10">
                    <Checkbox
                      checked={filtered.length > 0 && filtered.every((t) => selected.has(t.id))}
                      onCheckedChange={toggleSelectAllVisible}
                    />
                  </th>
                  <th className="px-4 py-3 font-semibold">Test</th>
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold text-right">Client price &amp; markup</th>
                  <th className="px-3 py-3 font-semibold">Fasting</th>
                  <th className="px-3 py-3 font-semibold text-center">Active</th>
                  <th className="px-3 py-3 font-semibold text-center">Coach can assign</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const inUse = isInUse(t);
                  return (
                    <tr key={t.id} className="border-t border-border hover:bg-muted/40">
                      <td className="px-3 py-3">
                        <Checkbox checked={selected.has(t.id)} onCheckedChange={() => toggleSelect(t.id)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground line-clamp-2 flex items-center gap-2">
                          {t.product_name}
                          {inUse && (
                            <span title="Assigned to users by a coach — protected" className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                              <ShieldAlert className="w-3 h-3" /> In use
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setParamsTest(t)}
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
                        >
                          <ListChecks className="w-3 h-3" />
                          View details
                        </button>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground font-mono text-xs">{t.product_code}</td>
                      <td className="px-3 py-3"><span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold">{t.product_type}</span></td>
                      <td className="px-3 py-3 text-right">
                        {(() => {
                          const base = t.offer_rate ?? t.rate;
                          const effPct = effectiveMarkup(t.markup_pct, markupPct);
                          const final = base == null ? null : applyMarkup(base, effPct);
                          const draftVal = rowMarkupDraft[t.id] ?? (t.markup_pct == null ? "" : String(t.markup_pct));
                          const isOverride = t.markup_pct != null;
                          const dirty = (rowMarkupDraft[t.id] ?? null) !== null &&
                            rowMarkupDraft[t.id] !== (t.markup_pct == null ? "" : String(t.markup_pct));
                          return (
                            <div className="flex flex-col items-end gap-1">
                              {final == null ? (
                                <span className="text-muted-foreground">—</span>
                              ) : (
                                <>
                                  <div className="font-semibold">₹{final}</div>
                                  <div className="text-[10px] text-muted-foreground">
                                    base ₹{Number(base).toFixed(0)} · +{effPct}%
                                    {isOverride && <span className="ml-1 text-primary font-semibold">override</span>}
                                  </div>
                                </>
                              )}
                              <div className="flex items-center gap-1 mt-1">
                                <div className="relative">
                                  <Input
                                    type="number"
                                    min={0}
                                    step={1}
                                    inputMode="numeric"
                                    placeholder={`${markupPct}`}
                                    value={draftVal}
                                    onChange={(e) =>
                                      setRowMarkupDraft((prev) => ({ ...prev, [t.id]: e.target.value }))
                                    }
                                    className="w-20 h-7 pr-5 text-right text-xs"
                                    disabled={savingRow === t.id}
                                  />
                                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">%</span>
                                </div>
                                <Button
                                  size="sm"
                                  variant={dirty ? "default" : "outline"}
                                  className="h-7 px-2 text-[11px]"
                                  disabled={savingRow === t.id || !dirty}
                                  onClick={() => saveRowMarkup(t)}
                                >
                                  {savingRow === t.id ? "…" : "Save"}
                                </Button>
                              </div>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        {t.fasting_required ? `${t.fasting_hours ?? 0}h` : "No"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Switch
                          checked={t.is_active}
                          disabled={busy || (t.is_active && inUse)}
                          onCheckedChange={(v) => handleRowToggle(t, "is_active", v)}
                        />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <Switch
                          checked={t.coach_assignable}
                          disabled={busy || !t.is_active}
                          onCheckedChange={(v) => handleRowToggle(t, "coach_assignable", v)}
                        />
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No tests match your filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-destructive" />
              Disable {confirm?.kind === "bulk-disable" ? `${confirm.tests.length + confirm.protected.length} tests` : "this test"}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Disabled tests will no longer appear in the catalog and coaches will not be able to assign them to new users.
                </p>
                {confirm?.kind === "bulk-disable" && confirm.protected.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="font-semibold text-amber-700 mb-1">
                      {confirm.protected.length} test{confirm.protected.length > 1 ? "s" : ""} will be skipped — already assigned to users by a coach:
                    </p>
                    <ul className="text-xs text-amber-800 list-disc pl-5 max-h-32 overflow-y-auto">
                      {confirm.protected.slice(0, 10).map((t) => (
                        <li key={t.id}>{t.product_name}</li>
                      ))}
                      {confirm.protected.length > 10 && <li>+ {confirm.protected.length - 10} more</li>}
                    </ul>
                  </div>
                )}
                {confirm?.kind === "bulk-disable" && (
                  <p>
                    {confirm.tests.length === 0
                      ? "No tests can be disabled in this batch."
                      : `${confirm.tests.length} test${confirm.tests.length > 1 ? "s" : ""} will be disabled.`}
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={confirm?.kind === "bulk-disable" && confirm.tests.length === 0}
              onClick={confirmDisable}
            >
              Confirm disable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LabTestParametersDialog
        open={!!paramsTest}
        onOpenChange={(o) => !o && setParamsTest(null)}
        testId={paramsTest?.id ?? null}
        testName={paramsTest?.product_name ?? null}
        productCode={paramsTest?.product_code ?? null}
      />
    </div>
  );
}
