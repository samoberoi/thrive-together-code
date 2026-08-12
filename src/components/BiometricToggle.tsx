import { useEffect, useState } from "react";
import { BadgeCheck, LockKeyhole, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  authenticateWithBiometrics,
  getBiometricDiagnostics,
  getBiometryLabel,
  isNative,
  setBiometricEnabled,
  supportsBiometricGate,
  type BiometricDiagnostics,
} from "@/lib/biometric";

/**
 * Face ID / Touch ID unlock toggle.
 *
 * Visible on any native (iOS/Android) build. If the device doesn't support
 * biometrics (e.g. iOS simulator, no Face ID enrolled), the switch is disabled
 * and a helper line explains why — we never silently hide it, so the user
 * always knows the feature exists.
 */
export default function BiometricToggle() {
  const native = isNative();
  const biometricGateSupported = supportsBiometricGate();
  const [supported, setSupported] = useState(false);
  const [checking, setChecking] = useState(native);
  const [testing, setTesting] = useState(false);
  const [label, setLabel] = useState("Face ID / Touch ID");
  const [diagnostics, setDiagnostics] = useState<BiometricDiagnostics | null>(null);

  useEffect(() => {
    if (!biometricGateSupported) {
      setChecking(false);
      return;
    }
    void (async () => {
      try {
        const nextDiagnostics = await getBiometricDiagnostics();
        setDiagnostics(nextDiagnostics);
        setSupported(nextDiagnostics.available);
        setLabel(nextDiagnostics.label || (await getBiometryLabel()));
      } catch {
        setSupported(false);
      } finally {
        setChecking(false);
      }
    })();
  }, [biometricGateSupported]);

  const handleTest = async () => {
    if (!biometricGateSupported) {
      toast({
        title: native ? "Android app lock is unavailable" : "Biometric unlock is native only",
        description: native
          ? "Android app lock is temporarily disabled for launch stability."
          : "Open the installed mobile app to use biometric unlock.",
      });
      return;
    }
    setTesting(true);
    const ok = await authenticateWithBiometrics(`Confirm ${label} for bye bye diabetes`);
    setTesting(false);
    if (!ok) {
      toast({
        title: `${label} not verified`,
        description: "Please try again.",
      });
      return;
    }
    setSupported(true);
    setBiometricEnabled(true);
    toast({ title: `${label} is active`, description: "You'll be asked to unlock whenever the app opens." });
  };

  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-card border border-border">
      <div className="w-10 h-10 shrink-0 rounded-2xl bg-primary/10 flex items-center justify-center">
        {native ? <BadgeCheck className="w-5 h-5 text-primary" /> : <LockKeyhole className="w-5 h-5 text-primary" />}
      </div>
      <div className="pr-3 flex-1 min-w-0">
        <div className="text-sm font-semibold">Unlock with {label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {!native
            ? "Available in the installed mobile app."
            : !biometricGateSupported
              ? "Temporarily disabled on Android for launch stability."
            : checking
            ? "Checking device support…"
            : supported
              ? `${label} is required automatically whenever the app opens.`
              : `Required automatically. If ${label} is unavailable, your device passcode can be used.`}
        </div>
        {native && diagnostics && (
          <div className="mt-2 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            Status: {diagnostics.available ? "available" : diagnostics.code || "unavailable"}
            {diagnostics.reason ? ` — ${diagnostics.reason}` : ""}
          </div>
        )}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleTest}
        disabled={!biometricGateSupported || checking || testing}
        className="shrink-0 rounded-full px-4"
      >
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
      </Button>
    </div>
  );
}
