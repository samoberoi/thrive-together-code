import { Dialog, DialogContent } from "@/components/ui/dialog";
import EditProfile from "@/components/EditProfile";

interface Props {
  open: boolean;
  onClose: () => void;
  patientUserId: string;
  patientName: string;
  onSaved?: () => void;
}

/**
 * Coach-facing patient profile editor.
 * Renders the exact same UI as the end-user Edit Profile screen,
 * but targets the selected patient and requires a confirmation
 * before overriding their data.
 */
export default function PatientProfileEditor({ open, onClose, patientUserId, patientName, onSaved }: Props) {
  if (!open) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="p-0 gap-0 max-w-[560px] w-full sm:w-[560px] h-[92vh] max-h-[92vh] overflow-hidden"
        hideDefaultCloseButton
      >
        <EditProfile
          coachMode
          targetUserId={patientUserId}
          targetName={patientName}
          onBack={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}
