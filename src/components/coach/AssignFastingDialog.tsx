import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Timer, Check } from "lucide-react";
import {
  fetchProtocols,
  fetchUserProtocol,
  assignProtocolToUser,
  updateUserProtocolStatus,
  type FastingProtocol,
  type UserProtocol,
} from "@/lib/fastingService";
import { createNotification } from "@/lib/notificationService";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  coachId: string;
  patientId: string;
  patientName?: string;
  onCreated?: () => void;
}

const rank = (p: FastingProtocol) => {
  const n = (p.protocol_name || "").toUpperCase();
  if (n.includes("BASIC")) return 0;
  if (n.includes("MOMENTUM")) return 1;
  if (n.includes("PEAK")) return 2;
  return 3;
};

export default function AssignFastingDialog({ open, onOpenChange, coachId, patientId, patientName, onCreated }: Props) {
  const { toast } = useToast();
  const [protocols, setProtocols] = useState<FastingProtocol[]>([]);
  const [current, setCurrent] = useState<UserProtocol | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSelectedId("");
    setStartDate(new Date().toISOString().split("T")[0]);
    Promise.all([fetchProtocols(), fetchUserProtocol(patientId)])
      .then(([ps, up]) => {
        setProtocols((ps || []).filter((p) => p.is_active).sort((a, b) => rank(a) - rank(b)));
        setCurrent(up);
      })
      .catch((e: any) => toast({ title: "Failed to load protocols", description: e.message, variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [open, patientId]);

  const submit = async () => {
    if (!selectedId) return toast({ title: "Pick a protocol", variant: "destructive" });
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (current) await updateUserProtocolStatus(current.id, "completed");
      await assignProtocolToUser(patientId, selectedId, coachId, startDate);
      const proto = protocols.find((p) => p.id === selectedId);
      await createNotification({
        user_id: patientId,
        title: "⏳ Fasting protocol assigned",
        body: `Your coach assigned you the ${proto?.protocol_name ?? "fasting"} protocol. Tap to start.`,
        type: "fasting",
        icon: "⏳",
        action_url: "/dashboard?tab=fasting",
      });
      toast({ title: "Fasting protocol assigned", description: `${patientName ?? "Patient"} can start now.` });
      onCreated?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(b) => { if (!saving) onOpenChange(b); }}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Timer className="w-4 h-4 text-primary" /> Assign fasting</DialogTitle>
          <DialogDescription>Pick the fasting protocol {patientName ?? "your patient"} should follow.</DialogDescription>
        </DialogHeader>

        {current && (
          <p className="text-xs text-muted-foreground rounded-lg bg-muted/60 px-3 py-2">
            Currently on a protocol since {new Date(current.start_date).toLocaleDateString()} — assigning a new one will replace it.
          </p>
        )}

        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1.5">
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin mx-auto my-8 text-primary" />
          ) : protocols.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No active protocols</p>
          ) : (
            protocols.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                  selectedId === p.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/60"
                }`}
              >
                <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center ${selectedId === p.id ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                  {selectedId === p.id && <Check className="w-3 h-3 text-primary-foreground" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{p.protocol_name}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{p.total_weeks} weeks</span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground">Start date</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>

        <Button onClick={submit} disabled={saving || !selectedId} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {saving ? "Assigning…" : "Assign protocol"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
