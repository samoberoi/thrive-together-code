import { useEffect, useMemo, useState } from "react";
import { Loader2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
  testId: string | null;
  testName?: string | null;
  productCode?: string | null;
};

export function LabTestParametersDialog({ open, onOpenChange, testId, testName, productCode }: Props) {
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<Param[]>([]);

  useEffect(() => {
    if (!open || !testId) return;
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
      if (error) {
        setParams([]);
      } else {
        const raw = (data as any)?.raw_data;
        const list: Param[] = Array.isArray(raw?.testsIncluded)
          ? raw.testsIncluded.map((t: any) => ({
              code: String(t.code ?? ""),
              name: String(t.name ?? t.code ?? ""),
              groupName: t.groupName ?? null,
            }))
          : [];
        setParams(list);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, testId]);

  const grouped = useMemo(() => {
    const map = new Map<string, Param[]>();
    params.forEach((p) => {
      const key = p.groupName || "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [params]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[calc(100vw-1.5rem)] max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-hidden flex flex-col p-0 [&>button[type='button']]:top-[calc(env(safe-area-inset-top)+0.75rem)] [&>button[type='button']]:right-3 [&>button[type='button']]:z-10 [&>button[type='button']]:h-9 [&>button[type='button']]:w-9 [&>button[type='button']]:rounded-full [&>button[type='button']]:bg-background [&>button[type='button']]:border [&>button[type='button']]:border-border [&>button[type='button']]:flex [&>button[type='button']]:items-center [&>button[type='button']]:justify-center [&>button[type='button']]:opacity-100 [&>button[type='button']>svg]:h-4 [&>button[type='button']>svg]:w-4"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <DialogHeader className="shrink-0 px-5 pt-4 pb-3 pr-14 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-primary" />
            {testName || "Parameters covered"}
          </DialogTitle>
          <DialogDescription>
            {productCode ? <span className="font-mono">{productCode}</span> : null}
            {params.length > 0 && (
              <span className="ml-2">
                {params.length} parameter{params.length > 1 ? "s" : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading parameters…
            </div>
          ) : params.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No parameter details available for this test.
            </div>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group} className="rounded-xl border border-border overflow-hidden">
                <div className="bg-muted px-3 py-2 text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center justify-between">
                  <span>{group}</span>
                  <span>{items.length}</span>
                </div>
                <ul className="divide-y divide-border">
                  {items.map((p, i) => (
                    <li key={`${p.code}-${i}`} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                      <span className="text-foreground">{p.name}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{p.code}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
