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

  const labelClass = "text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 max-h-[92dvh] flex flex-col overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="text-base font-black leading-tight">
            Schedule meeting{patientName ? ` with ${patientName}` : ""}
          </DialogTitle>
          <DialogDescription className="flex items-start gap-1.5 text-xs mt-1">
            <Phone className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Pick a time — WhatsApp video call. Both parties get a Call Now button at the start time.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {showPicker && (
            <div>
              <Label className={labelClass}><User className="w-3.5 h-3.5" /> Patient</Label>
              <Select value={selectedPatient} onValueChange={setSelectedPatient}>
                <SelectTrigger className="h-11"><SelectValue placeholder="Select a patient…" /></SelectTrigger>
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
            <div className="min-w-0">
              <Label className={labelClass}><CalendarIcon className="w-3.5 h-3.5" /> Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 w-full" />
            </div>
            <div className="min-w-0">
              <Label className={labelClass}><Clock className="w-3.5 h-3.5" /> Time</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-11 w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="min-w-0">
              <Label className={labelClass}><Timer className="w-3.5 h-3.5" /> Duration (min)</Label>
              <Input type="number" min={10} max={180} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="h-11 w-full" />
            </div>
            <div className="min-w-0">
              <Label className={labelClass}><Tag className="w-3.5 h-3.5" /> Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as MeetingType)}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
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
          <div className="rounded-xl bg-primary/5 border border-primary/10 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
            <Phone className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            <span>WhatsApp video call — no link needed. The patient's app will show a Call Now button 5 min before the scheduled time.</span>
          </div>
          <div>
            <Label className={labelClass}><FileText className="w-3.5 h-3.5" /> Agenda (optional)</Label>
            <Textarea rows={3} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="What you'll cover…" />
          </div>
        </div>

        <div
          className="px-5 py-3 border-t bg-background"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <Button onClick={handleSubmit} disabled={saving} className="w-full h-11">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Schedule meeting
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
