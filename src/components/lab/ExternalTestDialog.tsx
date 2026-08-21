import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, FileText, ExternalLink, Trash2, CheckCircle2, Home } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  markExternalIntent,
  uploadExternalReport,
  fetchExternalReportsForUser,
  externalReportUrl,
  deleteExternalReport,
  type ExternalLabReport,
} from "@/lib/externalLabService";

const MAX_MB = 15;

interface Props {
  open: boolean;
  onClose: () => void;
  userId: string;
  recommendationId: string | null;
  productCodes: string[];
  /** Skip the intent step (already told the coach) and go straight to upload. */
  startAtUpload?: boolean;
  /** Who is uploading — defaults to the patient. Coaches pass their own auth id. */
  uploadedBy?: string | null;
  onDone?: () => void;
}

export default function ExternalTestDialog({
  open, onClose, userId, recommendationId, productCodes, startAtUpload = false, uploadedBy, onDone,
}: Props) {
  const isCoach = !!uploadedBy && uploadedBy !== userId;
  const [step, setStep] = useState<"intent" | "upload">(startAtUpload ? "upload" : "intent");
  const [note, setNote] = useState("");
  const [labName, setLabName] = useState("");
  const [collectedOn, setCollectedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState<ExternalLabReport[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setStep(startAtUpload ? "upload" : "intent");
    fetchExternalReportsForUser(userId).then((rows) =>
      setMine(rows.filter((r) => (recommendationId ? r.recommendation_id === recommendationId : !r.recommendation_id))),
    );

  }, [open, startAtUpload, userId, recommendationId]);

  async function confirmIntent() {
    if (!recommendationId) { setStep("upload"); return; }
    setBusy(true);
    try {
      await markExternalIntent(recommendationId, note);
      toast.success("Your coach has been informed");
      setStep("upload");
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Couldn't update. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload() {
    if (!file) { toast.error("Choose your report file first"); return; }
    if (file.size > MAX_MB * 1024 * 1024) { toast.error(`File must be under ${MAX_MB} MB`); return; }
    setBusy(true);
    try {
      const row = await uploadExternalReport({
        userId,
        file,
        recommendationId,
        productCodes,
        labName,
        collectedOn,
        uploadedBy: uploadedBy ?? userId,
      });
      setMine((prev) => [row, ...prev]);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success(`Report processed — ${isCoach ? "client markers" : "your markers"} are now visible`);
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function openReport(r: ExternalLabReport) {
    const url = await externalReportUrl(r.file_path);
    if (!url) { toast.error("Couldn't open the file"); return; }
    window.open(url, "_blank", "noopener");
  }

  async function removeReport(r: ExternalLabReport) {
    try {
      await deleteExternalReport(r);
      setMine((prev) => prev.filter((x) => x.id !== r.id));
      toast.success("Report removed");
      onDone?.();
    } catch (e: any) {
      toast.error(e.message || "Couldn't remove");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="w-5 h-5 text-primary" />
            {step === "intent" ? "Getting this test done outside?" : isCoach ? "Upload outside report" : "Upload your report"}
          </DialogTitle>
          <DialogDescription>
            {step === "intent"
              ? "No problem. Tell your coach you'll use your own lab — then upload the report here and we'll turn it into your charts and trends, exactly like an in-app test."
              : isCoach
                ? "Upload the report your client got done outside. Its values will be read automatically into their markers and charts."
                : "Upload the PDF or a clear photo of your report. Its values will be read automatically into your markers and graphs."}
          </DialogDescription>
        </DialogHeader>

        {step === "intent" ? (
          <div className="space-y-3">
            <div className="rounded-2xl bg-muted/50 ring-1 ring-border p-3 space-y-2 text-[12px] text-muted-foreground">
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Your coach is notified right away.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> Upload the report whenever it's ready.</p>
              <p className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" /> You'll see the same markers, deltas and body map.</p>
            </div>
            <Textarea
              rows={3}
              maxLength={500}
              placeholder="Anything your coach should know? (optional) — e.g. booked at my local lab for Sunday"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="resize-none rounded-xl"
            />
            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button onClick={confirmIntent} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                I'll do it outside
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lab name</label>
                <Input value={labName} onChange={(e) => setLabName(e.target.value)} maxLength={80} placeholder="e.g. Dr Lal PathLabs" className="mt-1 h-10 rounded-xl" />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Sample date</label>
                <Input type="date" value={collectedOn} onChange={(e) => setCollectedOn(e.target.value)} className="mt-1 h-10 rounded-xl" />
              </div>
            </div>

            <label className="block rounded-2xl border-2 border-dashed border-border p-4 text-center cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <Upload className="w-5 h-5 text-primary mx-auto" />
              <p className="text-sm font-bold mt-1.5">{file ? file.name : "Choose PDF or photo"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Max {MAX_MB} MB</p>
            </label>

            <Button onClick={handleUpload} disabled={busy || !file} className="w-full rounded-full">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
              Upload report
            </Button>

            {mine.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Uploaded</p>
                {mine.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl bg-muted/40 ring-1 ring-border p-2.5">
                    <FileText className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{r.file_name || "Report"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {r.lab_name ? `${r.lab_name} · ` : ""}
                         {r.status === "reviewed" ? "Values processed" : r.status === "processing" ? "Reading values…" : r.status === "parse_failed" ? "Could not read values" : "Uploaded"}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReport(r)} aria-label="Open report">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                    {r.status !== "reviewed" && (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeReport(r)} aria-label="Remove report">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
