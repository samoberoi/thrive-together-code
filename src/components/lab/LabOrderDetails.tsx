import { motion } from "framer-motion";
import {
  CalendarClock,
  KeyRound,
  Phone,
  UserCheck,
  ExternalLink,
  CheckCircle2,
  Circle,
  Loader2,
  Info,
  AlertTriangle,
  Copy,
  FileText,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type TrackStep = {
  status: string;
  statusText?: string;
  statusDescription?: string;
  comments?: string;
  timestamp?: string;
  attributes?: {
    progress?: number;
    isSubStatus?: boolean;
    is_completed?: boolean;
    is_current_status?: boolean;
  };
};

export interface LabOrderDetailsProps {
  order: {
    id?: string;
    thyrocare_order_id: string | null;
    thyrocare_lead_id: string | null;
    status: string | null;
    status_detail: string | null;
    beneficiary_name: string | null;
    beneficiary_age: number | null;
    beneficiary_gender: string | null;
    mobile: string | null;
    email: string | null;
    pincode: string | null;
    address: string | null;
    collection_date: string | null;
    collection_slot: string | null;
    amount: number | null;
    raw_response: any;
    created_at: string;
    product_codes?: string[] | null;
  };
  fastingRequired?: boolean;
  reports?: Array<{
    id: string;
    report_url: string | null;
    report_type: string | null;
    delivered_at?: string | null;
    parameters?: any;
  }>;
  userId?: string;
  onResultsSaved?: () => void;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtTimeRange(start?: string, end?: string) {
  if (!start) return null;
  return end ? `${start} – ${end}` : start;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(asText).filter(Boolean).join(" ") || null;
  }
  return null;
}

function firstUrl(value: unknown): string | null {
  const text = asText(value);
  return text?.match(/https?:\/\/\S+/)?.[0] || null;
}

function reportCommitmentText(value: unknown): string | null {
  const text = asText(value);
  if (text) return text;
  if (value && typeof value === "object" && "isReportDeliveredBefore" in value) {
    const minutes = Number((value as { earlyReportTimeInMinutes?: unknown }).earlyReportTimeInMinutes || 0);
    return minutes > 0 ? `${minutes} minutes earlier than standard time` : null;
  }
  return null;
}

function copy(text: string, label = "Copied") {
  try {
    navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Copy failed");
  }
}

export default function LabOrderDetails({ order, fastingRequired, reports = [], userId }: LabOrderDetailsProps) {
  const raw = order.raw_response || {};
  const otp = asText(raw.otp);
  const phlebo = raw.phlebo || {};
  const rawPhleboName = asText(phlebo?.name);
  const phleboName = rawPhleboName && !/unauth/i.test(rawPhleboName) ? rawPhleboName : null;
  const phleboPhone = asText(phlebo?.contactNumber);
  const appointmentDate = asText(raw.appointmentDate);
  const appt = raw.appointmentDetails || {};
  const apptStart = asText(appt?.startTimeIn24HrFormat) || undefined;
  const apptEnd = asText(appt?.endTimeIn24HrFormat) || undefined;
  const apptDateStr = asText(appt?.date) || undefined;
  const tracking: TrackStep[] = Array.isArray(raw.orderTracking) ? raw.orderTracking : [];
  const visibleTracking = tracking.filter((s) => !s.attributes?.isSubStatus || s.attributes?.is_current_status || s.attributes?.is_completed);
  const reportCommitment = reportCommitmentText(raw.getReportCommitment);
  const statusText = asText(raw.statusText) || asText(raw.status) || asText(order.status) || null;
  const statusDescription = asText(raw.statusDescription);
  const trackUrlMatch = firstUrl(raw.alertMessage);

  const statusLower = (order.status || "").toLowerCase();
  const isFailed = statusLower === "failed";
  // Sample is considered collected once any tracking step at/after SAMPLE_COLLECTED is done,
  // or order status reaches done/completed/in_lab/report stages.
  const collectedStatuses = ["sample_collected", "sample_received", "in_lab", "processing", "partially_ready", "ready", "done", "completed", "report_ready", "reports_ready"];
  const sampleCollected =
    collectedStatuses.includes(statusLower) ||
    tracking.some((s) => /sample.*collect|collected|in.?lab|ready|completed|done/i.test(s.status || "") && s.attributes?.is_completed);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-3"
    >
      {/* Header: Order ID + status */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
              Thyrocare Order
            </div>
            {order.thyrocare_order_id && (
              <button
                onClick={() => copy(order.thyrocare_order_id!, "Order ID copied")}
                className="mt-1 inline-flex items-center gap-1.5 font-mono text-lg font-black hover:opacity-80"
              >
                {order.thyrocare_order_id}
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
          <Badge
            variant={isFailed ? "destructive" : "default"}
            className="text-[10px] uppercase shrink-0"
          >
            {statusText || "Created"}
          </Badge>
        </div>
        {statusDescription && (
          <div className="text-xs text-muted-foreground mt-1">{statusDescription}</div>
        )}
      </div>

      {isFailed && order.status_detail && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>{order.status_detail.slice(0, 400)}</div>
        </div>
      )}

      {/* Appointment */}
      {(appointmentDate || apptDateStr) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarClock className="w-3.5 h-3.5 text-primary" />
            Sample Collection
          </div>
          <div className="text-base font-black">
            {fmtDateTime(appointmentDate) ||
              (apptDateStr
                ? new Date(apptDateStr).toLocaleDateString("en-IN", {
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : null)}
          </div>
          {fmtTimeRange(apptStart, apptEnd) && (
            <div className="text-sm text-muted-foreground">
              Slot: <span className="text-foreground font-semibold">{fmtTimeRange(apptStart, apptEnd)}</span>
            </div>
          )}
          {fastingRequired && (
            <div className="mt-2 rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs text-amber-700 dark:text-amber-300 flex gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div>
                <strong>Fasting required:</strong> No food or drinks (except water) for at least 10–11
                hrs before collection. Continue prescribed medications unless your doctor says
                otherwise.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reports — show inline once available */}
      {(reports.length > 0 || (sampleCollected && userId && order.id)) && (() => {
        // Split reports into ones with a downloadable file vs still-syncing/failed fetch.
        const ready = reports.filter((r) => !!r.report_url);
        const pending = reports.filter((r) => !r.report_url);
        return (
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
              <FileText className="w-3.5 h-3.5" />
              {ready.length > 0 ? "Lab Reports Ready" : "Lab Reports"}
            </div>
            {ready.length > 0 && (
              <ul className="space-y-2">
                {ready.map((r) => {
                  // Hide any vendor-error phrasing from the type label.
                  const rawType = (r.report_type || "").trim();
                  const label = /fail|error|not\s*found/i.test(rawType) ? "BBDO Lab Report" : rawType || "Lab Report";
                  return (
                    <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-background border border-border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{label}</div>
                        {r.delivered_at && (
                          <div className="text-[10px] text-muted-foreground">
                            Delivered {fmtDateTime(r.delivered_at)}
                          </div>
                        )}
                      </div>
                      <Button size="sm" asChild className="shrink-0 rounded-full">
                        <a href={r.report_url!} target="_blank" rel="noreferrer">
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          View
                        </a>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {ready.length === 0 && pending.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Your sample has been processed. The PDF is still syncing from the lab — usually within a few hours. Your health markers will appear here automatically once it arrives.
              </p>
            )}
            {ready.length === 0 && pending.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Sample is collected. Values sync to your profile automatically once the report PDF arrives.
              </p>
            )}
          </div>
        );
      })()}


      {/* OTP for technician — only before sample is collected */}
      {otp && !sampleCollected && (
        <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
            <KeyRound className="w-3.5 h-3.5" />
            Sample Collection OTP
          </div>
          <button
            onClick={() => copy(otp, "OTP copied")}
            className="text-3xl font-black tracking-[0.4em] tabular-nums hover:opacity-80 inline-flex items-center gap-2"
          >
            {otp}
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
          <p className="text-xs text-muted-foreground">
            Share this OTP with the Thyrocare technician at the time of sample collection.
          </p>
        </div>
      )}

      {/* Phlebotomist — hidden once sample is collected */}
      {(phleboName || phleboPhone) && !sampleCollected && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <UserCheck className="w-3.5 h-3.5 text-primary" />
            Assigned Technician
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{phleboName || "Technician"}</div>
              {phleboPhone && (
                <div className="text-xs text-muted-foreground font-mono">{phleboPhone}</div>
              )}
            </div>
            {phleboPhone && (
              <Button
                size="sm"
                asChild
                className="shrink-0 rounded-full"
              >
                <a href={`tel:${phleboPhone}`}>
                  <Phone className="w-3.5 h-3.5 mr-1.5" />
                  Call
                </a>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Tracking timeline */}
      {visibleTracking.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Order Tracking
          </div>
          <ol className="space-y-3">
            {visibleTracking.map((s, i) => {
              const done = !!s.attributes?.is_completed;
              const current = !!s.attributes?.is_current_status;
              const Icon = done && !current ? CheckCircle2 : current ? Loader2 : Circle;
              const stepTitle = asText(s.statusDescription) || asText(s.statusText) || asText(s.status) || "Order update";
              const stepComments = asText(s.comments);
              const stepTimestamp = asText(s.timestamp);
              return (
                <li key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        current
                          ? "text-primary animate-spin"
                          : done
                            ? "text-primary"
                            : "text-muted-foreground/40"
                      }`}
                    />
                    {i < visibleTracking.length - 1 && (
                      <div className={`w-px flex-1 mt-1 ${done ? "bg-primary/40" : "bg-border"}`} />
                    )}
                  </div>
                  <div className="pb-3 -mt-0.5 min-w-0 flex-1">
                    <div className={`text-sm font-semibold ${current ? "text-primary" : ""}`}>
                      {stepTitle}
                    </div>
                    {stepComments && (
                      <div className="text-xs text-muted-foreground mt-0.5">{stepComments}</div>
                    )}
                    {stepTimestamp && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {fmtDateTime(stepTimestamp)}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Tracking link / report commitment */}
      {(trackUrlMatch || reportCommitment) && (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
          {reportCommitment && (
            <div className="text-xs">
              <span className="text-muted-foreground">Reports expected by: </span>
              <span className="font-semibold">{reportCommitment}</span>
            </div>
          )}
          {trackUrlMatch && (
            <Button asChild variant="outline" size="sm" className="w-full rounded-xl">
              <a href={trackUrlMatch} target="_blank" rel="noreferrer">
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Track on Thyrocare
              </a>
            </Button>
          )}
        </div>
      )}

      {/* Beneficiary + address summary */}
      <details className="rounded-2xl border border-border bg-card p-4 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-semibold">
          Booking details
        </summary>
        <dl className="mt-3 space-y-1.5">
          {order.beneficiary_name && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Beneficiary</dt>
              <dd>{[order.beneficiary_name, order.beneficiary_age, order.beneficiary_gender].filter(Boolean).join(" · ")}</dd>
            </div>
          )}
          {order.mobile && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Mobile</dt>
              <dd className="font-mono">{order.mobile}</dd>
            </div>
          )}
          {order.email && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate max-w-[60%] text-right">{order.email}</dd>
            </div>
          )}
          {(order.address || order.pincode) && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Address</dt>
              <dd className="text-right max-w-[60%]">{[order.address, order.pincode].filter(Boolean).join(", ")}</dd>
            </div>
          )}
          {order.amount != null && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">₹{Number(order.amount).toLocaleString("en-IN")}</dd>
            </div>
          )}
          {order.thyrocare_lead_id && (
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Lead ID</dt>
              <dd className="font-mono">{order.thyrocare_lead_id}</dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Booked at</dt>
            <dd>{new Date(order.created_at).toLocaleString("en-IN")}</dd>
          </div>
        </dl>
      </details>
    </motion.div>
  );
}
