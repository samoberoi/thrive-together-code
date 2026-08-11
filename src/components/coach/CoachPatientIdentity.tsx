import { ReactNode } from "react";

interface Props {
  name?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  /** Small meta line rendered under the phone (plan, streak, etc.) */
  meta?: ReactNode;
  /** Badges / status chips rendered on their own row under the identity */
  badges?: ReactNode;
  /** Action buttons rendered on the same row as badges, aligned right */
  actions?: ReactNode;
  size?: "sm" | "md";
}

/**
 * Shared coach-side patient identity block.
 * Guarantees the FULL name and FULL phone number are always visible
 * (wrapping instead of truncating), with badges/actions on a second row.
 */
export default function CoachPatientIdentity({
  name,
  phone,
  avatarUrl,
  meta,
  badges,
  actions,
  size = "md",
}: Props) {
  const av = size === "sm" ? "w-10 h-10" : "w-11 h-11";
  const initial = (name ?? "?").trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="w-full min-w-0 space-y-2.5">
      <div className="flex items-start gap-3 min-w-0">
        <div className={`${av} rounded-2xl bg-primary/10 flex items-center justify-center overflow-hidden shrink-0`}>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className={`${av} rounded-2xl object-cover`} />
          ) : (
            <span className="text-primary font-bold text-sm">{initial}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-foreground text-[15px] leading-snug break-words">
            {name?.trim() || "Unnamed"}
          </h3>
          <p className="text-xs text-muted-foreground font-medium tabular-nums break-all">
            {phone?.trim() || "No phone"}
          </p>
          {meta ? <div className="text-[11px] text-muted-foreground mt-0.5">{meta}</div> : null}
        </div>
      </div>

      {(badges || actions) && (
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">{badges}</div>
          {actions ? <div className="flex items-center gap-2 shrink-0 ml-auto">{actions}</div> : null}
        </div>
      )}
    </div>
  );
}
