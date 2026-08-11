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
 * Health Connect returns raw Steps records from every contributing app
 * (Google Fit, Samsung Health, phone sensor, Fitbit, etc.). Summing across
 * sources double- or triple-counts steps. Group by dataOrigin and use the
 * single largest source as the authoritative count for the range.
 */
export function sumStepsDeduped(records: any[] | null): number | undefined {
  if (!records || records.length === 0) return undefined;
  const perOrigin = new Map<string, number>();
  for (const r of records) {
    const key = originOf(r);
    perOrigin.set(key, (perOrigin.get(key) ?? 0) + Number(r?.count ?? 0));
  }
  let max = 0;
  for (const v of perOrigin.values()) if (v > max) max = v;
  return max;
}

export function sumField(records: any[] | null, key: string): number | undefined {
  if (!records || records.length === 0) return undefined;
  return records.reduce((acc, r) => acc + Number(r?.[key] ?? 0), 0);
}
