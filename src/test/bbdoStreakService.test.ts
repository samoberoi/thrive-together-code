import { describe, expect, it } from "vitest";
import { calculateFiveOfSevenDayStreak } from "@/lib/bbdoStreakService";

function streak(activeDays: string[], today: string, startDate = "2026-08-01") {
  const active = new Set(activeDays);
  return calculateFiveOfSevenDayStreak(startDate, today, (day) => active.has(day));
}

describe("BBDO 5-of-7 daily streak", () => {
  it("keeps a ten-day streak with eight active and two rest days", () => {
    expect(streak([
      "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-05",
      "2026-08-06", "2026-08-07", "2026-08-08", "2026-08-10",
    ], "2026-08-10")).toBe(10);
  });

  it("breaks the run when a rolling seven-day window has fewer than five active days", () => {
    expect(streak([
      "2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04",
      "2026-08-08", "2026-08-09", "2026-08-10",
    ], "2026-08-10")).toBe(4);
  });

  it("returns zero when there has been no qualifying active day", () => {
    expect(streak([], "2026-08-05")).toBe(0);
  });
});