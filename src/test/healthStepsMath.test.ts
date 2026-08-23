import { describe, expect, it } from "vitest";
import {
  clipRecordsToRange,
  startOfLocalDay,
  sumStepsDeduped,
  sanitizeDailySteps,
  MAX_DAILY_STEPS,
} from "@/lib/healthStepsMath";

const rec = (startTime: string, endTime: string, count: number, origin = "com.samsung.health") => ({
  startTime,
  endTime,
  count,
  metadata: { dataOrigin: origin },
});

describe("step math is timezone-agnostic", () => {
  it("startOfLocalDay is local midnight on the device", () => {
    const now = new Date();
    const s = startOfLocalDay(now);
    expect(s.getHours()).toBe(0);
    expect(s.getMinutes()).toBe(0);
    expect(s.getDate()).toBe(now.getDate());
    expect(s.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("counts records written with any zone offset, as long as the instant is today", () => {
    // Same absolute instant, expressed three different ways.
    const start = startOfLocalDay();
    const midMorning = new Date(start.getTime() + 9 * 3600_000);
    const noon = new Date(start.getTime() + 12 * 3600_000);
    const now = new Date(start.getTime() + 13 * 3600_000);

    const records = [
      rec(midMorning.toISOString(), noon.toISOString(), 4000), // UTC "Z" form
      rec(
        new Date(midMorning).toString() as any, // locale form
        new Date(noon).toString() as any,
        0,
      ),
    ];
    const scoped = clipRecordsToRange(records, start, now);
    expect(sumStepsDeduped(scoped)).toBe(4000);
  });

  it("pro-rates a record that straddles local midnight", () => {
    const start = startOfLocalDay();
    const now = new Date(start.getTime() + 6 * 3600_000);
    // 22:00 yesterday -> 02:00 today = 4h span, 2h inside today.
    const records = [
      rec(
        new Date(start.getTime() - 2 * 3600_000).toISOString(),
        new Date(start.getTime() + 2 * 3600_000).toISOString(),
        1000,
      ),
    ];
    const scoped = clipRecordsToRange(records, start, now);
    expect(scoped[0].count).toBe(500);
  });

  it("drops records entirely outside today", () => {
    const start = startOfLocalDay();
    const now = new Date(start.getTime() + 6 * 3600_000);
    const records = [
      rec(
        new Date(start.getTime() - 30 * 3600_000).toISOString(),
        new Date(start.getTime() - 26 * 3600_000).toISOString(),
        9999,
      ),
    ];
    expect(clipRecordsToRange(records, start, now)).toHaveLength(0);
  });

  it("de-dupes multiple contributing apps instead of summing them", () => {
    const start = startOfLocalDay();
    const now = new Date(start.getTime() + 8 * 3600_000);
    const a = new Date(start.getTime() + 1 * 3600_000).toISOString();
    const b = new Date(start.getTime() + 2 * 3600_000).toISOString();
    const records = [
      rec(a, b, 3000, "com.google.android.apps.fitness"),
      rec(a, b, 3100, "com.samsung.health"),
    ];
    const scoped = clipRecordsToRange(records, start, now);
    expect(sumStepsDeduped(scoped)).toBe(3100);
  });
});

describe("inflated counts are impossible", () => {
  it("does not double-count an aggregate record plus its detail records", () => {
    const start = startOfLocalDay();
    const now = new Date(start.getTime() + 8 * 3600_000);
    const h = (n: number) => new Date(start.getTime() + n * 3600_000).toISOString();
    const records = [
      rec(h(1), h(4), 6000), // daily/session aggregate
      rec(h(1), h(2), 2000), // detail records inside it
      rec(h(2), h(3), 2000),
      rec(h(3), h(4), 2000),
    ];
    const scoped = clipRecordsToRange(records, start, now);
    expect(sumStepsDeduped(scoped)).toBe(6000);
  });

  it("clamps impossible daily totals", () => {
    expect(sanitizeDailySteps(208663)).toBe(MAX_DAILY_STEPS);
    expect(sanitizeDailySteps(8290)).toBe(8290);
    expect(sanitizeDailySteps(-5)).toBe(0);
  });
});

describe("cross-source merge matches the OS widget", () => {
  it("keeps watch-only and phone-only stretches instead of picking one origin", () => {
    const start = startOfLocalDay();
    const h = (n: number) => new Date(start.getTime() + n * 3600_000).toISOString();
    const records = [
      // Watch recorded the morning only.
      rec(h(6), h(9), 6000, "com.watch.bridge"),
      // Phone recorded morning (lower) + the evening walk the watch missed.
      rec(h(6), h(9), 5000, "com.android.phone.sensor"),
      rec(h(18), h(20), 4000, "com.android.phone.sensor"),
    ];
    // Morning: max(6000, 5000) = 6000. Evening: 4000. Total 10000.
    expect(sumStepsDeduped(records)).toBe(10000);
  });

  it("still refuses to sum the same walk reported by two apps", () => {
    const start = startOfLocalDay();
    const h = (n: number) => new Date(start.getTime() + n * 3600_000).toISOString();
    expect(
      sumStepsDeduped([
        rec(h(1), h(2), 3000, "a"),
        rec(h(1), h(2), 3100, "b"),
      ]),
    ).toBe(3100);
  });
});
