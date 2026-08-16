import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onClose: () => void;
  productCodes: string[];
  recommendationId?: string | null;
  onBooked?: () => void;
}

/**
 * Reusable Thyrocare lab-test booking dialog.
 * Handles profile prefill, pincode serviceability, slot loading, and submission.
 */
export default function LabBookingDialog({ open, onClose, productCodes, recommendationId, onBooked }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "", age: "", gender: "Male", mobile: "", email: "",
    pincode: "", address: "", collection_date: "", collection_slot: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [pinChecking, setPinChecking] = useState(false);
  const [pinOk, setPinOk] = useState<boolean | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string | null; available: boolean }[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsSource, setSlotsSource] = useState<string | null>(null);

  // Prefill from profile whenever dialog opens
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const { data: p } = await supabase.from("profiles")
        .select("name, phone, age, gender, birth_date, pincode, address_line1, address_line2, city, state")
        .eq("user_id", user.id).maybeSingle();
      if (!p) {
        setForm((f) => ({ ...f, email: user.email || "" }));
        return;
      }
      let age = (p as any).age ? String((p as any).age) : "";
      if (!age && (p as any).birth_date) {
        const b = new Date((p as any).birth_date);
        if (!isNaN(b.getTime())) {
          const now = new Date();
          let a = now.getFullYear() - b.getFullYear();
          const m = now.getMonth() - b.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
          if (a > 0 && a < 130) age = String(a);
        }
      }
      const g = ((p as any).gender || "").toString().toLowerCase();
      const gender = g.startsWith("f") ? "Female" : g.startsWith("m") ? "Male" : g ? "Other" : "Male";
      const addressParts = [(p as any).address_line1, (p as any).address_line2, (p as any).city, (p as any).state].filter(Boolean);
      const phone = ((p as any).phone || "").replace(/^\+?91/, "").trim();
      setForm((f) => ({
        ...f,
        name: (p as any).name || "",
        mobile: phone || (p as any).phone || "",
        email: user.email || "",
        age,
        gender,
        pincode: (p as any).pincode || "",
        address: addressParts.join(", "),
      }));
      if ((p as any).pincode && /^\d{6}$/.test((p as any).pincode)) {
        void checkPin((p as any).pincode);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  const checkPin = async (pincode: string) => {
    if (!/^\d{6}$/.test(pincode)) { setPinOk(null); setPinChecking(false); return; }
    setPinChecking(true);
    setPinOk(null);
    try {
      const { data } = await supabase.functions.invoke("thyrocare-api", {
        body: { action: "serviceability", pincode },
      });
      setPinOk(!!data?.ok);
    } catch {
      setPinOk(false);
    } finally {
      setPinChecking(false);
    }
  };

  const loadSlots = async (pincode: string, date: string) => {
    if (!/^\d{6}$/.test(pincode) || !date) {
      setSlots([]); setSlotsSource(null); return;
    }
    setSlotsLoading(true);
    try {
      const { data } = await supabase.functions.invoke("thyrocare-api", {
        body: {
          action: "available_slots", pincode, date,
          name: form.name || "Patient",
          age: Number(form.age) || 30,
          gender: form.gender || "Male",
          productCodes,
        },
      });
      const list = (data?.slots || []) as { start: string; end: string | null; available: boolean }[];
      setSlots(list);
      setSlotsSource(data?.source || null);
      setForm((f) => {
        if (!f.collection_slot) return f;
        return list.some((s) => s.start === f.collection_slot && s.available)
          ? f : { ...f, collection_slot: "" };
      });
    } catch {
      setSlots([]); setSlotsSource(null);
    } finally {
      setSlotsLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadSlots(form.pincode, form.collection_date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.pincode, form.collection_date, open]);

  const submitOrder = async () => {
    if (!form.name || !form.mobile || !form.pincode) {
      return toast.error("Name, mobile and pincode are required");
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("thyrocare-api", {
        body: {
          action: "create_order",
          recommendation_id: recommendationId || null,
          beneficiary: { name: form.name, age: Number(form.age) || null, gender: form.gender },
          mobile: form.mobile,
          email: form.email,
          pincode: form.pincode,
          address: form.address,
          collection_date: form.collection_date || null,
          collection_slot: form.collection_slot || null,
          productCodes,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || data?.thyrocare?.message || "Booking failed");
      const orderId = data?.order?.thyrocare_order_id || data?.thyrocare?.orderId || data?.thyrocare?.data?.orderId;

      // Collect payment for the booking before closing. If the member abandons
      // checkout, the backend has already sent them a payment link.
      const bookingRowId = data?.order?.id as string | undefined;
      if (bookingRowId) {
        try {
          await payForService("lab", bookingRowId);
        } catch (payErr: any) {
          toast.error(`${payErr?.message || "Payment not completed"} — we've sent you a payment link.`);
          onBooked?.();
          onClose();
          return;
        }
      }
      toast.success(orderId ? `Paid & booked! Order ID: ${orderId}` : "Order placed! You'll get updates here.");
      onBooked?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Booking failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="!fixed !left-0 !right-0 !top-0 !bottom-0 !flex !h-[100dvh] !max-h-[100dvh] !w-screen !max-w-[100vw] !translate-x-0 !translate-y-0 flex-col gap-0 overflow-hidden overscroll-none rounded-none border-0 p-0 touch-pan-y sm:!left-[50%] sm:!right-auto sm:!top-[50%] sm:!bottom-auto sm:!h-auto sm:!max-h-[90vh] sm:!w-full sm:!max-w-md sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-2xl sm:border sm:p-0 [&>button.absolute]:hidden"
        style={{ margin: 0, overflowX: "hidden" }}>
        <DialogHeader className="relative flex-none border-b bg-background px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.875rem)] text-center sm:pt-5">
          <DialogTitle className="px-12 text-center text-xl leading-tight text-foreground">Book Lab Test</DialogTitle>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close lab booking"
            className="absolute right-3 top-[calc(env(safe-area-inset-top)+0.5rem)] z-20 h-11 w-11 shrink-0 text-foreground hover:bg-muted sm:top-3"
          >
            <X className="h-5 w-5" />
          </Button>
        </DialogHeader>
        <div className="flex-1 w-full min-w-0 space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 [touch-action:pan-y]">
          <div>
            <Label>Patient Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <Label>Age</Label>
              <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
            </div>
            <div className="min-w-0">
              <Label>Gender</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-base"
                value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option>Male</option><option>Female</option><option>Other</option>
              </select>
            </div>
          </div>
          <div>
            <Label>Mobile</Label>
            <Input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
          </div>
          <div>
            <Label>Email (optional)</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Pincode</Label>
            <Input value={form.pincode} inputMode="numeric" maxLength={6} onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setForm({ ...form, pincode: v });
              if (v.length === 6) checkPin(v); else setPinOk(null);
            }} />
            {pinChecking && <p className="text-xs text-muted-foreground mt-1">Checking serviceability…</p>}
            {pinOk === true && <p className="text-xs text-primary mt-1">✓ Sample collection available</p>}
            {pinOk === false && <p className="text-xs text-destructive mt-1">Not serviceable in this pincode</p>}
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div>
            <Label>Collection Date</Label>
            <Input
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={form.collection_date}
              onChange={(e) => setForm({ ...form, collection_date: e.target.value })}
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Available slots</Label>
              {slotsSource === "fallback" && (
                <span className="text-[10px] text-muted-foreground">Standard times</span>
              )}
            </div>
            {!form.pincode || !form.collection_date ? (
              <p className="text-xs text-muted-foreground mt-1">
                Enter pincode and pick a date to see available slots.
              </p>
            ) : slotsLoading ? (
              <p className="text-xs text-muted-foreground mt-1">Loading slots…</p>
            ) : slots.length === 0 ? (
              <p className="text-xs text-destructive mt-1">No slots available for this date.</p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {slots.map((s) => {
                  const selected = form.collection_slot === s.start;
                  const disabled = !s.available;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      disabled={disabled}
                      onClick={() => setForm({ ...form, collection_slot: s.start })}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : disabled
                            ? "bg-muted text-muted-foreground/50 border-border line-through cursor-not-allowed"
                            : "bg-background text-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {s.start}{s.end ? `–${s.end}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DialogFooter className="flex-none border-t bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:pb-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submitOrder} disabled={submitting || pinOk === false || !form.collection_slot}>
            {submitting ? "Booking…" : "Confirm Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
