import { useEffect } from "react";
import { createPortal } from "react-dom";
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
 * Renders full-screen (not a cramped centered dialog) so the
 * EditProfile UI has room to breathe on every device.
 */
export default function PatientProfileEditor({ open, onClose, patientUserId, patientName, onSaved }: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 bg-background overflow-y-auto overscroll-contain"
      style={{ zIndex: 10000 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="mx-auto w-full max-w-[720px] min-h-full">
        <EditProfile
          coachMode
          targetUserId={patientUserId}
          targetName={patientName}
          onBack={onClose}
          onSaved={onSaved}
        />
      </div>
    </div>,
    document.body,
  );
}
