import { useCallback, useEffect, useState } from "react";
import { Upload, FileText, ExternalLink, Trash2, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import ExternalTestDialog from "@/components/lab/ExternalTestDialog";
import {
  fetchExternalReportsForUser,
  externalReportUrl,
  deleteExternalReport,
  parseExternalReport,
  type ExternalLabReport,
} from "@/lib/externalLabService";

interface Props {
  userId: string;
  /** Coach/admin uploading for someone else passes their own auth id. */
  uploadedBy?: string | null;
  /** Called after an upload / delete so parent screens can refresh markers. */
  onChanged?: () => void;
  compact?: boolean;
}

function statusLabel(status: string) {
  if (status === "reviewed") return "Values added to markers";
  if (status === "processing") return "Reading values…";
  if (status === "parse_failed") return "Could not read values";
  return "Uploaded";
}

function reportDate(r: ExternalLabReport) {
  const iso = r.collected_on || r.created_at;
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

/**
 * Standalone "upload an old lab report" surface — no booking or coach
 * recommendation required. Every upload is kept, so the patient builds a
 * dated history; values are read into lab_results automatically.
 */
export default function PastReportsCard({ userId, uploadedBy, onChanged, compact = false }: Props) {
  const isStaff = !!uploadedBy && uploadedBy !== userId;
  const [rows, setRows] = useState<ExternalLabReport[]>([]);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await fetchExternalReportsForUser(userId);
    setRows(all.filter((r) => !r.recommendation_id));
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  const openReport = async (r: ExternalLabReport) => {
    const url = await externalReportUrl(r.file_path);
    if (!url) { toast.error("Couldn't open the report"); return; }
    window.open(url, "_blank", "noopener");
  };

  const retry = async (r: ExternalLabReport) => {
    setBusyId(r.id);
    try {
      const count = await parseExternalReport(r.id);
      toast.success(`${count} markers read from this report`);
      await load();
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Still couldn't read this report");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: ExternalLabReport) => {
    try {
      await deleteExternalReport(r);
      setRows((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Report removed");
      onChanged?.();
    } catch (e: any) {
      toast.error(e.message || "Couldn't remove this report");
    }
  };

  return (
    <div className={`liquid-glass rounded-2xl ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div className="flex items-start gap-2">
        <History className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black leading-tight">
            {isStaff ? "Upload a past report for this patient" : "Have an older lab report?"}
          </p>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            No booking needed. Upload any earlier report — we read the values, keep the report date, and add it to
            the markers, body map and trends.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl bg-muted/40 ring-1 ring-border p-2.5">
              <FileText className="w-4 h-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold truncate">
                  {reportDate(r)}{r.lab_name ? ` · ${r.lab_name}` : ""}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {statusLabel(r.status)}{r.file_name ? ` · ${r.file_name}` : ""}
                </p>
              </div>
              {r.status === "parse_failed" && (
                <Button variant="ghost" size="sm" className="h-8 text-[10px] px-2" disabled={busyId === r.id} onClick={() => retry(r)}>
                  {busyId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Retry"}
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReport(r)} aria-label="Open report">
                <ExternalLink className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(r)} aria-label="Remove report">
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" size="sm" className="w-full h-9 text-xs font-bold rounded-full" onClick={() => setOpen(true)}>
        <Upload className="w-3.5 h-3.5 mr-1.5" />
        {rows.length > 0 ? "Upload another report" : "Upload report"}
      </Button>

      {open && (
        <ExternalTestDialog
          open
          onClose={() => setOpen(false)}
          userId={userId}
          recommendationId={null}
          productCodes={[]}
          startAtUpload
          uploadedBy={uploadedBy ?? userId}
          onDone={async () => { await load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
