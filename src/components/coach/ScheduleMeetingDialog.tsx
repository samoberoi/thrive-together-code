import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { scheduleMeeting, type MeetingType } from "@/lib/meetingService";
import { Loader2, Phone, Calendar as CalendarIcon, Clock, Timer, Tag, FileText, User } from "lucide-react";

export interface PatientOption {
  user_id: string;
  name: string | null;
  phone?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  coachId: string;
  patientId?: string;
  patientName?: string;
  patients?: PatientOption[];
  defaultType?: MeetingType;
  onScheduled?: () => void;
}

export default function ScheduleMeetingDialog({
  open, onOpenChange, coachId, patientId, patientName, patients, defaultType = "followup", onScheduled,
}: Props) {
  const { toast } = useToast();
  const [selectedPatient, setSelectedPatient] = useState<string>(patientId ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  // meeting_link removed — meetings are WhatsApp video calls
  const [type, setType] = useState<MeetingType>(defaultType);
  const [agenda, setAgenda] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSelectedPatient(patientId ?? "");
  }, [open, patientId]);

  const showPicker = !patientId && Array.isArray(patients);

  const handleSubmit = async () => {
    if (!selectedPatient) return toast({ title: "Select a patient", variant: "destructive" });
    if (!date) return toast({ title: "Pick a date", variant: "destructive" });
    try {
      setSaving(true);
      const scheduled_at = new Date(`${date}T${time}:00`).toISOString();
      await scheduleMeeting({
        coach_id: coachId,
        user_id: selectedPatient,
        scheduled_at,
        duration_min: duration,
        meeting_link: null,
        meeting_type: type,
        agenda: agenda || null,
      });
      const targetName = patientName ?? patients?.find((p) => p.user_id === selectedPatient)?.name ?? "Patient";
      toast({ title: "Meeting scheduled", description: `${targetName} will get a WhatsApp video Call Now button at the start time.` });
      onScheduled?.();
      onOpenChange(false);
      setDate(""); setAgenda("");
    } catch (e: any) {
      toast({ title: "Could not schedule", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule meeting{patientName ? ` with ${patientName}` : ""}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> Just pick a time — this will be a WhatsApp video call. Both parties get a Call Now button at the start time.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {showPicker && (
            <div>
              <Label>Patient</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger><SelectValue placeholder="Select a patient…" /></SelectTrigger>
                <SelectContent>
                  {(patients ?? []).map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>
                      {p.name ?? "Unnamed"}{p.phone ? ` · ${p.phone}` : ""}
                    </SelectItem>
                  ))}
                  {(patients ?? []).length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">No assigned patients</div>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Duration (min)</Label>
              <Input type="number" min={10} max={180} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="weekly_checkpoint">Weekly checkpoint</SelectItem>
                  <SelectItem value="quarterly_review">Quarterly review</SelectItem>
                  <SelectItem value="consultation">Consultation</SelectItem>
                  <SelectItem value="followup">Follow-up</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl bg-primary/5 border border-primary/10 px-3 py-2 text-xs text-muted-foreground flex items-center gap-2">
            <Phone className="w-3.5 h-3.5 text-primary" />
            WhatsApp video call — no link needed. The patient's app will show a Call Now button 5 min before the scheduled time.
          </div>
          <div>
            <Label>Agenda (optional)</Label>
            <Textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="What you'll cover…" />
          </div>
          <Button onClick={handleSubmit} disabled={saving} className="w-full">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Schedule meeting
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
