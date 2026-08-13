import { useEffect, useMemo, useState } from "react";
import { Loader2, Clock, Home, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import BbdoWordmark from "@/components/BbdoWordmark";
import thyrocareLogo from "@/assets/thyrocare-logo.svg";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Param = { code: string; name: string; groupName?: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId?: string | null;
  testName?: string | null;
  productCode?: string | null;
  /** Optional raw_data payload if the caller already has it (skips the fetch) */
  rawData?: any;
};

function parseParams(raw: any): Param[] {
  return Array.isArray(raw?.testsIncluded)
    ? raw.testsIncluded.map((t: any) => ({
        code: String(t.code ?? ""),
        name: String(t.name ?? t.code ?? ""),
        groupName: t.groupName ?? null,
      }))
    : [];
}

export function LabTestParametersDialog({ open, onOpenChange, testId, testName, productCode, rawData }: Props) {
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<Param[]>([]);

  useEffect(() => {
    if (!open) return;
    if (rawData) {
      setParams(parseParams(rawData));
      setLoading(false);
      return;
    }
    if (!testId) return;
    let active = true;
    setLoading(true);
    setParams([]);
    (async () => {
      const { data, error } = await supabase
        .from("thyrocare_tests")
        .select("raw_data")
        .eq("id", testId)
        .maybeSingle();
      if (!active) return;
      setParams(error ? [] : parseParams((data as any)?.raw_data));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, testId, rawData]);

  const grouped = useMemo(() => {
    const map = new Map<string, Param[]>();
    params.forEach((p) => {
      const key = p.groupName || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [params]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col p-0 gap-0 border-0 [&>button[type='button']]:top-[calc(env(safe-area-inset-top)+0.75rem)] [&>button[type='button']]:right-3 [&>button[type='button']]:z-20 [&>button[type='button']]:h-9 [&>button[type='button']]:w-9 [&>button[type='button']]:rounded-full [&>button[type='button']]:bg-background/90 [&>button[type='button']]:border [&>button[type='button']]:border-border [&>button[type='button']]:flex [&>button[type='button']]:items-center [&>button[type='button']]:justify-center [&>button[type='button']]:opacity-100 [&>button[type='button']>svg]:h-4 [&>button[type='button']>svg]:w-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        {/* Branded masthead */}
        <DialogHeader className="shrink-0 space-y-0 text-left px-5 sm:px-7 pt-5 pb-5 pr-14 bg-gradient-to-br from-muted/70 via-background to-background border-b border-border">
          <div className="flex items-center gap-3 sm:gap-4">
            <BbdoWordmark className="text-lg sm:text-xl leading-none" />
            <span className="h-6 w-px bg-border" />
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground hidden sm:inline">
                In association with
              </span>
              <img src={thyrocareLogo} alt="Thyrocare" className="h-5 sm:h-6 w-auto object-contain" />
            </div>
          </div>

          <DialogTitle className="pt-4 text-2xl sm:text-4xl font-black tracking-tight uppercase leading-[1.05] text-foreground">
            {testName || "Test details"}
          </DialogTitle>

          <DialogDescription asChild>
            <div className="pt-3 flex flex-wrap items-center gap-2">
              {params.length > 0 && (
                <span
                  className="inline-flex items-center rounded-md px-3 py-1 text-sm font-black tracking-wide text-primary-foreground"
                  style={{ background: "var(--bbdo-blue)" }}
                >
                  {params.length} PARAMETERS
                </span>
              )}
              {productCode && (
                <span className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[11px] text-muted-foreground">
                  {productCode}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <Home className="w-3 h-3" /> Free home collection
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                <ShieldCheck className="w-3 h-3" /> NABL accredited labs
              </span>
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* Parameter panels */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-7 pt-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading parameters…
            </div>
          ) : params.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Parameter details for this test will appear here once published.
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 [column-fill:_balance]">
              {grouped.map(([group, items]) => (
                <section key={group} className="mb-4 break-inside-avoid rounded-xl border border-border bg-card/60 p-3.5">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ background: "var(--bbdo-red)" }}
                    />
                    <h3 className="text-sm font-extrabold text-foreground leading-snug">
                      {group}{" "}
                      <span className="font-bold text-muted-foreground">({items.length})</span>
                    </h3>
                  </div>
                  <ul className="space-y-1 pl-4">
                    {items.map((p, i) => (
                      <li key={`${p.code}-${i}`} className="text-[13px] leading-snug text-muted-foreground">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Footer note */}
        <div className="shrink-0 border-t border-border bg-muted/50 px-5 sm:px-7 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
          <p className="flex items-center gap-2 text-[11px] sm:text-xs italic text-muted-foreground">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            10–12 hrs fasting is essential · eGFR applicable above 18 years of age
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
