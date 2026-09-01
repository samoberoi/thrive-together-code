import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, CreditCard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Escape hatch for the post-login setup flow.
 *
 * A user whose profile has a name but no active package is routed straight to
 * `/setup/purpose` on every cold launch. Without these controls there is no way
 * back to phone entry (to use a different number) or forward to the plans page,
 * which trapped users in a relaunch loop on iOS.
 */
export default function SetupEscapeBar() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-2 pb-3">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="no-pill inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground active:scale-95 transition-transform"
        >
          <LogOut className="h-4 w-4" />
          Use another number
        </button>
        <button
          type="button"
          onClick={() => navigate("/plans")}
          className="no-pill inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground active:scale-95 transition-transform"
        >
          <CreditCard className="h-4 w-4" />
          I have a package
        </button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out and start over?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll go back to the phone number screen and can log in with any number. Your saved details stay on your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                await signOut();
                navigate("/auth", { replace: true });
              }}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
