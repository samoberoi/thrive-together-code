import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onClose: () => void;
  patientUserId: string;
  patientName: string;
  onSaved?: () => void;
}

type Row = Record<string, any>;

export default function PatientProfileEditor({ open, onClose, patientUserId, patientName, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<Row>({});

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", patientUserId)
        .maybeSingle();
      if (error) toast.error(error.message);
      setRow((data as any) ?? {});
      setLoading(false);
    })();
  }, [open, patientUserId]);

  const setField = (k: string, v: any) => setRow((r) => ({ ...r, [k]: v }));
  const setJson = (parent: string, k: string, v: any) =>
    setRow((r) => ({ ...r, [parent]: { ...(r[parent] || {}), [k]: v } }));

  const clinical = row.clinical || {};
  const deep = row.deep_profiling || {};
  const lifestyle = row.lifestyle || {};

  const save = async () => {
    setSaving(true);
    const patch: Row = {
      name: row.name ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      age: row.age != null && row.age !== "" ? Number(row.age) : null,
      gender: row.gender ?? null,
      height: row.height != null && row.height !== "" ? Number(row.height) : null,
      weight: row.weight != null && row.weight !== "" ? Number(row.weight) : null,
      waist: row.waist != null && row.waist !== "" ? Number(row.waist) : null,
      address_line1: row.address_line1 ?? null,
      address_line2: row.address_line2 ?? null,
      city: row.city ?? null,
      state: row.state ?? null,
      pincode: row.pincode ?? null,
      country: row.country ?? null,
      marital_status: row.marital_status ?? null,
      spouse_name: row.spouse_name ?? null,
      clinical: row.clinical || {},
      deep_profiling: row.deep_profiling || {},
      lifestyle: row.lifestyle || {},
    };
    // recompute BMI if height + weight present
    if (patch.height && patch.weight) {
      const h = Number(patch.height) / 100;
      if (h > 0) {
        const bmi = Number((Number(patch.weight) / (h * h)).toFixed(1));
        patch.bmi = bmi;
        patch.bmi_category =
          bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese";
      }
    }
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", patientUserId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    onSaved?.();
    onClose();
  };

  const arrToCsv = (v: any): string => (Array.isArray(v) ? v.join(", ") : v ?? "");
  const csvToArr = (v: string) =>
    v.split(",").map((s) => s.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit profile — {patientName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Personal */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Personal</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Name</Label>
                  <Input value={row.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input value={row.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input value={row.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
                </div>
                <div>
                  <Label>Age</Label>
                  <Input type="number" value={row.age ?? ""} onChange={(e) => setField("age", e.target.value)} />
                </div>
                <div>
                  <Label>Gender</Label>
                  <Select value={row.gender ?? ""} onValueChange={(v) => setField("gender", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Marital status</Label>
                  <Input value={row.marital_status ?? ""} onChange={(e) => setField("marital_status", e.target.value)} />
                </div>
                <div>
                  <Label>Spouse name</Label>
                  <Input value={row.spouse_name ?? ""} onChange={(e) => setField("spouse_name", e.target.value)} />
                </div>
              </div>
            </section>

            {/* Body */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Body</h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Height (cm)</Label>
                  <Input type="number" value={row.height ?? ""} onChange={(e) => setField("height", e.target.value)} />
                </div>
                <div>
                  <Label>Weight (kg)</Label>
                  <Input type="number" value={row.weight ?? ""} onChange={(e) => setField("weight", e.target.value)} />
                </div>
                <div>
                  <Label>Waist (cm)</Label>
                  <Input type="number" value={row.waist ?? ""} onChange={(e) => setField("waist", e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">BMI recalculates automatically from height & weight.</p>
            </section>

            {/* Clinical */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Clinical</h4>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label>Allergies (comma separated)</Label>
                  <Textarea rows={2} value={arrToCsv(clinical.allergies)} onChange={(e) => setJson("clinical", "allergies", csvToArr(e.target.value))} />
                </div>
                <div>
                  <Label>Conditions / diagnoses (comma separated)</Label>
                  <Textarea rows={2} value={arrToCsv(clinical.conditions)} onChange={(e) => setJson("clinical", "conditions", csvToArr(e.target.value))} />
                </div>
                <div>
                  <Label>Medications (comma separated)</Label>
                  <Textarea rows={2} value={arrToCsv(clinical.medications)} onChange={(e) => setJson("clinical", "medications", csvToArr(e.target.value))} />
                </div>
                <div>
                  <Label>Coach notes</Label>
                  <Textarea rows={3} value={clinical.coach_notes ?? ""} onChange={(e) => setJson("clinical", "coach_notes", e.target.value)} />
                </div>
              </div>
            </section>

            {/* Deep profiling */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Metabolic</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>HbA1c (%)</Label>
                  <Input type="number" step="0.1" value={deep.hba1c ?? ""} onChange={(e) => setJson("deep_profiling", "hba1c", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <Label>Fasting glucose (mg/dL)</Label>
                  <Input type="number" value={deep.fasting_glucose ?? ""} onChange={(e) => setJson("deep_profiling", "fasting_glucose", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <Label>BP systolic</Label>
                  <Input type="number" value={deep.bp_systolic ?? ""} onChange={(e) => setJson("deep_profiling", "bp_systolic", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div>
                  <Label>BP diastolic</Label>
                  <Input type="number" value={deep.bp_diastolic ?? ""} onChange={(e) => setJson("deep_profiling", "bp_diastolic", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
              </div>
            </section>

            {/* Lifestyle */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Lifestyle</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Activity level</Label>
                  <Select value={lifestyle.activity_level ?? ""} onValueChange={(v) => setJson("lifestyle", "activity_level", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sedentary">Sedentary</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="moderate">Moderate</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="very_active">Very active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Sleep hours</Label>
                  <Input type="number" step="0.5" value={lifestyle.sleep_hours ?? ""} onChange={(e) => setJson("lifestyle", "sleep_hours", e.target.value === "" ? null : Number(e.target.value))} />
                </div>
                <div className="col-span-2">
                  <Label>Diet preferences</Label>
                  <Input value={lifestyle.diet ?? ""} onChange={(e) => setJson("lifestyle", "diet", e.target.value)} />
                </div>
              </div>
            </section>

            {/* Address */}
            <section className="space-y-3">
              <h4 className="text-sm font-bold text-foreground">Address</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Address line 1</Label>
                  <Input value={row.address_line1 ?? ""} onChange={(e) => setField("address_line1", e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label>Address line 2</Label>
                  <Input value={row.address_line2 ?? ""} onChange={(e) => setField("address_line2", e.target.value)} />
                </div>
                <div><Label>City</Label><Input value={row.city ?? ""} onChange={(e) => setField("city", e.target.value)} /></div>
                <div><Label>State</Label><Input value={row.state ?? ""} onChange={(e) => setField("state", e.target.value)} /></div>
                <div><Label>Pincode</Label><Input value={row.pincode ?? ""} onChange={(e) => setField("pincode", e.target.value)} /></div>
                <div><Label>Country</Label><Input value={row.country ?? ""} onChange={(e) => setField("country", e.target.value)} /></div>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
