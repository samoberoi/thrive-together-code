import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { importCsvToTable, type ImportResult } from "@/lib/csvIo";

interface Props {
  /** Supabase table to upsert into. */
  table: string;
  /** Primary key column to upsert by. Default `id`. */
  pk?: string;
  /** Button label. */
  label?: string;
  size?: "sm" | "default" | "lg";
  variant?: "outline" | "default" | "secondary" | "ghost";
  className?: string;
  /** Called after a successful import so the page can refresh. */
  onImported?: (result: ImportResult) => void;
  /** Confirm dialog before running. Default true. */
  confirmFirst?: boolean;
}

export default function ImportCsvButton({
  table,
  pk = "id",
  label = "Import CSV",
  size = "sm",
  variant = "outline",
  className = "",
  onImported,
  confirmFirst = true,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (confirmFirst) {
      const ok = window.confirm(
        `Import CSV into "${table}"?\n\nRows with an existing ${pk} will be updated. Rows without ${pk} will be inserted.`
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const res = await importCsvToTable(table, text, { pk });
      const parts = [
        `${res.updated} updated`,
        `${res.inserted} inserted`,
        res.failed ? `${res.failed} failed` : null,
      ].filter(Boolean).join(" · ");
      if (res.failed) {
        toast.error(`Imported with errors: ${parts}`, {
          description: res.errors.slice(0, 2).join(" | "),
        });
      } else {
        toast.success(`Imported ${res.total} rows — ${parts}`);
      }
      onImported?.(res);
    } catch (e: any) {
      toast.error(e?.message || "Import failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      <Button
        variant={variant}
        size={size}
        className={`shrink-0 w-fit self-start gap-2 ${className}`}
        title={label}
        aria-label={label}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> : <Upload className="w-4 h-4 shrink-0" />}
        <span>{busy ? "Importing…" : label}</span>
      </Button>
    </>
  );
}
