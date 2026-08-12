import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { toast } from "sonner";

type Row = Record<string, any>;

export function exportToCsv(filename: string, rows: Row[], columns?: string[]) {
  if (!rows || rows.length === 0) {
    toast.error("Nothing to export");
    return;
  }
  const cols = columns ?? Array.from(
    rows.reduce<Set<string>>((set, r) => {
      Object.keys(r ?? {}).forEach((k) => set.add(k));
      return set;
    }, new Set())
  );
  const escape = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => escape(r?.[c])).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast.success(`Exported ${rows.length} rows`);
}

interface Props {
  filename: string;
  rows: Row[] | (() => Row[]);
  columns?: string[];
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary" | "ghost";
  className?: string;
}

export default function ExportCsvButton({
  filename,
  rows,
  columns,
  label = "Export CSV",
  size = "sm",
  variant = "outline",
  className = "",
}: Props) {
  return (
    <Button
      variant={variant}
      size={size}
      className={`shrink-0 w-fit self-start gap-2 ${className}`}
      title={label}
      aria-label={label}
      onClick={() => exportToCsv(filename, typeof rows === "function" ? rows() : rows, columns)}
    >
      <Download className="w-4 h-4 shrink-0" />
      <span>{label}</span>
    </Button>
  );
}
