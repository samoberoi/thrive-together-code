import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, FlaskConical, Search } from "lucide-react";
import { createNotification } from "@/lib/notificationService";

interface Test {
  id: string;
  product_code: string;
  product_name: string;
  category: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  coachId: string;
  patientId: string;
  patientName?: string;
  onCreated?: () => void;
}

export default function RecommendTestsDialog({ open, onOpenChange, coachId, patientId, patientName, onCreated }: Props) {
  const { toast } = useToast();
  const [tests, setTests] = useState<Test[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    supabase
      .from("thyrocare_tests")
      .select("id, product_code, product_name, category")
      .eq("is_active", true)
      .eq("coach_assignable", true)
      .order("product_name")
      .limit(200)
      .then(({ data }) => {
        setTests((data ?? []) as Test[]);
        setLoading(false);
      });
  }, [open]);

  // Always show BYE BYE BASIC → PLUS → ADVANCED, then anything else alphabetically
  const testRank = (name: string) => {
    const n = (name || "").toUpperCase();
    if (n.includes("BASIC")) return 0;
    if (n.includes("PLUS")) return 1;
    if (n.includes("ADVANCED") || n.includes("ADVANCE")) return 2;
    return 3;
  };

  const filtered = tests
    .filter((t) => {
      const q = search.toLowerCase();
      return !q || t.product_name.toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => testRank(a.product_name) - testRank(b.product_name) || a.product_name.localeCompare(b.product_name));
  const selectedCodes = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const selectedTests = tests.filter((t) => selected[t.product_code]);

  const submit = async () => {
    if (selectedCodes.length === 0) return toast({ title: "Pick a test", variant: "destructive" });
    try {
      setSaving(true);
      const { data: openRec } = await supabase
        .from("thyrocare_recommendations" as any)
        .select("id")
        .eq("user_id", patientId)
        .in("status", ["pending", "viewed", "booked"])
        .maybeSingle();
      if (openRec) {
        toast({ title: "Test already assigned", description: `${patientName ?? "This patient"} already has an active lab test. Withdraw it before assigning another.`, variant: "destructive" });
        setSaving(false);
        return;
      }
      const { error } = await supabase.from("thyrocare_recommendations" as any).insert({
        coach_id: coachId,
        user_id: patientId,
        test_ids: selectedTests.map((t) => t.id),
        product_codes: selectedCodes,
        notes: note.trim() || null,
      });
      if (error) {
        if ((error as any).code === "23505") throw new Error(`${patientName ?? "This patient"} already has an active lab test. Withdraw it before assigning another.`);
        throw error;
      }


      await createNotification({
        user_id: patientId,
        title: "🧪 Lab tests recommended",
        body: `Your coach recommended ${selectedCodes.length} lab test${selectedCodes.length > 1 ? "s" : ""}. Tap to review.`,
        type: "lab_test",
        icon: "🧪",
        action_url: "/dashboard?tab=profile&section=lab-tests",
      });
      toast({ title: "Tests recommended", description: `${patientName ?? "Patient"} can now order them.` });
      onCreated?.();
      onOpenChange(false);
      setSelected({}); setNote("");
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FlaskConical className="w-4 h-4 text-primary" /> Recommend tests</DialogTitle>
          <DialogDescription>Pick one lab test {patientName ?? "your patient"} should book.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tests…" />
        </div>
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1.5">
          {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto my-8 text-primary" /> :
            filtered.map((t) => (
              <label key={t.id} className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-muted/60 cursor-pointer">
                <Checkbox
                  checked={!!selected[t.product_code]}
                  onCheckedChange={(c) => setSelected(c ? { [t.product_code]: true } : {})}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{t.product_name}</p>
                  <p className="text-xs text-muted-foreground">Free home collection · 10–11 hrs fasting</p>
                </div>
              </label>
            ))}
          {!loading && filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No tests found</p>}
        </div>
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for patient…" />
        <Button onClick={submit} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Send {selectedCodes.length > 0 ? "test" : "recommendation"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
