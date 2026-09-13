import TodayStepsCard from "@/components/TodayStepsCard";
import AppleHealthSnapshotCard from "@/components/AppleHealthSnapshotCard";
import { COACH_MIN_DAILY_STEPS } from "@/lib/movementUserService";

/** Super Admin's own movement view — identical to the coach "My Movement" tab. */
export default function AdminMyMovement() {
  return (
    <div className="space-y-4">
      <TodayStepsCard minTargetSteps={COACH_MIN_DAILY_STEPS} allowManualEdit />
      <AppleHealthSnapshotCard />
    </div>
  );
}
