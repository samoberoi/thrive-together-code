/**
 * Pure, timezone-agnostic helpers for Health Connect / HealthKit step math.
 *
 * All comparisons happen on absolute epoch milliseconds, so the device's local
 * timezone (IST, EST, anything) is respected automatically: "today" is derived
 * from the device clock via startOfLocalDay(), and record timestamps are
 * absolute instants regardless of the offset string the provider wrote.
 */

/** Local midnight on the device, whatever timezone the device is set to. */
export function startOfLocalDay(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function originOf(r: any): string {
  return String(
    r?.metadata?.dataOrigin?.packageName ??
      r?.metadata?.dataOrigin ??
      r?.dataOrigin?.packageName ??
      r?.dataOrigin ??
      "unknown",
  );
}

function ms(v: any): number {
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Keep only the portion of each record that falls inside [start, end].
 * Records that straddle local midnight (common with watch bridges that write
 * long spans) are pro-rated instead of being dropped entirely.
 */
export function clipRecordsToRange(records: any[], start: Date, end: Date): any[] {
  const s = start.getTime();
  const e = end.getTime();
  const out: any[] = [];
  for (const r of records ?? []) {
    const rs = ms(r?.startTime);
    const re = ms(r?.endTime ?? r?.startTime);
    const count = Number(r?.count ?? 0);
    if (!Number.isFinite(rs) || !Number.isFinite(re) || count <= 0) continue;
    const os = Math.max(rs, s);
    const oe = Math.min(re, e);
    if (oe <= os) continue;
    const span = Math.max(1, re - rs);
    const ratio = Math.min(1, (oe - os) / span);
    out.push({ ...r, count: Math.round(count * ratio) });
  }
  return out;
}

/**
 * Physiological ceiling for one day. Anything above this is a provider bug
 * (aggregate + detail records counted twice, a lifetime total written as one
 * record, etc.) and must never reach the UI or the database.
 */
export const MAX_DAILY_STEPS = 60000;

/**
 * Health Connect / HealthKit return raw Steps records from every contributing
 * app (Google Fit, Samsung Health, phone sensor, watch bridge...). Two things
 * cause inflated counts:
 *   1. Summing across sources (each source reports the same walk).
 *   2. Summing overlapping records from the SAME source — Samsung/Fitbit write
 *      a session/daily total record *and* the minute-level records inside it.
 * So: group by origin, and inside each origin only count time that is not
 * already covered by an earlier record. Then take the single largest origin.
 */
export function sumStepsDeduped(records: any[] | null): number | undefined {
  if (!records || records.length === 0) return undefined;

  const byOrigin = new Map<string, any[]>();
  for (const r of records) {
    const key = originOf(r);
    const list = byOrigin.get(key) ?? [];
    list.push(r);
    byOrigin.set(key, list);
  }

  let max = 0;
  for (const list of byOrigin.values()) {
    const sorted = list
      .map((r) => {
        const s = ms(r?.startTime);
        const e = ms(r?.endTime ?? r?.startTime);
        return { s, e: Number.isFinite(e) && e > s ? e : s + 1, count: Number(r?.count ?? 0) };
      })
      .filter((r) => Number.isFinite(r.s) && r.count > 0)
      // Longest (aggregate) records first at the same start so their details
      // (contained minute records) are skipped as already-covered.
      .sort((a, b) => a.s - b.s || b.e - a.e);

    let total = 0;
    let coveredUntil = -Infinity;
    for (const r of sorted) {
      if (r.e <= coveredUntil) continue; // fully inside an already-counted record
      const span = Math.max(1, r.e - r.s);
      const uncovered = Math.min(span, r.e - Math.max(r.s, coveredUntil));
      total += Math.round(r.count * (uncovered / span));
      coveredUntil = Math.max(coveredUntil, r.e);
    }
    if (total > max) max = total;
  }
  return max;
}

/** Clamp a daily step count to a believable range (0..MAX_DAILY_STEPS). */
export function sanitizeDailySteps(steps: number | null | undefined): number {
  const n = Number(steps ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_DAILY_STEPS, Math.round(n));
}


export function sumField(records: any[] | null, key: string): number | undefined {
  if (!records || records.length === 0) return undefined;
  return records.reduce((acc, r) => acc + Number(r?.[key] ?? 0), 0);
}
