import { useState } from "react";
import { LucideIcon, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** Label for the management (catalog / admin) view. */
  manageLabel?: string;
  /** Label for the admin's own tracking view, e.g. "My Supplements". */
  mineLabel: string;
  mineIcon?: LucideIcon;
  manage: React.ReactNode;
  mine: React.ReactNode;
}

/**
 * Super Admins track their own health exactly like coaches do. This wrapper
 * puts a "Manage" / "Mine" switch on top of any admin module so the admin can
 * flip between running the catalog and using it themselves.
 */
export default function AdminSelfTabs({
  manageLabel = "Manage",
  mineLabel,
  mineIcon: MineIcon,
  manage,
  mine,
}: Props) {
  const [view, setView] = useState<"manage" | "mine">("manage");

  const Tab = ({
    id,
    label,
    Icon,
  }: {
    id: "manage" | "mine";
    label: string;
    Icon?: LucideIcon;
  }) => (
    <button
      onClick={() => setView(id)}
      className={cn(
        "shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-[13px] font-semibold whitespace-nowrap transition-colors",
        view === id
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {Icon ? <Icon className="w-4 h-4" strokeWidth={1.9} /> : null}
      {label}
    </button>
  );

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 px-3 sm:px-6 pt-3 pb-1 overflow-x-auto no-scrollbar">
        <Tab id="manage" label={manageLabel} Icon={Settings2} />
        <Tab id="mine" label={mineLabel} Icon={MineIcon} />
      </div>
      <div hidden={view !== "manage"}>{manage}</div>
      {view === "mine" ? <div className="pb-6">{mine}</div> : null}
    </div>
  );
}
