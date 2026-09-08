import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Shared filter widgets used by the super-admin user list and the coach client list. */

export interface RiskMeta {
  label: string;
  icon: React.ReactNode;
  tone: "red" | "amber" | "blue" | "muted";
}

export function RiskChip({
  meta,
  count,
  active,
  onClick,
}: {
  meta: RiskMeta;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  const tones = {
    red: "text-rose-600 bg-rose-500/10 ring-rose-500/40",
    amber: "text-amber-600 bg-amber-500/10 ring-amber-500/40",
    blue: "text-primary bg-primary/10 ring-primary/40",
    muted: "text-muted-foreground bg-muted ring-border",
  } as const;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
        tones[meta.tone]
      } ${active ? "ring-2" : "ring-1 ring-transparent hover:brightness-105"}`}
    >
      {meta.icon}
      <span>{meta.label}</span>
      <span className="tabular-nums opacity-80">{count}</span>
    </button>
  );
}

export function FilterSelect({
  icon,
  value,
  onChange,
  options,
  placeholder,
}: {
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full [&>span]:truncate">
        <div className="flex items-center gap-2 min-w-0 overflow-hidden whitespace-nowrap [&>span]:truncate">
          {icon}
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50 max-h-72">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FlagTag({ label, tone }: { label: string; tone: "red" | "amber" }) {
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
        tone === "red" ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"
      }`}
    >
      {label}
    </span>
  );
}

export function StatCard({
  label,
  value,
  icon,
  tone,
  isActive,
  onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "primary" | "amber" | "blue" | "emerald" | "purple";
  isActive?: boolean;
  onClick?: () => void;
}) {
  const toneClasses = {
    primary: "bg-primary/10 text-primary ring-primary/30",
    amber: "bg-amber-500/10 text-amber-600 ring-amber-500/30",
    blue: "bg-blue-500/10 text-blue-600 ring-blue-500/30",
    emerald: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30",
    purple: "bg-purple-500/10 text-purple-600 ring-purple-500/30",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`liquid-glass text-left p-3 sm:p-4 rounded-xl transition-all ${
        onClick ? "cursor-pointer hover:brightness-105 active:scale-[0.98]" : "cursor-default"
      } ${isActive ? `ring-2 ${toneClasses[tone].split(" ").pop()}` : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p className="text-2xl sm:text-3xl font-black text-foreground mt-1">{value}</p>
        </div>
        <div className={`rounded-lg p-2 ${toneClasses[tone].split(" ").slice(0, 2).join(" ")}`}>{icon}</div>
      </div>
    </button>
  );
}
