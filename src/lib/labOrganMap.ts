/**
 * Marker → organ mapping for the Body Investigation Map.
 * Values are chosen so patients see their lab markers grouped by the organ
 * whose function they primarily reflect. Anything unmapped falls into "other".
 */
import type { LabParameter, LabResult } from "@/lib/labResultsService";

export type OrganSlug =
  | "brain"
  | "thyroid"
  | "heart"
  | "lungs"
  | "liver"
  | "pancreas"
  | "kidneys"
  | "blood"
  | "bones"
  | "other";

export type MarkerStatus = "normal" | "out_of_range" | "critical" | "no_data";

export interface Organ {
  slug: OrganSlug;
  label: string;
  short: string;
  /** Position on the anatomy illustration in percent (0–100). */
  x: number;
  y: number;
}

/**
 * Coordinates are tuned to the generated `src/assets/body-anatomy.png` (768×1600).
 * They are percent of the intrinsic image box; a container that preserves the
 * aspect ratio will keep hotspots aligned.
 */
export const ORGANS: Organ[] = [
  { slug: "brain",    label: "Brain",         short: "Brain",   x: 50,   y: 8   },
  { slug: "thyroid",  label: "Thyroid",       short: "Thyroid", x: 50,   y: 19  },
  { slug: "lungs",    label: "Lungs",         short: "Lungs",   x: 38,   y: 27  },
  { slug: "heart",    label: "Heart",         short: "Heart",   x: 53,   y: 29  },
  { slug: "liver",    label: "Liver",         short: "Liver",   x: 42,   y: 37  },
  { slug: "pancreas", label: "Pancreas",      short: "Pancreas", x: 55,  y: 40  },
  { slug: "kidneys",  label: "Kidneys",       short: "Kidneys", x: 62,   y: 40  },
  { slug: "blood",    label: "Blood / Marrow", short: "Blood",  x: 30,   y: 22  },
  { slug: "bones",    label: "Bones",         short: "Bones",   x: 50,   y: 62  },
];

/** Group-name → organ. Keys are compared case-insensitive. */
const GROUP_TO_ORGAN: Record<string, OrganSlug> = {
  "complete hemogram": "blood",
  "iron deficiency": "blood",
  "lipid": "heart",
  "liver": "liver",
  "renal": "kidneys",
  "complete urine analysis": "kidneys",
  "thyroid": "thyroid",
  "diabetes": "pancreas",
  "wellness": "other", // handled per-code below
};

/** Specific parameter codes that override the group mapping. */
const CODE_TO_ORGAN: Record<string, OrganSlug> = {
  // Diabetes markers → pancreas
  HBA: "pancreas", HBA1C: "pancreas", ABG: "pancreas",
  FBS: "pancreas", INSF: "pancreas", INSFA: "pancreas", HOMA: "pancreas", HOMIR: "pancreas",
  // Bone markers → bones
  CALC: "bones", VITD: "bones", VITD3: "bones", VITDC: "bones", "25OHD": "bones",
  ALKP: "bones", ALP: "bones",
  // Vitamin B12 / brain
  VITB12: "brain", B12: "brain", VITB: "brain",
  // Heart-related inflammation & lipids extras
  HSCRP: "heart", CRP: "heart",
  // Kidneys extras
  UREA: "kidneys", BUN: "kidneys", SCRE: "kidneys", URIC: "kidneys",
  UCRE: "kidneys", UALB: "kidneys", UACR: "kidneys", EGFR: "kidneys",
  // Liver ratio
  OTPT: "liver",
  // Ferritin lives with blood
  FERR: "blood",
};


export function organForParameter(p: Pick<LabParameter, "code" | "group_name">): OrganSlug {
  const code = (p.code || "").toUpperCase();
  if (CODE_TO_ORGAN[code]) return CODE_TO_ORGAN[code];
  const group = (p.group_name || "").toLowerCase().trim();
  return GROUP_TO_ORGAN[group] ?? "other";
}

/** Compute a status for a single result, respecting the parameter's direction. */
export function statusFor(result: LabResult | undefined, param?: LabParameter): MarkerStatus {
  if (!result) return "no_data";
  const v = result.value_numeric;
  if (v == null) return result.value_text ? "normal" : "no_data";
  const low = result.ref_low ?? param?.ref_low ?? null;
  const high = result.ref_high ?? param?.ref_high ?? null;
  const dir = param?.direction ?? "in_range";

  const critical = (delta: number, base: number) => Math.abs(delta) / Math.max(Math.abs(base), 1) >= 0.2;

  if (dir === "higher_better" && low != null) {
    if (v >= low) return "normal";
    return critical(low - v, low) ? "critical" : "out_of_range";
  }
  if (dir === "lower_better" && high != null) {
    if (v <= high) return "normal";
    return critical(v - high, high) ? "critical" : "out_of_range";
  }
  if (low != null && v < low) {
    return critical(low - v, low) ? "critical" : "out_of_range";
  }
  if (high != null && v > high) {
    return critical(v - high, high) ? "critical" : "out_of_range";
  }
  if (low == null && high == null) return "normal";
  return "normal";
}

const RANK: Record<MarkerStatus, number> = { no_data: 0, normal: 1, out_of_range: 2, critical: 3 };
export function worstStatus(list: MarkerStatus[]): MarkerStatus {
  return list.reduce<MarkerStatus>((worst, s) => (RANK[s] > RANK[worst] ? s : worst), "no_data");
}

export const STATUS_COLOR: Record<MarkerStatus, { dot: string; text: string; bg: string; label: string }> = {
  normal:       { dot: "#10B981", text: "text-[#10B981]", bg: "bg-[#10B981]/10", label: "Normal" },
  out_of_range: { dot: "#F59E0B", text: "text-[#F59E0B]", bg: "bg-[#F59E0B]/10", label: "Out of range" },
  critical:     { dot: "#E00101", text: "text-[#E00101]", bg: "bg-[#E00101]/10", label: "Critical" },
  no_data:      { dot: "#94A3B8", text: "text-muted-foreground", bg: "bg-muted", label: "No data" },
};
